/**
 * H2: POS cart totals — the client-side implementation of the SERVER's
 * authoritative sale-total model (server/src/services/calculationService.ts
 * `calculateCartTotalsWithOrderDiscount`).
 *
 * This module exists so the POS display can never silently diverge from the
 * total the server calculates and stores. It is pinned to the server
 * calculator by server-side tests (server/tests/h2-totals-parity.test.ts),
 * which import THIS file and require cent-identical results.
 *
 * Model (existing business rules):
 *   item tax base   = unitPrice x quantity - item discount
 *                     (order discount does NOT reduce the tax base)
 *   taxAmount       = sum of item taxes
 *   order discount  = PERCENTAGE: subtotal x value/100, where subtotal is the
 *                     PRE-item-discount sum | FIXED: value
 *   total           = subtotal - item discounts - order discount + taxAmount
 *   rounding        = single round-half-up to 2dp per displayed/stored figure
 *                     (no intermediate rounding)
 *
 * Precision: all arithmetic runs on BigInt micros (1e-6) — exact for every
 * real cart input (2dp prices/quantities/discounts, percentage rates), so
 * results match the server's Decimal arithmetic cent-for-cent. No JavaScript
 * floating-point arithmetic decides any money value.
 */

export interface TotalsCartItem {
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  taxRate: number;
}

export interface TotalsOrderDiscount {
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
}

export interface CartTotals {
  /** Sum of unitPrice x quantity (pre-item-discount). */
  subtotal: number;
  /** Sum of item-level discounts. */
  itemDiscounts: number;
  /** The order-level discount amount. */
  orderDiscountAmount: number;
  /** itemDiscounts + orderDiscountAmount (as stored on the sale). */
  totalDiscount: number;
  /** subtotal - totalDiscount (display only). */
  taxableAmount: number;
  /** Sum of item taxes (computed on the pre-order-discount bases). */
  totalTax: number;
  /** The authoritative grand total: subtotal - totalDiscount + totalTax. */
  total: number;
}

const MICROS = 1000000n;
const CENT = 10000n; // micros per cent
const HALF_CENT = 5000n;

/** Convert a money/rate number to exact micros. */
function toMicros(value: number): bigint {
  return BigInt(Math.round(value * 1e6));
}

/** Round micros to whole cents, half away from zero (ROUND_HALF_UP). */
function microsToCents(micros: bigint): bigint {
  if (micros < 0n) return -microsToCents(-micros);
  return (micros + HALF_CENT) / CENT;
}

/** Round micros to a 2dp number, half away from zero. */
function round2(micros: bigint): number {
  return Number(microsToCents(micros)) / 100;
}

/**
 * Compute the cart totals exactly as the server does.
 * `orderDiscount` is omitted for carts without an order-level discount.
 */
export function computeCartTotals(
  items: TotalsCartItem[],
  orderDiscount?: TotalsOrderDiscount
): CartTotals {
  let subtotalMicros = 0n;
  let itemDiscountMicros = 0n;
  let taxMicros = 0n;

  for (const item of items) {
    const baseMicros = toMicros(item.unitPrice) * toMicros(item.quantity) / MICROS;
    const discountMicros = toMicros(item.discountAmount);
    // Item tax base: unitPrice x quantity - item discount.
    // The order-level discount does NOT reduce the tax base (server rule).
    const taxableMicros = baseMicros - discountMicros;
    const itemTaxMicros = taxableMicros * toMicros(item.taxRate) / (100n * MICROS);

    subtotalMicros += baseMicros;
    itemDiscountMicros += discountMicros;
    taxMicros += itemTaxMicros;
  }

  let orderDiscountMicros = 0n;
  if (orderDiscount) {
    orderDiscountMicros = orderDiscount.discountType === 'PERCENTAGE'
      ? subtotalMicros * toMicros(orderDiscount.discountValue) / (100n * MICROS)
      : toMicros(orderDiscount.discountValue);
  }

  const totalMicros = subtotalMicros - itemDiscountMicros - orderDiscountMicros + taxMicros;
  const totalDiscountMicros = itemDiscountMicros + orderDiscountMicros;

  return {
    subtotal: round2(subtotalMicros),
    itemDiscounts: round2(itemDiscountMicros),
    orderDiscountAmount: round2(orderDiscountMicros),
    totalDiscount: round2(totalDiscountMicros),
    taxableAmount: round2(subtotalMicros - totalDiscountMicros),
    totalTax: round2(taxMicros),
    total: round2(totalMicros),
  };
}
