import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { toDecimal, validateSalePayments, validateCustomerCredit } from './calculationService.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';

export interface CreateSaleInput {
  businessId: string;
  branchId: string;
  cashierId: string;
  shiftId?: string;
  customerId?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxAmount?: number;
    lineTotal: number;
    originalPrice?: number;
    overrideReason?: string;
  }>;
  payments: Array<{
    paymentMethod: string;
    amount: number;
    referenceNumber?: string;
    cashReceived?: number;
    cashChange?: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  discountType?: string;
  discountValue?: number;
  taxAmount?: number;
  total: number;
  amountPaid?: number;
  outstandingAmount?: number;
  idempotencyKey?: string;
  notes?: string;
}

/**
 * Generate next sale number
 */
async function generateSaleNumber(businessId: string, db: typeof prisma): Promise<string> {
  const latest = await db.sale.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { saleNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.saleNumber.match(/SALE-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `SALE-${String(next).padStart(6, '0')}`;
}

/**
 * Create a completed sale
 *
 * H1: supports full payment, partial payment and full credit sales.
 * The financial invariant `total = amountPaid + outstandingAmount` is
 * derived here from the tendered payment lines (Decimal arithmetic) rather
 * than trusted from the caller, so it can never silently diverge. A credit
 * portion (outstanding > 0) requires a customer and is validated against
 * the shared credit rules (status, credit limit) inside the transaction —
 * any failure rolls back the complete sale (items, payments, inventory,
 * movements, ledger and customer balance).
 */
export async function createSale(
  input: CreateSaleInput,
  ipAddress?: string,
  userAgent?: string,
  deps?: {
    prisma?: typeof prisma;
    audit?: typeof createAuditLog;
  }
) {
  const db = deps?.prisma ?? prisma;
  const audit = deps?.audit ?? createAuditLog;

  // Check for idempotency - prevent duplicate sales
  if (input.idempotencyKey) {
    const existing = await db.sale.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      throw new Error('Duplicate sale submission detected');
    }
  }

  // Validate branch
  const branch = await db.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  // Validate cashier
  const cashier = await db.user.findFirst({
    where: { id: input.cashierId, businessId: input.businessId, isActive: true },
  });

  if (!cashier) {
    throw new Error('Cashier not found or inactive');
  }

  // Validate items exist and are active
  for (const item of input.items) {
    const product = await db.product.findFirst({
      where: { id: item.productId, businessId: input.businessId, isActive: true },
    });

    if (!product) {
      throw new Error(`Product ${item.productId} not found or inactive`);
    }

    if (item.variantId) {
      const variant = await db.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId, isActive: true },
      });

      if (!variant) {
        throw new Error(`Variant ${item.variantId} not found or inactive`);
      }
    }

    if (item.quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }
  }

  // Validate payment methods
  const validPaymentMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
  for (const payment of input.payments) {
    if (!validPaymentMethods.includes(payment.paymentMethod)) {
      throw new Error(`Invalid payment method: ${payment.paymentMethod}`);
    }

    if (payment.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    if (payment.paymentMethod === 'CASH') {
      if (!payment.cashReceived || payment.cashReceived < payment.amount) {
        throw new Error('Cash received must be at least equal to payment amount');
      }
    }
  }

  // H1: derive the authoritative paid/outstanding breakdown from the
  // tendered payment lines (Decimal-only). Rejects overpayment (only cash
  // change supports handing over more money than the total) and keeps the
  // invariant total = amountPaid + outstandingAmount.
  const paymentBreakdown = validateSalePayments(input.total, input.payments);
  if (paymentBreakdown.error) {
    throw new Error(paymentBreakdown.error);
  }
  const amountPaid = paymentBreakdown.paidAmount;
  const outstandingAmount = paymentBreakdown.outstandingAmount;

  // Caller-supplied values (if any) must agree with the tendered payments —
  // prevents any caller from writing inconsistent financial records.
  if (input.amountPaid !== undefined && !toDecimal(input.amountPaid).equals(amountPaid)) {
    throw new Error('amountPaid does not match the tendered payment lines for this sale');
  }
  if (input.outstandingAmount !== undefined && !toDecimal(input.outstandingAmount).equals(outstandingAmount)) {
    throw new Error('outstandingAmount does not match the tendered payment lines for this sale');
  }

  // Credit portion requires a customer account (validated against credit
  // rules inside the transaction below, immediately before the ledger write).
  if (outstandingAmount.greaterThan(0) && !input.customerId) {
    throw new Error('A customer account is required for partial payment or credit sales');
  }

  // Generate sale number
  const saleNumber = await generateSaleNumber(input.businessId, db);

  // Create sale in a transaction
  const sale = await db.$transaction(async (tx) => {
    // Create sale
    const newSale = await tx.sale.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        saleNumber,
        saleDate: new Date(),
        status: 'COMPLETED',
        subtotal: input.subtotal,
        discountAmount: input.discountAmount || 0,
        discountType: input.discountType,
        discountValue: input.discountValue,
        taxAmount: input.taxAmount || 0,
        total: input.total,
        amountPaid,
        outstandingAmount,
        customerId: input.customerId,
        cashierId: input.cashierId,
        shiftId: input.shiftId,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal: item.lineTotal,
            originalPrice: item.originalPrice,
            overrideReason: item.overrideReason,
          })),
        },
        payments: {
          create: input.payments.map((payment) => ({
            paymentMethod: payment.paymentMethod,
            amount: payment.amount,
            referenceNumber: payment.referenceNumber,
            cashReceived: payment.cashReceived,
            cashChange: payment.cashChange,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: true,
        cashier: { select: { id: true, username: true, fullName: true } },
      },
    });

    // Update inventory for each item
    for (const item of input.items) {
      const inventory = await tx.inventory.findFirst({
        where: {
          businessId: input.businessId,
          branchId: input.branchId,
          productId: item.productId,
          variantId: item.variantId || null,
        },
      });

      if (!inventory) {
        throw new Error(`Inventory not found for product ${item.productId}`);
      }

      const currentQty = toDecimal(inventory.currentQuantity);
      const newQty = currentQty.minus(toDecimal(item.quantity));

      if (newQty.lessThan(0)) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }

      // Update inventory
      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          currentQuantity: newQty,
          lastMovementAt: new Date(),
        },
      });

      // Create stock movement
      await tx.stockMovement.create({
        data: {
          businessId: input.businessId,
          branchId: input.branchId,
          inventoryId: inventory.id,
          productId: item.productId,
          variantId: item.variantId,
          movementType: 'SALE',
          quantity: -item.quantity, // Negative for sale
          previousQuantity: currentQty,
          resultingQuantity: newQty,
          referenceType: 'sale',
          referenceId: newSale.id,
          reason: `Sale ${saleNumber}`,
          performedBy: input.cashierId,
        },
      });
    }

    // Create ledger entry for credit sales (H1: outstanding is the derived
    // credit portion of this sale; credit rules enforced here inside the
    // transaction so the balance can never be corrupted by a partial write)
    if (input.customerId && outstandingAmount.greaterThan(0)) {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const creditCheck = validateCustomerCredit(customer, outstandingAmount);
      if (!creditCheck.ok) {
        throw new Error(creditCheck.error);
      }
      const newBalance = creditCheck.newBalance;

      await tx.customerLedger.create({
        data: {
          businessId: input.businessId,
          customerId: input.customerId,
          ledgerDate: new Date(),
          referenceType: 'SALE',
          referenceId: newSale.id,
          description: `Credit sale ${saleNumber}`,
          debit: outstandingAmount,
          credit: 0,
          balance: newBalance,
          userId: input.cashierId,
          notes: input.notes,
        },
      });

      // Update customer balance
      await tx.customer.update({
        where: { id: input.customerId },
        data: { currentBalance: newBalance },
      });
    }

    return newSale;
  });

  // Audit log
  await audit({
    businessId: input.businessId,
    userId: input.cashierId,
    action: AuditActions.SALE_CREATED,
    entityType: 'sale',
    entityId: sale.id,
    newValues: {
      saleNumber: sale.saleNumber,
      total: input.total,
      paymentMethods: input.payments.map(p => p.paymentMethod),
      amountPaid: amountPaid.toFixed(2),
      outstandingAmount: outstandingAmount.toFixed(2),
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful transaction and audit
  const saleCreatedEvent = eventEmitter.createBaseEvent(
    RealtimeEvents.SALE_CREATED,
    input.businessId,
    input.cashierId,
    input.branchId
  );

  eventEmitter.emitToBusiness({
    ...saleCreatedEvent,
    eventType: RealtimeEvents.SALE_CREATED,
    data: {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      total: sale.total.toString(),
      subtotal: sale.subtotal.toString(),
      taxAmount: sale.taxAmount.toString(),
      discountAmount: sale.discountAmount.toString(),
      paymentMethods: input.payments.map(p => p.paymentMethod),
      itemCount: sale.items.length,
      customerId: input.customerId,
      customerName: undefined, // Could fetch if needed
      cashierId: input.cashierId,
      cashierName: sale.cashier.fullName,
      shiftId: input.shiftId,
      outstandingAmount: sale.outstandingAmount.toString(),
    },
  });

  return sale;
}

/**
 * Get sale by ID
 */
export async function getSaleById(saleId: string, businessId: string) {
  return prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
      payments: true,
      cashier: { select: { id: true, username: true, fullName: true } },
      branch: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get sales with pagination
 */
export async function getSales(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    cashierId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { page = 1, limit = 20, branchId, cashierId, status, startDate, endDate } = params;

  const where: any = { businessId };
  if (branchId) where.branchId = branchId;
  if (cashierId) where.cashierId = cashierId;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.saleDate = {};
    if (startDate) where.saleDate.gte = startDate;
    if (endDate) where.saleDate.lte = endDate;
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, username: true, fullName: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { items: true, payments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    data: sales,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Void a sale
 */
export async function voidSale(
  saleId: string,
  businessId: string,
  userId: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: { items: true },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  if (sale.status !== 'COMPLETED') {
    throw new Error('Only completed sales can be voided');
  }

  // Void in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update sale status
    const updatedSale = await tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'VOIDED',
        voidReason: reason,
        voidedAt: new Date(),
        voidedBy: userId,
      },
    });

    // Restore inventory for each item
    for (const item of sale.items) {
      const inventory = await tx.inventory.findFirst({
        where: {
          businessId: businessId,
          branchId: sale.branchId,
          productId: item.productId,
          variantId: item.variantId || null,
        },
      });

      if (inventory) {
        const currentQty = toDecimal(inventory.currentQuantity);
        const newQty = currentQty.plus(toDecimal(item.quantity));

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            currentQuantity: newQty,
            lastMovementAt: new Date(),
          },
        });

        // Create stock movement for void
        await tx.stockMovement.create({
          data: {
            businessId: businessId,
            branchId: sale.branchId,
            inventoryId: inventory.id,
            productId: item.productId,
            variantId: item.variantId,
            movementType: 'SALE_VOID',
            quantity: Number(item.quantity), // Positive for void
            previousQuantity: currentQty,
            resultingQuantity: newQty,
            referenceType: 'sale',
            referenceId: sale.id,
            reason: `Sale voided: ${reason}`,
            performedBy: userId,
          },
        });
      }
    }

    return updatedSale;
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.SALE_VOIDED,
    entityType: 'sale',
    entityId: saleId,
    oldValues: { status: 'COMPLETED' },
    newValues: { status: 'VOIDED', reason },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful transaction and audit
  const voidedByUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  const saleVoidedEvent = eventEmitter.createBaseEvent(
    RealtimeEvents.SALE_VOIDED,
    businessId,
    userId,
    result.branchId
  );

  eventEmitter.emitToBusiness({
    ...saleVoidedEvent,
    eventType: RealtimeEvents.SALE_VOIDED,
    data: {
      saleId: result.id,
      saleNumber: result.saleNumber,
      total: result.total.toString(),
      reason,
      voidedBy: userId,
      voidedByName: voidedByUser?.fullName || 'Unknown',
    },
  });

  return result;
}
