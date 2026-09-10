import prisma from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library.js';
import {
  calculateCartTotals,
  calculateCashChange,
  validatePayment,
  isDiscountAllowed,
  toDecimal,
  roundCurrency,
  type CartItem,
} from './calculationService.js';
import { createSale, type CreateSaleInput } from './saleService.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CheckoutCartInput {
  businessId: string;
  branchId: string;
  cashierId: string;
  shiftId?: string;
  customerId?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
    overridePrice?: number;
    overrideReason?: string;
  }>;
  payments: Array<{
    paymentMethod: string;
    amount: number;
    referenceNumber?: string;
    cashReceived?: number;
  }>;
  saleDiscount?: {
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: number;
  };
  idempotencyKey?: string;
  notes?: string;
}

export interface CheckoutValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate checkout input before processing
 */
export async function validateCheckout(
  input: CheckoutCartInput
): Promise<CheckoutValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.branchId) {
    errors.push('Branch is required to complete checkout');
    return { isValid: false, errors, warnings };
  }

  if (!input.items || input.items.length === 0) {
    errors.push('Cart is empty');
    return { isValid: false, errors, warnings };
  }

  for (const item of input.items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, businessId: input.businessId },
      include: { variants: true },
    });

    if (!product) {
      errors.push(`Product ${item.productId} not found`);
      continue;
    }

    if (!product.isActive) {
      errors.push(`Product ${product.name} is inactive`);
      continue;
    }

    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId);
      if (!variant) {
        errors.push(`Variant ${item.variantId} not found for product ${product.name}`);
        continue;
      }
      if (!variant.isActive) {
        errors.push(`Variant ${variant.name} is inactive`);
        continue;
      }

      if (item.overridePrice !== undefined) {
        const originalPrice = toDecimal(variant.sellingPrice);
        const overridePrice = toDecimal(item.overridePrice);
        if (overridePrice.lessThan(0)) {
          errors.push(`Override price cannot be negative for ${variant.name}`);
        }
        if (overridePrice.greaterThan(originalPrice.times(2))) {
          warnings.push(`Override price is more than double the original price for ${variant.name}`);
        }
      }
    }

    if (item.quantity <= 0) {
      errors.push(`Quantity must be greater than zero for ${product.name}`);
    }

    const inventory = await prisma.inventory.findFirst({
      where: {
        businessId: input.businessId,
        branchId: input.branchId,
        productId: item.productId,
        variantId: item.variantId || null,
      },
    });

    if (inventory) {
      const available = toDecimal(inventory.currentQuantity).minus(
        toDecimal(inventory.reservedQuantity)
      );
      if (available.lessThan(item.quantity)) {
        errors.push(`Insufficient stock for ${product.name}: only ${available.toFixed(2)} available`);
      }
    }
  }

  const validPaymentMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
  for (const payment of input.payments) {
    if (!validPaymentMethods.includes(payment.paymentMethod)) {
      errors.push(`Invalid payment method: ${payment.paymentMethod}`);
    }
    if (payment.amount <= 0) {
      errors.push('Payment amount must be greater than zero');
    }
    if (payment.paymentMethod === 'CASH') {
      if (!payment.cashReceived) {
        errors.push('Cash received is required for cash payments');
      } else if (payment.cashReceived < payment.amount) {
        errors.push('Cash received must be at least equal to payment amount');
      }
    }
  }

  if (input.saleDiscount) {
    if (input.saleDiscount.discountType === 'PERCENTAGE') {
      if (input.saleDiscount.discountValue < 0 || input.saleDiscount.discountValue > 100) {
        errors.push('Percentage discount must be between 0 and 100');
      }
    } else if (input.saleDiscount.discountType === 'FIXED') {
      if (input.saleDiscount.discountValue < 0) {
        errors.push('Fixed discount cannot be negative');
      }
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Process checkout
 */
export async function processCheckout(
  input: CheckoutCartInput,
  ipAddress?: string,
  userAgent?: string
) {
  const validation = await validateCheckout(input);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  const cartItems: CartItem[] = [];
  const saleItems: CreateSaleInput['items'] = [];

  for (const item of input.items) {
    let unitPrice: Decimal;
    let originalPrice: Decimal | undefined;

    if (item.variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) throw new Error(`Variant ${item.variantId} not found`);
      unitPrice = toDecimal(variant.sellingPrice);
    } else {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Product ${item.productId} not found`);
      unitPrice = toDecimal(product.sellingPrice);
    }

    if (item.overridePrice !== undefined) {
      originalPrice = unitPrice;
      unitPrice = toDecimal(item.overridePrice);
      await createAuditLog({
        businessId: input.businessId,
        userId: input.cashierId,
        action: AuditActions.PRICE_CHANGED,
        entityType: 'sale_item',
        newValues: {
          productId: item.productId,
          variantId: item.variantId,
          originalPrice: originalPrice.toFixed(2),
          overridePrice: unitPrice.toFixed(2),
          reason: item.overrideReason,
        },
        ipAddress,
        userAgent,
      });
    }

    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    let itemDiscountAmount = toDecimal(item.discountAmount || 0);

    if (item.discountAmount && product && product.discountAllowed) {
      const baseAmount = unitPrice.times(item.quantity);
      if (!isDiscountAllowed(itemDiscountAmount, baseAmount, product.maxDiscountPercent)) {
        throw new Error(`Discount exceeds maximum allowed (${product.maxDiscountPercent}%) for ${product.name}`);
      }
    } else if (item.discountAmount && product && !product.discountAllowed) {
      throw new Error(`Discounts are not allowed for ${product.name}`);
    }

    let taxAmount = new Decimal(0);
    if (product?.taxEnabled && product.taxRate) {
      const taxableAmount = unitPrice.times(item.quantity).minus(itemDiscountAmount);
      taxAmount = taxableAmount.times(toDecimal(product.taxRate).dividedBy(100));
    }

    const lineTotal = unitPrice.times(item.quantity).minus(itemDiscountAmount).plus(taxAmount);

    cartItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice,
      discountAmount: itemDiscountAmount,
      taxRate: product?.taxEnabled && product.taxRate ? product.taxRate : undefined,
    });

    saleItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: Number(unitPrice),
      discountAmount: Number(itemDiscountAmount),
      taxAmount: Number(taxAmount),
      lineTotal: Number(lineTotal),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      overrideReason: item.overrideReason,
    });
  }

  const calculation = calculateCartTotals(cartItems);
  let saleDiscountAmount = new Decimal(0);
  let finalTotal = calculation.total;

  if (input.saleDiscount) {
    saleDiscountAmount = input.saleDiscount.discountType === 'PERCENTAGE'
      ? calculation.subtotal.times(toDecimal(input.saleDiscount.discountValue).dividedBy(100))
      : toDecimal(input.saleDiscount.discountValue);
    finalTotal = calculation.total.minus(saleDiscountAmount);
  }

  const subtotal = roundCurrency(calculation.subtotal);
  const discountAmount = roundCurrency(calculation.discountAmount.plus(saleDiscountAmount));
  const taxAmount = roundCurrency(calculation.taxAmount);
  const total = roundCurrency(finalTotal);

  const paymentsWithChange = input.payments.map(payment => {
    if (payment.paymentMethod === 'CASH' && payment.cashReceived) {
      const { change, isValid } = calculateCashChange(total, payment.cashReceived);
      if (!isValid) throw new Error('Insufficient cash received');
      return { ...payment, cashChange: Number(roundCurrency(change)) };
    }
    return payment;
  });

  const paymentValidation = validatePayment(total, paymentsWithChange);
  
  // Handle credit sales (when payment is less than total and customer is provided)
  let outstandingAmount = new Decimal(0);
  let amountPaid = total;
  
  if (input.customerId && paymentValidation.remaining.greaterThan(0)) {
    // This is a credit sale
    outstandingAmount = paymentValidation.remaining;
    amountPaid = paymentValidation.paidAmount;
    
    // Validate customer credit limit
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
    });
    
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    if (customer.status !== 'ACTIVE') {
      throw new Error('Cannot create credit sale for inactive customer');
    }
    
    const creditLimit = toDecimal(customer.creditLimit);
    const currentBalance = toDecimal(customer.currentBalance);
    const newBalance = currentBalance.plus(outstandingAmount);
    
    if (creditLimit.equals(0)) {
      throw new Error('Customer has no credit limit configured');
    }
    
    if (newBalance.greaterThan(creditLimit)) {
      throw new Error(
        `Credit limit exceeded. Current balance: Rs. ${currentBalance.toFixed(2)}, ` +
        `Credit limit: Rs. ${creditLimit.toFixed(2)}, ` +
        `Requested credit: Rs. ${outstandingAmount.toFixed(2)}`
      );
    }
  } else if (!paymentValidation.isValid) {
    // No customer provided and payment is insufficient - reject
    throw new Error(`Payment shortfall: ${paymentValidation.remaining.toFixed(2)}`);
  }

  const sale = await createSale({
    businessId: input.businessId,
    branchId: input.branchId,
    cashierId: input.cashierId,
    shiftId: input.shiftId,
    customerId: input.customerId,
    items: saleItems,
    payments: paymentsWithChange,
    subtotal: Number(subtotal),
    discountAmount: Number(discountAmount),
    discountType: input.saleDiscount?.discountType,
    discountValue: input.saleDiscount?.discountValue,
    taxAmount: Number(taxAmount),
    total: Number(total),
    amountPaid: Number(amountPaid),
    outstandingAmount: Number(outstandingAmount),
    idempotencyKey: input.idempotencyKey,
    notes: input.notes,
  }, ipAddress, userAgent);

  logger.info('Checkout completed', {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    total: total.toFixed(2),
    businessId: input.businessId,
  });

  return { sale, validation: { warnings: validation.warnings } };
}

/**
 * Get checkout preview
 */
export async function getCheckoutPreview(input: CheckoutCartInput) {
  const validation = await validateCheckout(input);
  const cartItems: CartItem[] = [];

  for (const item of input.items) {
    let unitPrice: Decimal;
    if (item.variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) continue;
      unitPrice = toDecimal(item.overridePrice || variant.sellingPrice);
    } else {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;
      unitPrice = toDecimal(item.overridePrice || product.sellingPrice);
    }
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    cartItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice,
      discountAmount: item.discountAmount,
      taxRate: product?.taxEnabled && product.taxRate ? product.taxRate : undefined,
    });
  }

  const calculation = calculateCartTotals(cartItems);
  let saleDiscountAmount = new Decimal(0);
  let finalTotal = calculation.total;

  if (input.saleDiscount) {
    saleDiscountAmount = input.saleDiscount.discountType === 'PERCENTAGE'
      ? calculation.subtotal.times(toDecimal(input.saleDiscount.discountValue).dividedBy(100))
      : toDecimal(input.saleDiscount.discountValue);
    finalTotal = calculation.total.minus(saleDiscountAmount);
  }

  return {
    isValid: validation.isValid,
    errors: validation.errors,
    warnings: validation.warnings,
    subtotal: roundCurrency(calculation.subtotal),
    discountAmount: roundCurrency(calculation.discountAmount.plus(saleDiscountAmount)),
    taxAmount: roundCurrency(calculation.taxAmount),
    total: roundCurrency(finalTotal),
  };
}
