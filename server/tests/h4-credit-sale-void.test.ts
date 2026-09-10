/**
 * H4: Credit sale void / customer ledger reversal regression coverage.
 *
 * The scenarios use a transaction-shaped in-memory database because this
 * repository has no committed PGlite dependency and no PostgreSQL service is
 * available in the test environment. The fake implements the same writes
 * used by saleService.voidSale, including the conditional status claim.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library.js';
import { voidSale } from '../src/services/saleService.js';

type Row = Record<string, any>;

interface ScenarioOptions {
  outstandingAmount: string;
  amountPaid: string;
  payments?: Row[];
  customerBalance?: string;
}

function makeDb(options: ScenarioOptions) {
  const rows = {
    sale: {
      id: 'sale-1',
      businessId: 'business-1',
      branchId: 'branch-1',
      saleNumber: 'SALE-000001',
      status: 'COMPLETED',
      total: new Decimal('1000.00'),
      amountPaid: new Decimal(options.amountPaid),
      outstandingAmount: new Decimal(options.outstandingAmount),
      customerId: 'customer-1',
      items: [{
        id: 'item-1',
        saleId: 'sale-1',
        productId: 'product-1',
        variantId: null,
        quantity: new Decimal('2'),
      }],
      payments: options.payments ?? [],
    },
    customer: {
      id: 'customer-1',
      businessId: 'business-1',
      currentBalance: new Decimal(options.customerBalance ?? options.outstandingAmount),
    },
    inventory: {
      id: 'inventory-1',
      businessId: 'business-1',
      branchId: 'branch-1',
      productId: 'product-1',
      variantId: null,
      currentQuantity: new Decimal('8'),
    },
    ledger: [{
      id: 'ledger-sale-1',
      businessId: 'business-1',
      customerId: 'customer-1',
      referenceType: 'SALE',
      referenceId: 'sale-1',
      debit: new Decimal(options.outstandingAmount),
      credit: new Decimal('0'),
      balance: new Decimal(options.customerBalance ?? options.outstandingAmount),
    }] as Row[],
    stockMovements: [] as Row[],
  };

  const db: any = {
    sale: {
      findFirst: async ({ where }: any) => {
        if (where.id !== rows.sale.id || where.businessId !== rows.sale.businessId) return null;
        return { ...rows.sale, items: rows.sale.items.map((item: Row) => ({ ...item })) };
      },
      updateMany: async ({ where, data }: any) => {
        if (
          where.id !== rows.sale.id ||
          where.businessId !== rows.sale.businessId ||
          where.status !== rows.sale.status
        ) return { count: 0 };
        Object.assign(rows.sale, data);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        if (where.id !== rows.sale.id) throw new Error('Sale not found');
        Object.assign(rows.sale, data);
        return { ...rows.sale };
      },
    },
    customer: {
      findUnique: async ({ where }: any) => where.id === rows.customer.id ? { ...rows.customer } : null,
      update: async ({ where, data }: any) => {
        if (where.id !== rows.customer.id) throw new Error('Customer not found');
        Object.assign(rows.customer, data);
        return { ...rows.customer };
      },
    },
    customerLedger: {
      findFirst: async ({ where }: any) => rows.ledger.find((entry) =>
        entry.businessId === where.businessId &&
        entry.customerId === where.customerId &&
        entry.referenceType === where.referenceType &&
        entry.referenceId === where.referenceId
      ) ?? null,
      create: async ({ data }: any) => {
        const entry = { id: `ledger-${rows.ledger.length + 1}`, ...data };
        rows.ledger.push(entry);
        return entry;
      },
    },
    inventory: {
      findFirst: async ({ where }: any) => (
        where.id === rows.inventory.id || (
          where.businessId === rows.inventory.businessId &&
          where.branchId === rows.inventory.branchId &&
          where.productId === rows.inventory.productId &&
          (where.variantId ?? null) === rows.inventory.variantId
        )
      ) ? { ...rows.inventory } : null,
      update: async ({ where, data }: any) => {
        if (where.id !== rows.inventory.id) throw new Error('Inventory not found');
        Object.assign(rows.inventory, data);
        return { ...rows.inventory };
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        const movement = { id: `movement-${rows.stockMovements.length + 1}`, ...data };
        rows.stockMovements.push(movement);
        return movement;
      },
    },
    user: {
      findUnique: async () => ({ fullName: 'Test User' }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
  };

  return { db, rows };
}

const audit = async () => undefined;

async function voidWith(db: any) {
  return voidSale(
    'sale-1',
    'business-1',
    'user-1',
    'Customer cancelled the order',
    undefined,
    undefined,
    { prisma: db, audit } as any
  );
}

describe('H4: full credit sale void', () => {
  it('reverses the exact receivable, balance, and inventory once', async () => {
    const { db, rows } = makeDb({ outstandingAmount: '1000.00', amountPaid: '0.00' });

    const result = await voidWith(db);

    assert.equal(result.status, 'VOIDED');
    assert.equal(rows.customer.currentBalance.toFixed(2), '0.00');
    assert.equal(rows.inventory.currentQuantity.toFixed(2), '10.00');

    const reversals = rows.ledger.filter((entry) => entry.referenceType === 'SALE_VOID');
    assert.equal(reversals.length, 1);
    assert.equal(reversals[0].debit.toFixed(2), '0.00');
    assert.equal(reversals[0].credit.toFixed(2), '1000.00');
    assert.equal(reversals[0].referenceId, 'sale-1');
    assert.equal(rows.stockMovements.length, 1);
    assert.equal(rows.stockMovements[0].movementType, 'SALE_VOID');
  });
});

describe('H4: partial-payment credit sale void', () => {
  it('reverses only the outstanding 600 and preserves the historical 400 tender', async () => {
    const payment = { id: 'payment-1', paymentMethod: 'CASH', amount: new Decimal('400.00') };
    const { db, rows } = makeDb({
      outstandingAmount: '600.00',
      amountPaid: '400.00',
      payments: [payment],
    });

    await voidWith(db);

    assert.equal(rows.customer.currentBalance.toFixed(2), '0.00');
    const reversal = rows.ledger.find((entry) => entry.referenceType === 'SALE_VOID');
    assert.ok(reversal);
    assert.equal(reversal.credit.toFixed(2), '600.00');
    assert.notEqual(reversal.credit.toFixed(2), '1000.00');
    assert.equal(rows.sale.payments.length, 1);
    assert.equal(rows.sale.payments[0].amount.toFixed(2), '400.00');
    assert.equal(rows.stockMovements.length, 1);
  });
});

describe('H4: repeated void protection', () => {
  it('reverses against the current customer balance, preserving prior receivables', async () => {
    const { db, rows } = makeDb({
      outstandingAmount: '1000.00',
      amountPaid: '0.00',
      customerBalance: '2500.00',
    });

    await voidWith(db);

    assert.equal(rows.customer.currentBalance.toFixed(2), '1500.00');
    const reversal = rows.ledger.find((entry) => entry.referenceType === 'SALE_VOID');
    assert.ok(reversal);
    assert.equal(reversal.balance.toFixed(2), '1500.00');
  });

  it('does not reverse the ledger or inventory a second time', async () => {
    const { db, rows } = makeDb({ outstandingAmount: '1000.00', amountPaid: '0.00' });

    await voidWith(db);
    await assert.rejects(
      () => voidWith(db),
      /Only completed sales can be voided/
    );

    assert.equal(rows.customer.currentBalance.toFixed(2), '0.00');
    assert.equal(rows.ledger.filter((entry) => entry.referenceType === 'SALE_VOID').length, 1);
    assert.equal(rows.stockMovements.length, 1);
    assert.equal(rows.inventory.currentQuantity.toFixed(2), '10.00');
  });

  it('allows only one of two simultaneous void claims to mutate the sale', async () => {
    const { db, rows } = makeDb({ outstandingAmount: '1000.00', amountPaid: '0.00' });

    const results = await Promise.allSettled([voidWith(db), voidWith(db)]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(rows.ledger.filter((entry) => entry.referenceType === 'SALE_VOID').length, 1);
    assert.equal(rows.stockMovements.length, 1);
    assert.equal(rows.inventory.currentQuantity.toFixed(2), '10.00');
  });
});

describe('H4: sale-payment/report semantics', () => {
  it('does not create a duplicate customer payment or mutate sale payment history', async () => {
    const payment = { id: 'payment-1', paymentMethod: 'CARD', amount: new Decimal('400.00') };
    const { db, rows } = makeDb({
      outstandingAmount: '600.00',
      amountPaid: '400.00',
      payments: [payment],
    });

    await voidWith(db);

    assert.equal(rows.sale.payments.length, 1);
    assert.equal(rows.sale.payments[0].id, 'payment-1');
    assert.equal(rows.ledger.filter((entry) => entry.referenceType === 'PAYMENT').length, 0);
    // Existing reports use Sale.status = COMPLETED, so this sale is excluded.
    assert.equal(rows.sale.status, 'VOIDED');
  });
});
