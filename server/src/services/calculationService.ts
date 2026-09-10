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
 * H2: THE authoritative sale-total calculation for POS checkout.
 *
 * Single source of truth for combining item totals with an order-level
 * discount, used by checkoutService. The POS client (apps/pos/src/lib/totals.ts)
 * implements this exact model and is pinned to it by server tests
 * (tests/h2-totals-parity.test.ts) so the two can never silently diverge.
 *
 * Model (existing business rules, unchanged):
 *   item tax base   = unitPrice x quantity - item discount      (order
 *                     discount does NOT reduce the tax base)
 *   taxAmount       = sum of item taxes (exact, no per-line rounding)
 *   order discount  = PERCENTAGE: subtotal x value/100 (subtotal is the
 *                     pre-item-discount sum) | FIXED: value
 *   total           = subtotal - item discounts - order discount + taxAmount
 *   rounding        = single ROUND_HALF_UP to 2dp per stored field
 */
export interface OrderDiscountInput {
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

export interface SaleTotalsResult {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export function calculateCartTotalsWithOrderDiscount(
  items: CartItem[],
  orderDiscount?: OrderDiscountInput
): SaleTotalsResult {
  const calculation = calculateCartTotals(items);

  let saleDiscountAmount = new Decimal(0);
  let finalTotal = calculation.total;

  if (orderDiscount) {
    saleDiscountAmount = orderDiscount.discountType === 'PERCENTAGE'
      ? calculation.subtotal.times(toDecimal(orderDiscount.discountValue).dividedBy(100))
      : toDecimal(orderDiscount.discountValue);
    finalTotal = calculation.total.minus(saleDiscountAmount);
  }

  return {
    subtotal: roundCurrency(calculation.subtotal),
    discountAmount: roundCurrency(calculation.discountAmount.plus(saleDiscountAmount)),
    taxAmount: roundCurrency(calculation.taxAmount),
    total: roundCurrency(finalTotal),
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
 * H1: Authoritative payment breakdown for a sale.
 *
 * Sums the tendered payment lines with Decimal arithmetic and derives the
 * outstanding (credit) amount so the financial invariant always holds:
 *
 *   sale total = paid amount + outstanding credit
 *
 * Overpayment is not accepted here — the only supported way to hand the
 * cashier more money than the total is CASH change (cashReceived greater
 * than the tendered payment amount), which never makes the recorded
 * payment exceed the total. Returns a validation error instead of
 * silently inventing financial state.
 */
export function validateSalePayments(
  total: number | Decimal,
  payments: Array<{ amount: number | Decimal }>
): { paidAmount: Decimal; outstandingAmount: Decimal; error: string | null } {
  const totalDecimal = roundCurrency(toDecimal(total));
  const paidAmount = payments.reduce(
    (sum, payment) => sum.plus(toDecimal(payment.amount)),
    new Decimal(0)
  );

  if (paidAmount.isNegative()) {
    return {
      paidAmount: roundCurrency(paidAmount),
      outstandingAmount: roundCurrency(totalDecimal.minus(paidAmount)),
      error: 'Payment amount cannot be negative',
    };
  }

  if (paidAmount.greaterThan(totalDecimal)) {
    return {
      paidAmount: roundCurrency(paidAmount),
      outstandingAmount: new Decimal(0),
      error:
        'Payment exceeds the sale total. Collect any extra amount as cash change (cash received) instead of overpaying the recorded payment.',
    };
  }

  return {
    paidAmount: roundCurrency(paidAmount),
    outstandingAmount: roundCurrency(totalDecimal.minus(paidAmount)),
    error: null,
  };
}

/**
 * H1: Shared customer-credit eligibility rules.
 *
 * Single source of truth used by BOTH the checkout service (pre-validation)
 * and sale creation (inside the transaction) so there is exactly one credit
 * policy, with the historical error messages preserved.
 */
export function validateCustomerCredit(
  customer: {
    status?: string | null;
    creditLimit: number | Decimal | null;
    currentBalance: number | Decimal | null;
  },
  outstandingAmount: number | Decimal
): { ok: false; error: string; newBalance: Decimal } | { ok: true; error: null; newBalance: Decimal } {
  const outstanding = toDecimal(outstandingAmount);
  const currentBalance = toDecimal(customer.currentBalance);
  const newBalance = roundCurrency(currentBalance.plus(outstanding));

  if (customer.status !== 'ACTIVE') {
    return {
      ok: false,
      error: 'Cannot create credit sale for inactive customer',
      newBalance,
    };
  }

  const creditLimit = toDecimal(customer.creditLimit);

  if (creditLimit.equals(0)) {
    return {
      ok: false,
      error: 'Customer has no credit limit configured',
      newBalance,
    };
  }

  if (newBalance.greaterThan(creditLimit)) {
    return {
      ok: false,
      error:
        `Credit limit exceeded. Current balance: Rs. ${currentBalance.toFixed(2)}, ` +
        `Credit limit: Rs. ${creditLimit.toFixed(2)}, ` +
        `Requested credit: Rs. ${outstanding.toFixed(2)}`,
      newBalance,
    };
  }

  return { ok: true, error: null, newBalance };
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
