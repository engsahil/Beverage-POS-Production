import { Decimal } from '@prisma/client/runtime/library.js';

/**
 * Decimal-safe financial calculations
 * NEVER use JavaScript floating-point arithmetic for money
 */

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number | Decimal;
  discountAmount?: number | Decimal;
  taxRate?: number | Decimal;
}

export interface CalculationResult {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: Decimal;
    unitPrice: Decimal;
    discountAmount: Decimal;
    taxAmount: Decimal;
    lineTotal: Decimal;
  }>;
}

/**
 * Convert any numeric value to Decimal safely
 */
export function toDecimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === 'string') {
    return new Decimal(value);
  }
  return new Decimal(value.toString());
}

/**
 * Calculate line total for a single item
 * lineTotal = (unitPrice × quantity) - discountAmount + taxAmount
 */
export function calculateLineTotal(
  unitPrice: number | Decimal,
  quantity: number | Decimal,
  discountAmount: number | Decimal = 0,
  taxAmount: number | Decimal = 0
): Decimal {
  const price = toDecimal(unitPrice);
  const qty = toDecimal(quantity);
  const discount = toDecimal(discountAmount);
  const tax = toDecimal(taxAmount);

  const baseAmount = price.times(qty);
  return baseAmount.minus(discount).plus(tax);
}

/**
 * Calculate discount amount
 * Supports both percentage and fixed amount discounts
 */
export function calculateDiscount(
  baseAmount: number | Decimal,
  discountType: 'PERCENTAGE' | 'FIXED',
  discountValue: number | Decimal
): Decimal {
  const base = toDecimal(baseAmount);
  const value = toDecimal(discountValue);

  if (discountType === 'PERCENTAGE') {
    // Percentage discount: baseAmount × (discountValue / 100)
    return base.times(value.dividedBy(100));
  } else {
    // Fixed discount: just the value, capped at baseAmount
    return Decimal.min(value, base);
  }
}

/**
 * Calculate tax amount
 */
export function calculateTax(
  baseAmount: number | Decimal,
  taxRate: number | Decimal
): Decimal {
  const base = toDecimal(baseAmount);
  const rate = toDecimal(taxRate);

  // taxAmount = baseAmount × (taxRate / 100)
  return base.times(rate.dividedBy(100));
}

/**
 * Calculate complete cart totals
 */
export function calculateCartTotals(items: CartItem[]): CalculationResult {
  const calculatedItems = items.map((item) => {
    const unitPrice = toDecimal(item.unitPrice);
    const quantity = toDecimal(item.quantity);
    const discountAmount = toDecimal(item.discountAmount);
    const taxRate = toDecimal(item.taxRate);

    // Calculate base amount
    const baseAmount = unitPrice.times(quantity);

    // Calculate tax on (baseAmount - discount)
    const taxableAmount = baseAmount.minus(discountAmount);
    const taxAmount = calculateTax(taxableAmount, taxRate);

    // Calculate line total
    const lineTotal = taxableAmount.plus(taxAmount);

    return {
      productId: item.productId,
      variantId: item.variantId,
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      lineTotal,
    };
  });

  // Sum up totals
  const subtotal = calculatedItems.reduce(
    (sum, item) => sum.plus(item.unitPrice.times(item.quantity)),
    new Decimal(0)
  );

  const discountAmount = calculatedItems.reduce(
    (sum, item) => sum.plus(item.discountAmount),
    new Decimal(0)
  );

  const taxAmount = calculatedItems.reduce(
    (sum, item) => sum.plus(item.taxAmount),
    new Decimal(0)
  );

  const total = calculatedItems.reduce(
    (sum, item) => sum.plus(item.lineTotal),
    new Decimal(0)
  );

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
    items: calculatedItems,
  };
}

/**
 * Calculate cash payment change
 */
export function calculateCashChange(
  total: number | Decimal,
  cashReceived: number | Decimal
): { change: Decimal; isValid: boolean } {
  const totalDecimal = toDecimal(total);
  const receivedDecimal = toDecimal(cashReceived);

  const change = receivedDecimal.minus(totalDecimal);

  return {
    change,
    isValid: change.greaterThanOrEqualTo(0),
  };
}

/**
 * Validate payment amounts
 */
export function validatePayment(
  total: number | Decimal,
  payments: Array<{ amount: number | Decimal }>
): { isValid: boolean; paidAmount: Decimal; remaining: Decimal } {
  const totalDecimal = toDecimal(total);
  const paidAmount = payments.reduce(
    (sum, payment) => sum.plus(toDecimal(payment.amount)),
    new Decimal(0)
  );

  const remaining = totalDecimal.minus(paidAmount);

  return {
    isValid: remaining.lessThanOrEqualTo(0),
    paidAmount,
    remaining: remaining.lessThan(0) ? new Decimal(0) : remaining,
  };
}

/**
 * Apply sale-level discount to cart
 */
export function applySaleDiscount(
  subtotal: number | Decimal,
  discountType: 'PERCENTAGE' | 'FIXED',
  discountValue: number | Decimal,
  taxAmount: number | Decimal = 0
): { discountAmount: Decimal; total: Decimal } {
  const subtotalDecimal = toDecimal(subtotal);
  const taxDecimal = toDecimal(taxAmount);

  const discountAmount = calculateDiscount(subtotalDecimal, discountType, discountValue);
  const total = subtotalDecimal.minus(discountAmount).plus(taxDecimal);

  return {
    discountAmount,
    total,
  };
}

/**
 * Check if discount exceeds maximum allowed
 */
export function isDiscountAllowed(
  discountAmount: number | Decimal,
  baseAmount: number | Decimal,
  maxDiscountPercent?: number | Decimal | null
): boolean {
  if (!maxDiscountPercent) {
    return true; // No limit
  }

  const discount = toDecimal(discountAmount);
  const base = toDecimal(baseAmount);
  const maxPercent = toDecimal(maxDiscountPercent);

  if (base.equals(0)) {
    return false;
  }

  const discountPercent = discount.dividedBy(base).times(100);
  return discountPercent.lessThanOrEqualTo(maxPercent);
}

/**
 * Round to 2 decimal places (standard for currency)
 */
export function roundCurrency(value: number | Decimal): Decimal {
  return toDecimal(value).toDecimalPlaces(2);
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number | Decimal, symbol: string = 'Rs.'): string {
  const decimal = toDecimal(value);
  return `${symbol} ${decimal.toFixed(2)}`;
}
