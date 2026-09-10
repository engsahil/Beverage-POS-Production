/**
 * H1: Credit / partial-payment sales regression tests.
 *
 * Root cause fixed: createSale required the tendered payments to equal the
 * sale total exactly, so every partial/credit checkout (already prepared by
 * checkoutService with amountPaid/outstandingAmount and credit validation)
 * failed with "Payment total does not match sale total".
 *
 * Layers covered here (all actually executed — no DB engine required):
 *  1. Pure financial rules (calculationService): payment breakdown incl.
 *     the invariant total = paid + outstanding, overpayment rejection,
 *     customer-credit eligibility (status / credit limit).
 *  2. createSale orchestration with an injected in-memory database:
 *     full / partial / full-credit / split payments, change handling,
 *     validation failures before any write, ledger + balance updates,
 *     idempotency, and failure propagation (the surrounding Prisma
 *     transaction rolls back — proven against real PostgreSQL in the
 *     standalone PGlite harness, see the step report).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSalePayments,
  validateCustomerCredit,
} from '../src/services/calculationService.js';
import { createSale, type CreateSaleInput } from '../src/services/saleService.js';
import { applyCashChanges } from '../src/services/checkoutService.js';

// ============================================================
// 1. Pure payment-breakdown rules
// ============================================================

describe('H1: sale payment breakdown (total = paid + outstanding)', () => {
  it('accepts a full payment with zero outstanding', () => {
    const r = validateSalePayments(1000, [{ amount: 1000 }]);
    assert.equal(r.error, null);
    assert.equal(r.paidAmount.toFixed(2), '1000.00');
    assert.equal(r.outstandingAmount.toFixed(2), '0.00');
  });

  it('accepts a partial payment with the remainder as outstanding credit', () => {
    const r = validateSalePayments(1000, [{ amount: 600 }]);
    assert.equal(r.error, null);
    assert.equal(r.paidAmount.toFixed(2), '600.00');
    assert.equal(r.outstandingAmount.toFixed(2), '400.00');
  });

  it('accepts full credit (no tendered payments) with the whole total outstanding', () => {
    const r = validateSalePayments(1000, []);
    assert.equal(r.error, null);
    assert.equal(r.paidAmount.toFixed(2), '0.00');
    assert.equal(r.outstandingAmount.toFixed(2), '1000.00');
  });

  it('reconciles split payments across methods (cash 400 + card 300 -> 300 credit)', () => {
    const r = validateSalePayments(1000, [{ amount: 400 }, { amount: 300 }]);
    assert.equal(r.error, null);
    assert.equal(r.paidAmount.toFixed(2), '700.00');
    assert.equal(r.outstandingAmount.toFixed(2), '300.00');
  });

  it('rejects overpayment (recorded payments above the total)', () => {
    const r = validateSalePayments(1000, [{ amount: 1200 }]);
    assert.match(String(r.error), /exceeds the sale total/i);
  });

  it('rejects negative payment amounts', () => {
    const r = validateSalePayments(1000, [{ amount: -50 }]);
    assert.match(String(r.error), /negative/i);
  });

  it('is decimal-exact (no floating-point drift)', () => {
    const r = validateSalePayments(0.3, [{ amount: 0.1 }, { amount: 0.2 }]);
    assert.equal(r.error, null);
    assert.equal(r.outstandingAmount.toFixed(2), '0.00');
  });

  it('handles cent-level remainders without losing pennies', () => {
    const r = validateSalePayments(999.99, [{ amount: 250.5 }]);
    assert.equal(r.paidAmount.toFixed(2), '250.50');
    assert.equal(r.outstandingAmount.toFixed(2), '749.49');
  });
});

describe('H1: customer credit eligibility (shared rules)', () => {
  const customer = { status: 'ACTIVE', creditLimit: 5000, currentBalance: 1000 };

  it('allows credit within the limit and returns the new balance', () => {
    const r = validateCustomerCredit(customer, 400);
    assert.equal(r.ok, true);
    assert.equal(r.newBalance.toFixed(2), '1400.00');
  });

  it('allows credit up to exactly the limit boundary', () => {
    const r = validateCustomerCredit(customer, 4000);
    assert.equal(r.ok, true);
    assert.equal(r.newBalance.toFixed(2), '5000.00');
  });

  it('rejects credit beyond the limit with the historical message', () => {
    const r = validateCustomerCredit(customer, 4000.01);
    assert.equal(r.ok, false);
    assert.match(r.error!, /Credit limit exceeded\. Current balance: Rs\. 1000\.00, Credit limit: Rs\. 5000\.00, Requested credit: Rs\. 4000\.01/);
  });

  it('rejects inactive customers (historical message)', () => {
    const r = validateCustomerCredit({ ...customer, status: 'INACTIVE' }, 10);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'Cannot create credit sale for inactive customer');
  });

  it('rejects customers without a configured credit limit (historical message)', () => {
    const r = validateCustomerCredit({ ...customer, creditLimit: 0 }, 10);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'Customer has no credit limit configured');
  });
});

describe('H1: per-tender cash change (checkout payment lines)', () => {
  it('full cash payment: zero change', () => {
    const r = applyCashChanges([{ paymentMethod: 'CASH', amount: 1000, cashReceived: 1000 }]);
    assert.equal(r[0].cashChange, 0);
  });

  it('partial cash payment (600 tendered of a 1000 sale): accepted, no change — the old code threw here', () => {
    const r = applyCashChanges([{ paymentMethod: 'CASH', amount: 600, cashReceived: 600 }]);
    assert.equal(r[0].cashChange, 0);
  });

  it('over-tender on a line: change is cash given minus that line tender', () => {
    const r = applyCashChanges([{ paymentMethod: 'CASH', amount: 400, cashReceived: 450 }]);
    assert.equal(r[0].cashChange, 50);
  });

  it('split cash lines compute change independently', () => {
    const r = applyCashChanges([
      { paymentMethod: 'CASH', amount: 400, cashReceived: 500 },
      { paymentMethod: 'CASH', amount: 300, cashReceived: 300 },
    ]);
    assert.equal(r[0].cashChange, 100);
    assert.equal(r[1].cashChange, 0);
  });

  it('cash given below the line tender is rejected', () => {
    assert.throws(
      () => applyCashChanges([{ paymentMethod: 'CASH', amount: 600, cashReceived: 500 }]),
      /Insufficient cash received/
    );
  });

  it('non-cash lines pass through untouched', () => {
    const r = applyCashChanges([{ paymentMethod: 'CARD', amount: 300, referenceNumber: 'A-1' }]);
    assert.equal(r[0].cashChange, undefined);
    assert.equal((r[0] as Record<string, unknown>).referenceNumber, 'A-1');
  });
});

// ============================================================
// 2. createSale orchestration (in-memory database injected)
// ============================================================

type Row = Record<string, any>;

interface FakeDbOptions {
  inventoryQuantity?: string;
  customerOverrides?: Row;
  existingBalance?: string;
}

function makeFakeDb(opts: FakeDbOptions = {}) {
  const writes: string[] = [];
  const rows = {
    branches: [{ id: 'br1', businessId: 'biz1', name: 'Main' }] as Row[],
    users: [{ id: 'cashier1', businessId: 'biz1', isActive: true, fullName: 'Test Cashier' }] as Row[],
    products: [{ id: 'p1', businessId: 'biz1', isActive: true, name: 'Cola' }] as Row[],
    productVariants: [{ id: 'pv1', productId: 'p1', isActive: true, name: 'Can' }] as Row[],
    inventories: [{
      id: 'inv1', businessId: 'biz1', branchId: 'br1', productId: 'p1', variantId: 'pv1',
      currentQuantity: opts.inventoryQuantity ?? '100', reservedQuantity: '0',
    }] as Row[],
    customers: [{
      id: 'cust1', businessId: 'biz1', name: 'Test Customer',
      status: 'ACTIVE', creditLimit: '5000', currentBalance: opts.existingBalance ?? '1000',
      ...(opts.customerOverrides ?? {}),
    }] as Row[],
    sales: [] as Row[],
  };

  const findOne = (table: Row[], pred: (r: Row) => boolean) => {
    const found = table.find(pred);
    return found ? { ...found } : null;
  };

  const makeDelegates = (log: (label: string) => void) => ({
    branch: { findFirst: async (a: any) => (log('branch.findFirst'), findOne(rows.branches, (r) => (!a.where.id || r.id === a.where.id) && (!a.where.businessId || r.businessId === a.where.businessId))) },
    user: { findFirst: async (a: any) => (log('user.findFirst'), findOne(rows.users, (r) => r.id === a.where.id && r.businessId === a.where.businessId && (a.where.isActive === undefined || r.isActive === a.where.isActive))) },
    product: { findFirst: async (a: any) => (log('product.findFirst'), findOne(rows.products, (r) => r.id === a.where.id && r.businessId === a.where.businessId && (a.where.isActive === undefined || r.isActive === a.where.isActive))) },
    productVariant: { findFirst: async (a: any) => (log('productVariant.findFirst'), findOne(rows.productVariants, (r) => r.id === a.where.id && r.productId === a.where.productId && (a.where.isActive === undefined || r.isActive === a.where.isActive))) },
    inventory: {
      findFirst: async (a: any) => (log('inventory.findFirst'), findOne(rows.inventories, (r) => r.businessId === a.where.businessId && r.branchId === a.where.branchId && r.productId === a.where.productId && (a.where.variantId ?? null) === r.variantId)),
      update: async (a: any) => {
        log('inventory.update');
        const inv = rows.inventories.find((r) => r.id === a.where.id)!;
        if (a.data.currentQuantity !== undefined) inv.currentQuantity = a.data.currentQuantity.toFixed(2);
        return { ...inv };
      },
    },
    stockMovement: { create: async (a: any) => (log('stockMovement.create'), ({ id: 'sm-' + writes.length, ...a.data })) },
    customer: {
      findUnique: async (a: any) => (log('customer.findUnique'), findOne(rows.customers, (r) => r.id === a.where.id)),
      update: async (a: any) => {
        log('customer.update');
        const c = rows.customers.find((r) => r.id === a.where.id)!;
        if (a.data.currentBalance !== undefined) c.currentBalance = a.data.currentBalance.toFixed(2);
        return { ...c };
      },
    },
    customerLedger: { create: async (a: any) => (log('customerLedger.create'), writes.push(`ledger:debit=${a.data.debit.toFixed?.() ?? a.data.debit}:balance=${a.data.balance.toFixed?.() ?? a.data.balance}`), ({ id: 'cl-' + writes.length, ...a.data })) },
    sale: {
      findFirst: async () => (log('sale.findFirst'), rows.sales.length ? { saleNumber: rows.sales[rows.sales.length - 1].saleNumber } : null),
      findUnique: async (a: any) => (log('sale.findUnique'), findOne(rows.sales, (r) => r.idempotencyKey === a.where.idempotencyKey)),
      create: async (a: any) => {
        log('sale.create');
        writes.push(`sale:amountPaid=${a.data.amountPaid.toFixed?.() ?? a.data.amountPaid}:outstanding=${a.data.outstandingAmount.toFixed?.() ?? a.data.outstandingAmount}`);
        const sale = {
          id: 'sale-' + (rows.sales.length + 1),
          saleNumber: `SALE-${String(rows.sales.length + 1).padStart(6, '0')}`,
          branchId: a.data.branchId,
          status: a.data.status,
          total: a.data.total,
          subtotal: a.data.subtotal,
          taxAmount: a.data.taxAmount,
          discountAmount: a.data.discountAmount,
          amountPaid: a.data.amountPaid,
          outstandingAmount: a.data.outstandingAmount,
          idempotencyKey: a.data.idempotencyKey,
          items: (a.data.items?.create ?? []).map((it: Row, i: number) => ({ id: 'si' + i, ...it, product: { id: it.productId, name: 'Cola' }, variant: it.variantId ? { id: it.variantId, name: 'Can' } : null })),
          payments: (a.data.payments?.create ?? []).map((pa: Row, i: number) => ({ id: 'pay' + i, ...pa })),
          cashier: { id: 'cashier1', username: 'cashier', fullName: 'Test Cashier' },
        };
        rows.sales.push(sale);
        return JSON.parse(JSON.stringify(sale));
      },
    },
  });

  let committed = 0; let rollbacks = 0;
  const makeDb = () => ({
    ...makeDelegates((label) => writes.push(label)),
    $transaction: async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
      const start = writes.length;
      // Snapshot mutable state so a rollback restores it like a real DB would
      const snapshot = {
        salesCount: rows.sales.length,
        invQty: rows.inventories.map((r) => r.currentQuantity),
        custBal: rows.customers.map((r) => r.currentBalance),
      };
      try {
        const result = await fn(makeDelegates((label) => writes.push('tx:' + label)) as never);
        committed++;
        return result;
      } catch (e) {
        rollbacks++;
        writes.length = start; // discard uncommitted write log
        rows.sales.length = snapshot.salesCount;
        rows.inventories.forEach((r, i) => { r.currentQuantity = snapshot.invQty[i]; });
        rows.customers.forEach((r, i) => { r.currentBalance = snapshot.custBal[i]; });
        throw e;
      }
    },
  });

  return {
    db: makeDb(),
    rows,
    writes,
    stats: { get committed() { return committed; }, get rollbacks() { return rollbacks; } },
  };
}

function saleInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    businessId: 'biz1',
    branchId: 'br1',
    cashierId: 'cashier1',
    customerId: undefined,
    items: [{ productId: 'p1', variantId: 'pv1', quantity: 2, unitPrice: 500, lineTotal: 1000 }],
    payments: [{ paymentMethod: 'CASH', amount: 1000, cashReceived: 1000, cashChange: 0 }],
    subtotal: 1000,
    total: 1000,
    ...overrides,
  };
}

describe('H1: createSale payment scenarios (injected in-memory DB)', () => {
  it('1. FULL PAYMENT: sale completed, payment recorded, no outstanding, no ledger', async () => {
    const f = makeFakeDb();
    const auditCalls: Row[] = [];
    const sale = await createSale(saleInput(), undefined, undefined, { prisma: f.db as never, audit: (async (a: Row) => { auditCalls.push(a); }) as never });

    assert.equal(sale.status, 'COMPLETED');
    assert.equal(Number(sale.total), 1000);
    assert.equal(Number(sale.amountPaid), 1000);
    assert.equal(Number(sale.outstandingAmount), 0);
    assert.equal(sale.payments.length, 1);
    assert.equal(sale.payments[0].amount, 1000);
    assert.ok(!f.writes.some((w) => w.startsWith('ledger:')), 'no credit ledger entry for a fully paid sale');
    assert.equal(Number(f.rows.customers[0].currentBalance), 1000, 'customer balance untouched');
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].action, 'SALE_CREATED');
  });

  it('2. PARTIAL PAYMENT: 600 of 1000 recorded, 400 outstanding on the customer account', async () => {
    const f = makeFakeDb();
    const sale = await createSale(
      saleInput({
        customerId: 'cust1',
        payments: [{ paymentMethod: 'CASH', amount: 600, cashReceived: 600, cashChange: 0 }],
        amountPaid: 600,
        outstandingAmount: 400,
      }),
      undefined, undefined,
      { prisma: f.db as never, audit: (async () => {}) as never }
    );

    assert.equal(Number(sale.amountPaid), 600);
    assert.equal(Number(sale.outstandingAmount), 400);
    // invariant: total = paid + outstanding
    assert.equal(Number(sale.amountPaid) + Number(sale.outstandingAmount), Number(sale.total));
    const ledger = f.writes.find((w) => w.startsWith('ledger:'));
    assert.ok(ledger, 'credit ledger entry created');
    assert.equal(ledger, 'ledger:debit=400:balance=1400', 'ledger debits exactly the outstanding and carries the new balance');
    assert.equal(Number(f.rows.customers[0].currentBalance), 1400, 'customer balance increased by the credit portion');
  });

  it('3. FULL CREDIT: zero tendered payments, entire total becomes outstanding', async () => {
    const f = makeFakeDb();
    const sale = await createSale(
      saleInput({
        customerId: 'cust1',
        payments: [],
        amountPaid: 0,
        outstandingAmount: 1000,
      }),
      undefined, undefined,
      { prisma: f.db as never, audit: (async () => {}) as never }
    );

    assert.equal(Number(sale.amountPaid), 0);
    assert.equal(Number(sale.outstandingAmount), 1000);
    assert.equal(sale.payments.length, 0, 'no payment rows for a zero-tender credit sale');
    const ledger = f.writes.find((w) => w.startsWith('ledger:'));
    assert.equal(ledger, 'ledger:debit=1000:balance=2000');
    assert.equal(Number(f.rows.customers[0].currentBalance), 2000);
  });

  it('4. SPLIT PAYMENT: cash 400 + card 300 + 300 credit all reconcile', async () => {
    const f = makeFakeDb();
    const sale = await createSale(
      saleInput({
        customerId: 'cust1',
        payments: [
          { paymentMethod: 'CASH', amount: 400, cashReceived: 400, cashChange: 0 },
          { paymentMethod: 'CARD', amount: 300, referenceNumber: 'AUTH-123' },
        ],
        amountPaid: 700,
        outstandingAmount: 300,
      }),
      undefined, undefined,
      { prisma: f.db as never, audit: (async () => {}) as never }
    );

    assert.equal(sale.payments.length, 2, 'each tender component preserved');
    assert.equal(Number(sale.amountPaid), 700);
    assert.equal(Number(sale.outstandingAmount), 300);
    assert.equal(Number(sale.amountPaid) + Number(sale.outstandingAmount), 1000);
    assert.ok(f.writes.some((w) => w === 'ledger:debit=300:balance=1300'));
  });

  it('5. OVERPAYMENT: recorded payments above the total are rejected', async () => {
    const f = makeFakeDb();
    await assert.rejects(
      () => createSale(saleInput({ payments: [{ paymentMethod: 'CARD', amount: 1100 }] }), undefined, undefined, { prisma: f.db as never, audit: (async () => {}) as never }),
      /exceeds the sale total/i
    );
    assert.equal(f.rows.sales.length, 0, 'no sale written');
  });

  it('6. CASH CHANGE: over-tender is returned as change, not recorded as overpayment', async () => {
    const f = makeFakeDb();
    const sale = await createSale(
      saleInput({ payments: [{ paymentMethod: 'CASH', amount: 1000, cashReceived: 1500, cashChange: 500 }] }),
      undefined, undefined,
      { prisma: f.db as never, audit: (async () => {}) as never }
    );
    assert.equal(Number(sale.amountPaid), 1000);
    assert.equal(Number(sale.outstandingAmount), 0);
    assert.equal(sale.payments[0].cashChange, 500, 'change preserved on the payment record');
  });

  it('7. INVALID PAYMENTS: bad method, zero/negative amount, short cash — all rejected before any write', async () => {
    const badInputs = [
      { payments: [{ paymentMethod: 'VOUCHER', amount: 1000 }] },
      { payments: [{ paymentMethod: 'CASH', amount: 0 }] },
      { payments: [{ paymentMethod: 'CASH', amount: 1000, cashReceived: 500 }] },
    ];
    for (const bad of badInputs) {
      const f = makeFakeDb();
      await assert.rejects(
        () => createSale(saleInput(bad), undefined, undefined, { prisma: f.db as never, audit: (async () => {}) as never }),
        Error
      );
      assert.ok(!f.writes.some((w) => w.includes('sale.create') || w.startsWith('tx:')), `no transactional writes for ${JSON.stringify(bad)}`);
    }
  });

  it('8. CREDIT WITHOUT CUSTOMER: partial payment is rejected with a clear error', async () => {
    const f = makeFakeDb();
    await assert.rejects(
      () => createSale(
        saleInput({ payments: [{ paymentMethod: 'CASH', amount: 600, cashReceived: 600 }] }),
        undefined, undefined,
        { prisma: f.db as never, audit: (async () => {}) as never }
      ),
      /customer account is required/i
    );
    assert.equal(f.rows.sales.length, 0);
  });

  it('9. CALLER CONSISTENCY: amountPaid/outstandingAmount that contradict the tendered payments are rejected', async () => {
    const f = makeFakeDb();
    await assert.rejects(
      () => createSale(saleInput({ amountPaid: 999, outstandingAmount: 1 }), undefined, undefined, { prisma: f.db as never, audit: (async () => {}) as never }),
      /amountPaid does not match/i
    );
    const f2 = makeFakeDb();
    await assert.rejects(
      () => createSale(saleInput({ outstandingAmount: 999 }), undefined, undefined, { prisma: f.db as never, audit: (async () => {}) as never }),
      /outstandingAmount does not match/i
    );
    assert.equal(f.rows.sales.length + f2.rows.sales.length, 0);
  });

  it('10. CREDIT RULES: exceeding limit / inactive / zero-limit customers abort the transaction', async () => {
    // limit exceeded: balance 4800 + 400 credit > 5000 limit
    const f1 = makeFakeDb({ existingBalance: '4800' });
    await assert.rejects(
      () => createSale(
        saleInput({ customerId: 'cust1', payments: [{ paymentMethod: 'CASH', amount: 600, cashReceived: 600 }] }),
        undefined, undefined,
        { prisma: f1.db as never, audit: (async () => {}) as never }
      ),
      /Credit limit exceeded/i
    );
    assert.equal(f1.stats.rollbacks, 1, 'transaction rolled back');
    assert.equal(f1.rows.sales.length, 0, 'no sale persisted');
    assert.equal(Number(f1.rows.customers[0].currentBalance), 4800, 'balance unchanged');

    const f2 = makeFakeDb({ customerOverrides: { status: 'INACTIVE' } });
    await assert.rejects(
      () => createSale(saleInput({ customerId: 'cust1', payments: [] }), undefined, undefined, { prisma: f2.db as never, audit: (async () => {}) as never }),
      /inactive customer/i
    );

    const f3 = makeFakeDb({ customerOverrides: { creditLimit: '0' } });
    await assert.rejects(
      () => createSale(saleInput({ customerId: 'cust1', payments: [] }), undefined, undefined, { prisma: f3.db as never, audit: (async () => {}) as never }),
      /no credit limit configured/i
    );
  });

  it('11. INVENTORY FAILURE: mid-transaction stock error aborts the whole sale (rollback path)', async () => {
    const f = makeFakeDb({ inventoryQuantity: '1' }); // sale needs 2
    await assert.rejects(
      () => createSale(saleInput(), undefined, undefined, { prisma: f.db as never, audit: (async () => {}) as never }),
      /Insufficient stock/i
    );
    assert.equal(f.stats.rollbacks, 1, 'transaction rolled back');
    assert.equal(f.rows.sales.length, 0, 'no sale row persisted');
    assert.equal(Number(f.rows.inventories[0].currentQuantity), 1, 'inventory untouched after rollback');
  });

  it('12. IDEMPOTENCY: duplicate submission is detected before any write', async () => {
    const f = makeFakeDb();
    const deps = { prisma: f.db as never, audit: (async () => {}) as never };
    await createSale(saleInput({ idempotencyKey: 'key-1' }), undefined, undefined, deps);
    await assert.rejects(
      () => createSale(saleInput({ idempotencyKey: 'key-1' }), undefined, undefined, deps),
      /Duplicate sale submission/i
    );
    assert.equal(f.rows.sales.length, 1);
  });

  it('13. FINANCIAL SEQUENCE: payments and sale row carry the exact tendered components', async () => {
    const f = makeFakeDb();
    const sale = await createSale(
      saleInput({
        customerId: 'cust1',
        payments: [
          { paymentMethod: 'CASH', amount: 400, cashReceived: 500, cashChange: 100 },
          { paymentMethod: 'BANK_TRANSFER', amount: 350, referenceNumber: 'TR-9' },
        ],
        amountPaid: 750,
        outstandingAmount: 250,
      }),
      undefined, undefined,
      { prisma: f.db as never, audit: (async () => {}) as never }
    );
    assert.deepEqual(
      sale.payments.map((p) => ({ m: p.paymentMethod, a: Number(p.amount) })),
      [{ m: 'CASH', a: 400 }, { m: 'BANK_TRANSFER', a: 350 }]
    );
    assert.equal(Number(sale.payments[0].cashChange), 100);
    assert.equal(Number(sale.total), Number(sale.amountPaid) + Number(sale.outstandingAmount));
  });
});
