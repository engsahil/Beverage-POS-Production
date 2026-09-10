/**
 * H2: POS / server total divergence — regression tests.
 *
 * Original bug (reproduced below in "legacy formula" tests): the POS
 * frontend (1) allocated the order-level discount into the per-item TAX
 * base and (2) computed PERCENTAGE order discounts on the post-item-discount
 * subtotal, while the server taxes the pre-order-discount item bases and
 * takes the percentage on the pre-item-discount subtotal. Carts with
 * tax + order discount displayed a total 10.00 lower than the server
 * charged for a 1000/10%/100 cart ("Payment shortfall: 10.00" at checkout).
 *
 * Fix: ONE authoritative model. Server: calculationService.
 * calculateCartTotalsWithOrderDiscount (used by checkoutService). POS:
 * apps/pos/src/lib/totals.ts implements the same model with exact BigInt
 * micros. The parity tests import the ACTUAL shipped POS module and pin it
 * to the server calculator cent-for-cent, so the two can never silently
 * diverge again.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCartTotalsWithOrderDiscount,
  roundCurrency,
  toDecimal,
  type CartItem,
} from '../src/services/calculationService.js';
import { computeCartTotals } from '../../apps/pos/src/lib/totals.js';
import { processCheckout, type CheckoutCartInput } from '../src/services/checkoutService.js';

type Disc = { discountType: 'PERCENTAGE' | 'FIXED'; discountValue: number };

// ============================================================
// Phase 1 evidence: the ORIGINAL POS formula (verbatim pre-fix
// implementation, kept here to prove the divergence was real)
// ============================================================

function legacyPosTotal(
  cart: Array<{ unitPrice: number; quantity: number; discountAmount: number; taxRate: number }>,
  orderDiscount: number,
  orderDiscountType: 'PERCENTAGE' | 'FIXED'
): number {
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const itemDiscounts = cart.reduce((sum, item) => sum + item.discountAmount, 0);
  const orderDiscountAmount =
    orderDiscountType === 'PERCENTAGE'
      ? (subtotal - itemDiscounts) * (orderDiscount / 100)
      : orderDiscount;
  const totalDiscount = itemDiscounts + orderDiscountAmount;
  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const totalTax = cart.reduce((sum: number, item) => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const itemAfterDiscount =
      itemSubtotal - item.discountAmount - orderDiscountAmount * (itemSubtotal / subtotal || 0);
    return sum + itemAfterDiscount * (item.taxRate / 100);
  }, 0);
  return taxableAmount + totalTax;
}

describe('H2 phase 1: the original divergence (reproduced, then proven fixed)', () => {
  const caseA = [{ unitPrice: 100, quantity: 10, discountAmount: 0, taxRate: 10 }];

  it('BEFORE: POS displayed 990.00 while the server charged 1000.00 (fixed 100 discount + 10% tax)', () => {
    assert.equal(legacyPosTotal(caseA, 100, 'FIXED'), 990);
    const server = calculateCartTotalsWithOrderDiscount(
      caseA.map((i) => ({ ...i, productId: 'p' } as CartItem)),
      { discountType: 'FIXED', discountValue: 100 }
    );
    assert.equal(server.total.toFixed(2), '1000.00');
    assert.notEqual(legacyPosTotal(caseA, 100, 'FIXED'), Number(server.total));
  });

  it('BEFORE: percentage order discount diverged the same way (10% + 10% tax)', () => {
    assert.equal(legacyPosTotal(caseA, 10, 'PERCENTAGE'), 990);
    const server = calculateCartTotalsWithOrderDiscount(
      caseA.map((i) => ({ ...i, productId: 'p' } as CartItem)),
      { discountType: 'PERCENTAGE', discountValue: 10 }
    );
    assert.equal(server.total.toFixed(2), '1000.00');
  });

  it('BEFORE: item discount + percentage order discount diverged in BOTH the % base and the tax base (891 vs 890)', () => {
    const caseC = [{ unitPrice: 1000, quantity: 1, discountAmount: 100, taxRate: 10 }];
    assert.equal(legacyPosTotal(caseC, 10, 'PERCENTAGE'), 891);
    const server = calculateCartTotalsWithOrderDiscount(
      caseC.map((i) => ({ ...i, productId: 'p' } as CartItem)),
      { discountType: 'PERCENTAGE', discountValue: 10 }
    );
    assert.equal(server.total.toFixed(2), '890.00');
  });

  it('AFTER: the shipped POS module returns the server total for all three cases', () => {
    const caseC = [{ unitPrice: 1000, quantity: 1, discountAmount: 100, taxRate: 10 }];
    assert.equal(computeCartTotals(caseA, { discountType: 'FIXED', discountValue: 100 }).total, 1000);
    assert.equal(computeCartTotals(caseA, { discountType: 'PERCENTAGE', discountValue: 10 }).total, 1000);
    assert.equal(computeCartTotals(caseC, { discountType: 'PERCENTAGE', discountValue: 10 }).total, 890);
  });
});

// ============================================================
// Phase 2/5: the authoritative model — exact vectors (A–F + precision)
// ============================================================

const asCart = (items: Array<Partial<CartItem>>): CartItem[] =>
  items.map((i) => ({ productId: 'p', ...i })) as CartItem[];

describe('H2: authoritative calculation model (server calculator)', () => {
  it('A: subtotal 1000, order discount 100 fixed, tax 10% -> total 1000.00 (tax on full base)', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 10, unitPrice: 100, taxRate: 10 }]),
      { discountType: 'FIXED', discountValue: 100 }
    );
    assert.equal(r.subtotal.toFixed(2), '1000.00');
    assert.equal(r.discountAmount.toFixed(2), '100.00');
    assert.equal(r.taxAmount.toFixed(2), '100.00');
    assert.equal(r.total.toFixed(2), '1000.00');
  });

  it('B: subtotal 1000, order discount 10%, tax 10% -> total 1000.00 (% base = pre-item-discount subtotal)', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 10, unitPrice: 100, taxRate: 10 }]),
      { discountType: 'PERCENTAGE', discountValue: 10 }
    );
    assert.equal(r.discountAmount.toFixed(2), '100.00');
    assert.equal(r.taxAmount.toFixed(2), '100.00');
    assert.equal(r.total.toFixed(2), '1000.00');
  });

  it('C: multiple items + order discount + tax (rates differ per item)', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([
        { quantity: 2, unitPrice: 250, discountAmount: 50, taxRate: 10 },   // base 500, tax 45
        { quantity: 1, unitPrice: 300, discountAmount: 0, taxRate: 5 },     // base 300, tax 15
      ]),
      { discountType: 'FIXED', discountValue: 75 }
    );
    assert.equal(r.subtotal.toFixed(2), '800.00');
    assert.equal(r.discountAmount.toFixed(2), '125.00');
    assert.equal(r.taxAmount.toFixed(2), '60.00');
    assert.equal(r.total.toFixed(2), '735.00'); // 800 - 125 + 60
  });

  it('D: decimal prices + order discount + tax stay cent-exact', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 3, unitPrice: 33.33, discountAmount: 0.99, taxRate: 12.5 }]),
      { discountType: 'PERCENTAGE', discountValue: 15 }
    );
    // base 99.99, item disc 0.99, tax (99.00)*12.5% = 12.375, order disc 99.99*15% = 14.9985
    assert.equal(r.subtotal.toFixed(2), '99.99');
    assert.equal(r.taxAmount.toFixed(2), '12.38'); // roundCurrency HALF_UP of 12.375
    assert.equal(r.discountAmount.toFixed(2), '15.99'); // 0.99 + 14.9985 -> 15.9885 -> 15.99
    assert.equal(r.total.toFixed(2), '96.38'); // 99.99 - 15.9885 + 12.375 = 96.3765 -> 96.38
  });

  it('E: zero discount + tax', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 4, unitPrice: 12.5, taxRate: 10 }])
    );
    assert.equal(r.total.toFixed(2), '55.00');
    assert.equal(r.discountAmount.toFixed(2), '0.00');
  });

  it('F: discount + zero tax', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 2, unitPrice: 500, taxRate: 0 }]),
      { discountType: 'PERCENTAGE', discountValue: 20 }
    );
    assert.equal(r.total.toFixed(2), '800.00');
    assert.equal(r.taxAmount.toFixed(2), '0.00');
  });

  it('rounding boundary: half-cent rounds HALF_UP (0.125 -> 0.13, not banker rounding)', () => {
    assert.equal(roundCurrency(toDecimal('0.125')).toFixed(2), '0.13');
    assert.equal(roundCurrency(toDecimal('2.675')).toFixed(2), '2.68');
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 0.5, unitPrice: 2.5, taxRate: 10 }]) // tax = 0.125
    );
    assert.equal(r.taxAmount.toFixed(2), '0.13');
    assert.equal(r.total.toFixed(2), '1.38');
  });

  it('large values and small fractions stay exact', () => {
    const r = calculateCartTotalsWithOrderDiscount(
      asCart([{ quantity: 10000, unitPrice: 9999.99, taxRate: 7.5 }]),
      { discountType: 'FIXED', discountValue: 12345.67 }
    );
    // base 99,999,900; tax 7,499,992.50; total 99,999,900 + 7,499,992.50 - 12,345.67
    assert.equal(r.total.toFixed(2), '107487546.83');
    const tiny = calculateCartTotalsWithOrderDiscount(asCart([{ quantity: 0.01, unitPrice: 0.05, taxRate: 5 }]));
    assert.equal(tiny.total.toFixed(2), '0.00'); // 0.0005 + 0.000025 -> 0.000525 -> 0.00
  });
});

// ============================================================
// Phase 4: client/server parity pin — the SHIPPED POS module
// must match the server calculator cent-for-cent
// ============================================================

describe('H2: POS module (actual shipped file) pinned to the server calculator', () => {
  const vectors: Array<{
    name: string;
    items: Array<{ unitPrice: number; quantity: number; discountAmount: number; taxRate: number }>;
    disc?: Disc;
  }> = [
    { name: 'A fixed+tax', items: [{ unitPrice: 100, quantity: 10, discountAmount: 0, taxRate: 10 }], disc: { discountType: 'FIXED', discountValue: 100 } },
    { name: 'B pct+tax', items: [{ unitPrice: 100, quantity: 10, discountAmount: 0, taxRate: 10 }], disc: { discountType: 'PERCENTAGE', discountValue: 10 } },
    { name: 'C multi+pct+tax', items: [{ unitPrice: 250, quantity: 2, discountAmount: 50, taxRate: 10 }, { unitPrice: 300, quantity: 1, discountAmount: 0, taxRate: 5 }], disc: { discountType: 'FIXED', discountValue: 75 } },
    { name: 'D decimals', items: [{ unitPrice: 33.33, quantity: 3, discountAmount: 0.99, taxRate: 12.5 }], disc: { discountType: 'PERCENTAGE', discountValue: 15 } },
    { name: 'E tax only', items: [{ unitPrice: 12.5, quantity: 4, discountAmount: 0, taxRate: 10 }] },
    { name: 'F discount only', items: [{ unitPrice: 500, quantity: 2, discountAmount: 0, taxRate: 0 }], disc: { discountType: 'PERCENTAGE', discountValue: 20 } },
    { name: 'half-cent', items: [{ unitPrice: 2.5, quantity: 0.5, discountAmount: 0, taxRate: 10 }] },
    { name: 'zero everything', items: [{ unitPrice: 10, quantity: 1, discountAmount: 0, taxRate: 0 }] },
  ];

  for (const v of vectors) {
    it(`parity: ${v.name}`, () => {
      const server = calculateCartTotalsWithOrderDiscount(
        v.items.map((i) => ({ ...i, productId: 'p' })) as CartItem[],
        v.disc
      );
      const pos = computeCartTotals(v.items, v.disc);
      assert.equal(pos.subtotal.toFixed(2), server.subtotal.toFixed(2), 'subtotal');
      assert.equal(pos.totalDiscount.toFixed(2), server.discountAmount.toFixed(2), 'discount');
      assert.equal(pos.totalTax.toFixed(2), server.taxAmount.toFixed(2), 'tax');
      assert.equal(pos.total.toFixed(2), server.total.toFixed(2), 'total');
    });
  }

  it('parity across 300 seeded randomized carts (no order discount, fixed, percentage)', () => {
    let seed = 20260910;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const rates = [0, 5, 10, 12.5, 17.5, 33.33];
    for (let i = 0; i < 300; i++) {
      const itemCount = 1 + Math.floor(rand() * 5);
      const items = Array.from({ length: itemCount }, () => ({
        unitPrice: Math.round(rand() * 50000) / 100,        // 2dp
        quantity: Math.round(rand() * 400) / 100,           // 2dp
        discountAmount: Math.round(rand() * 2000) / 100,    // 2dp (may exceed base in rare carts — parity must still hold)
        taxRate: rates[Math.floor(rand() * rates.length)],
      }));
      const roll = rand();
      const disc: Disc | undefined =
        roll < 0.33 ? undefined
        : roll < 0.66 ? { discountType: 'FIXED', discountValue: Math.round(rand() * 50000) / 100 }
        : { discountType: 'PERCENTAGE', discountValue: Math.round(rand() * 10000) / 100 };
      const server = calculateCartTotalsWithOrderDiscount(
        items.map((it) => ({ ...it, productId: 'p' })) as CartItem[],
        disc
      );
      const pos = computeCartTotals(items, disc);
      assert.equal(pos.total.toFixed(2), server.total.toFixed(2), `cart ${i}: ${JSON.stringify({ items, disc })}`);
      assert.equal(pos.totalTax.toFixed(2), server.taxAmount.toFixed(2), `cart ${i} tax`);
      assert.equal(pos.subtotal.toFixed(2), server.subtotal.toFixed(2), `cart ${i} subtotal`);
    }
  });
});

// ============================================================
// Phase 4/6: checkout integration (server stays authoritative)
// ============================================================

function makeCheckoutDb(opts: { sellingPrice?: string; taxRate?: string; stock?: string; customer?: Record<string, unknown> } = {}) {
  const product = {
    id: 'p1', businessId: 'biz1', isActive: true, name: 'Cola',
    sellingPrice: opts.sellingPrice ?? '100',
    taxEnabled: (opts.taxRate ?? '10') !== '0',
    taxRate: opts.taxRate ?? '10',
    discountAllowed: true, maxDiscountPercent: '100',
  };
  const variant = { id: 'pv1', productId: 'p1', isActive: true, name: 'Can', sellingPrice: opts.sellingPrice ?? '100' };
  const db = {
    product: {
      findFirst: async (a: { where: { id: string } }) => (a.where.id === 'p1' ? { ...product, variants: [variant] } : null),
      findUnique: async (a: { where: { id: string } }) => (a.where.id === 'p1' ? { ...product } : null),
    },
    productVariant: { findUnique: async (a: { where: { id: string } }) => (a.where.id === 'pv1' ? { ...variant } : null) },
    inventory: {
      findFirst: async () => ({ currentQuantity: opts.stock ?? '100', reservedQuantity: '0' }),
    },
    customer: { findFirst: async () => (opts.customer ? { ...opts.customer } : null) },
  };
  return db;
}

function checkoutInput(overrides: Partial<CheckoutCartInput> = {}): CheckoutCartInput {
  return {
    businessId: 'biz1',
    branchId: 'br1',
    cashierId: 'u1',
    items: [{ productId: 'p1', variantId: 'pv1', quantity: 10 }],
    payments: [{ paymentMethod: 'CASH', amount: 1000, cashReceived: 1000 }],
    saleDiscount: { discountType: 'FIXED', discountValue: 100 },
    ...overrides,
  };
}

describe('H2: processCheckout integration (server authoritative, POS-aligned inputs succeed)', () => {
  it('successful checkout: tax + order discount cart reaches createSale with the authoritative total (1000.00)', async () => {
    const created: Array<Record<string, unknown>> = [];
    const deps = {
      prisma: makeCheckoutDb() as never,
      createSale: (async (input: Record<string, unknown>) => {
        created.push(input);
        return { id: 'sale-1', saleNumber: 'SALE-000001', total: input.total, items: [], cashier: { fullName: 'C' } };
      }) as never,
    };
    const { sale } = await processCheckout(checkoutInput(), undefined, undefined, deps as never);
    assert.equal(created.length, 1);
    assert.equal(Number(created[0].total), 1000);
    assert.equal(Number(created[0].taxAmount), 100);
    assert.equal(Number(created[0].discountAmount), 100);
    assert.equal(Number(created[0].subtotal), 1000);
    // what the (fixed) POS displays is exactly what the server charged
    const posTotal = computeCartTotals(
      [{ unitPrice: 100, quantity: 10, discountAmount: 0, taxRate: 10 }],
      { discountType: 'FIXED', discountValue: 100 }
    ).total;
    assert.equal(posTotal, Number(created[0].total));
    assert.equal(sale.saleNumber, 'SALE-000001');
  });

  it('genuine mismatch is still rejected: tendering the OLD divergent total (990) fails with Payment shortfall: 10.00', async () => {
    const created: Array<Record<string, unknown>> = [];
    const deps = {
      prisma: makeCheckoutDb() as never,
      createSale: (async (input: Record<string, unknown>) => { created.push(input); return {}; }) as never,
    };
    await assert.rejects(
      () => processCheckout(
        checkoutInput({ payments: [{ paymentMethod: 'CASH', amount: 990, cashReceived: 990 }] }),
        undefined, undefined, deps as never
      ),
      /Payment shortfall: 10\.00/
    );
    assert.equal(created.length, 0, 'no sale created on mismatch');
  });

  it('full tender of the authoritative total succeeds end-to-end (validation not weakened)', async () => {
    const deps = {
      prisma: makeCheckoutDb() as never,
      createSale: (async () => ({ id: 'sale-1', saleNumber: 'SALE-000001', items: [], cashier: { fullName: 'C' } })) as never,
    };
    const { sale } = await processCheckout(checkoutInput(), undefined, undefined, deps as never);
    assert.equal(sale.id, 'sale-1');
  });

  it('invalid order discounts are rejected before any calculation mutation', async () => {
    const deps = {
      prisma: makeCheckoutDb() as never,
      createSale: (async () => ({ id: 'x' })) as never,
    };
    await assert.rejects(
      () => processCheckout(checkoutInput({ saleDiscount: { discountType: 'FIXED', discountValue: -5 } }), undefined, undefined, deps as never),
      /Fixed discount cannot be negative/
    );
    await assert.rejects(
      () => processCheckout(checkoutInput({ saleDiscount: { discountType: 'PERCENTAGE', discountValue: 150 } }), undefined, undefined, deps as never),
      /Percentage discount must be between 0 and 100/
    );
  });

  it('H1 interplay intact: tax + order discount + partial payment -> outstanding is the exact credit portion', async () => {
    const created: Array<Record<string, unknown>> = [];
    const deps = {
      prisma: makeCheckoutDb({ customer: { id: 'cust1', status: 'ACTIVE', creditLimit: '5000', currentBalance: '0' } }) as never,
      createSale: (async (input: Record<string, unknown>) => { created.push(input); return { id: 's', saleNumber: 'SALE-1', items: [], cashier: { fullName: 'C' } }; }) as never,
    };
    await processCheckout(
      checkoutInput({
        customerId: 'cust1',
        payments: [{ paymentMethod: 'CASH', amount: 500, cashReceived: 500 }],
      }),
      undefined, undefined, deps as never
    );
    assert.equal(Number(created[0].total), 1000);
    assert.equal(Number(created[0].amountPaid), 500);
    assert.equal(Number(created[0].outstandingAmount), 500);
  });
});
