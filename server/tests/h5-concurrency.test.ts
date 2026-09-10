/**
 * H5 concurrency regressions.
 *
 * The repository does not have PostgreSQL or PGlite available in this
 * environment, so these tests use a transaction-shaped store. Its
 * updateMany({ currentQuantity: { gte }, currentQuantity: { decrement } })
 * operation is atomic and its transaction wrapper restores every write made
 * by a failed operation. This proves the service's operation ordering,
 * conditional stock boundary, rollback, and durable unique-key behavior, but
 * it is not a substitute for a real PostgreSQL lock/isolation test.
 *
 * The production proof is the corresponding PostgreSQL operations in
 * saleService.ts and inventoryService.ts: the inventory predicate/decrement
 * executes in the database transaction, and sale-number/idempotency unique
 * violations are retried or surfaced without committing partial effects.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library.js';

import { createSale, type CreateSaleInput } from '../src/services/saleService.js';
import { generateInvoiceNumber } from '../src/services/settingsService.js';

type Row = Record<string, any>;

type Scenario = {
  stock: number;
  variants?: string[];
  productIds?: string[];
};

function makeTransactionStore(scenario: Scenario) {
  const variantIds = scenario.variants ?? ['variant-1'];
  const productIds = scenario.productIds ?? ['product-1'];
  const inventory = productIds.flatMap((productId, productIndex) =>
    variantIds.map((variantId, variantIndex) => ({
      id: `inventory-${productIndex}-${variantIndex}`,
      businessId: 'business-1',
      branchId: 'branch-1',
      productId,
      variantId,
      currentQuantity: new Decimal(scenario.stock),
      reservedQuantity: new Decimal(0),
    }))
  );

  const rows = {
    branches: [{ id: 'branch-1', businessId: 'business-1' }] as Row[],
    users: [{ id: 'cashier-1', businessId: 'business-1', isActive: true, fullName: 'Cashier' }] as Row[],
    products: productIds.map((id) => ({ id, businessId: 'business-1', isActive: true, name: id })) as Row[],
    variants: variantIds.flatMap((id, index) => productIds.map((productId) => ({
      id: productIds.length === 1 ? id : `${id}-${productId}`,
      productId,
      isActive: true,
      name: `Variant ${index}`,
    }))) as Row[],
    inventory,
    sales: [] as Row[],
    payments: [] as Row[],
    movements: [] as Row[],
    ledger: [] as Row[],
    customers: [{
      id: 'customer-1',
      businessId: 'business-1',
      status: 'ACTIVE',
      creditLimit: new Decimal(100000),
      currentBalance: new Decimal(0),
    }] as Row[],
  };

  const findInventory = (where: Row) => rows.inventory.find((entry) =>
    (where.id === undefined || entry.id === where.id) &&
    (where.businessId === undefined || entry.businessId === where.businessId) &&
    (where.branchId === undefined || entry.branchId === where.branchId) &&
    (where.productId === undefined || entry.productId === where.productId) &&
    (where.variantId === undefined || (where.variantId ?? null) === (entry.variantId ?? null))
  );

  const matchesSale = (sale: Row, where: Row) =>
    (where.id === undefined || sale.id === where.id) &&
    (where.businessId === undefined || sale.businessId === where.businessId) &&
    (where.idempotencyKey === undefined || sale.idempotencyKey === where.idempotencyKey);

  const makeClient = (context?: {
    saleIds: string[];
    movementIds: string[];
    paymentIds: string[];
    ledgerIds: string[];
    inventoryDeltas: Array<{ inventory: Row; delta: Decimal }>;
  }): any => ({
    branch: {
      findFirst: async ({ where }: Row) => rows.branches.find((row) => row.id === where.id && row.businessId === where.businessId) ?? null,
    },
    user: {
      findFirst: async ({ where }: Row) => rows.users.find((row) => row.id === where.id && row.businessId === where.businessId && row.isActive === where.isActive) ?? null,
    },
    product: {
      findFirst: async ({ where }: Row) => rows.products.find((row) => row.id === where.id && row.businessId === where.businessId && row.isActive === where.isActive) ?? null,
    },
    productVariant: {
      findFirst: async ({ where }: Row) => rows.variants.find((row) => row.id === where.id && row.productId === where.productId && row.isActive === where.isActive) ?? null,
    },
    inventory: {
      findFirst: async ({ where }: Row) => {
        const found = findInventory(where);
        return found ? { ...found } : null;
      },
      findUnique: async ({ where }: Row) => {
        const found = findInventory(where);
        return found ? { ...found } : null;
      },
      updateMany: async ({ where, data }: Row) => {
        const found = findInventory(where);
        const requested = new Decimal(data.currentQuantity?.decrement ?? 0);
        const minimum = new Decimal(where.currentQuantity?.gte ?? 0);
        if (!found || found.currentQuantity.lt(minimum)) return { count: 0 };

        found.currentQuantity = found.currentQuantity.minus(requested);
        if (context) context.inventoryDeltas.push({ inventory: found, delta: requested.negated() });
        return { count: 1 };
      },
      update: async ({ where, data }: Row) => {
        const found = findInventory(where);
        if (!found) throw new Error('Inventory not found');
        if (data.currentQuantity?.increment !== undefined) {
          const delta = new Decimal(data.currentQuantity.increment);
          found.currentQuantity = found.currentQuantity.plus(delta);
          if (context) context.inventoryDeltas.push({ inventory: found, delta });
        } else if (data.currentQuantity !== undefined) {
          found.currentQuantity = new Decimal(data.currentQuantity);
        }
        return { ...found };
      },
    },
    stockMovement: {
      create: async ({ data }: Row) => {
        const movement = { id: `movement-${rows.movements.length + 1}`, ...data };
        rows.movements.push(movement);
        if (context) context.movementIds.push(movement.id);
        return movement;
      },
    },
    customer: {
      findUnique: async ({ where }: Row) => rows.customers.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: Row) => {
        const customer = rows.customers.find((row) => row.id === where.id);
        if (!customer) throw new Error('Customer not found');
        customer.currentBalance = data.currentBalance;
        return { ...customer };
      },
    },
    customerLedger: {
      create: async ({ data }: Row) => {
        const entry = { id: `ledger-${rows.ledger.length + 1}`, ...data };
        rows.ledger.push(entry);
        if (context) context.ledgerIds.push(entry.id);
        return entry;
      },
    },
    sale: {
      findFirst: async ({ where }: Row) => {
        const matching = rows.sales.filter((sale) => matchesSale(sale, where));
        const latest = matching[matching.length - 1];
        return latest ? { saleNumber: latest.saleNumber } : null;
      },
      findUnique: async ({ where }: Row) => rows.sales.find((sale) => matchesSale(sale, where)) ?? null,
      create: async ({ data }: Row) => {
        if (rows.sales.some((sale) => sale.businessId === data.businessId && sale.saleNumber === data.saleNumber)) {
          throw { code: 'P2002', meta: { target: ['business_id_sale_number'] }, message: 'Unique constraint failed on sale_number' };
        }
        if (data.idempotencyKey && rows.sales.some((sale) => sale.idempotencyKey === data.idempotencyKey)) {
          throw { code: 'P2002', meta: { target: ['idempotency_key'] }, message: 'Unique constraint failed on idempotencyKey' };
        }
        const paymentRows = (data.payments?.create ?? []).map((payment: Row, index: number) => ({ id: `payment-${rows.sales.length + 1}-${index}`, ...payment }));
        rows.payments.push(...paymentRows);
        if (context) context.paymentIds.push(...paymentRows.map((payment) => payment.id));

        const sale = {
          id: `sale-${rows.sales.length + 1}`,
          businessId: data.businessId,
          branchId: data.branchId,
          saleNumber: data.saleNumber,
          status: data.status,
          total: data.total,
          subtotal: data.subtotal,
          taxAmount: data.taxAmount,
          discountAmount: data.discountAmount,
          amountPaid: data.amountPaid,
          outstandingAmount: data.outstandingAmount,
          customerId: data.customerId,
          idempotencyKey: data.idempotencyKey,
          createdAt: new Date(),
          items: (data.items?.create ?? []).map((item: Row) => ({
            id: `sale-item-${rows.sales.length + 1}`,
            ...item,
            product: { id: item.productId, name: item.productId },
            variant: item.variantId ? { id: item.variantId, name: item.variantId } : null,
          })),
          payments: paymentRows,
          cashier: { id: 'cashier-1', username: 'cashier', fullName: 'Cashier' },
        };
        rows.sales.push(sale);
        if (context) context.saleIds.push(sale.id);
        return { ...sale };
      },
    },
  });

  const db: any = {
    ...makeClient(),
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const context = { saleIds: [], movementIds: [], paymentIds: [], ledgerIds: [], inventoryDeltas: [] } as {
        saleIds: string[];
        movementIds: string[];
        paymentIds: string[];
        ledgerIds: string[];
        inventoryDeltas: Array<{ inventory: Row; delta: Decimal }>;
      };
      try {
        return await callback(makeClient(context));
      } catch (error) {
        for (const change of context.inventoryDeltas.reverse()) {
          change.inventory.currentQuantity = change.inventory.currentQuantity.minus(change.delta);
        }
        rows.sales = rows.sales.filter((sale) => !context.saleIds.includes(sale.id));
        rows.payments = rows.payments.filter((payment) => !context.paymentIds.includes(payment.id));
        rows.movements = rows.movements.filter((movement) => !context.movementIds.includes(movement.id));
        rows.ledger = rows.ledger.filter((entry) => !context.ledgerIds.includes(entry.id));
        throw error;
      }
    },
  };

  return { db, rows };
}

function saleInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    businessId: 'business-1',
    branchId: 'branch-1',
    cashierId: 'cashier-1',
    items: [{
      productId: 'product-1',
      variantId: 'variant-1',
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    }],
    payments: [{ paymentMethod: 'CASH', amount: 10, cashReceived: 10 }],
    subtotal: 10,
    total: 10,
    taxAmount: 0,
    discountAmount: 0,
    ...overrides,
  };
}

const deps = (db: any) => ({ prisma: db as never, audit: (async () => undefined) as never });

function makeInvoiceStore() {
  let setting: Row | null = null;
  let tail = Promise.resolve();
  const db: any = {
    $queryRaw: async () => [],
    setting: {
      findUnique: async () => (setting ? { ...setting } : null),
      upsert: async ({ create, update }: Row) => {
        if (!setting) setting = { id: 'setting-1', ...create };
        else setting = { ...setting, ...update, value: update.value };
        return { ...setting };
      },
    },
  };
  db.$transaction = async (callback: (tx: any) => Promise<unknown>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback(db);
    } finally {
      release();
    }
  };
  return { db, getSetting: () => setting };
}

async function runConcurrent(db: any, inputs: CreateSaleInput[]) {
  return Promise.allSettled(inputs.map((input) => createSale(input, undefined, undefined, deps(db))));
}

describe('H5: concurrent checkout inventory boundaries', () => {
  it('allows only one of two quantity-seven checkouts against stock ten and leaves three', async () => {
    const boundary = makeTransactionStore({ stock: 10 });
    const boundaryResults = await runConcurrent(boundary.db, [
      saleInput({ items: [{ productId: 'product-1', variantId: 'variant-1', quantity: 7, unitPrice: 10, lineTotal: 70 }], subtotal: 70, total: 70, payments: [{ paymentMethod: 'CASH', amount: 70, cashReceived: 70 }] }),
      saleInput({ items: [{ productId: 'product-1', variantId: 'variant-1', quantity: 7, unitPrice: 10, lineTotal: 70 }], subtotal: 70, total: 70, payments: [{ paymentMethod: 'CASH', amount: 70, cashReceived: 70 }] }),
    ]);
    assert.equal(boundaryResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(boundaryResults.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(Number(boundary.rows.inventory[0].currentQuantity), 3);
  });

  it('supports ten-plus simultaneous checkouts exactly to stock, then rejects one unit over', async () => {
    const store = makeTransactionStore({ stock: 10 });
    const results = await runConcurrent(store.db, Array.from({ length: 11 }, () => saleInput()));
    const successful = results.filter((result) => result.status === 'fulfilled');
    assert.equal(successful.length, 10);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(Number(store.rows.inventory[0].currentQuantity), 0);
    assert.equal(new Set(successful.map((result) => (result as PromiseFulfilledResult<any>).value.saleNumber)).size, 10);
    assert.deepEqual(
      successful.map((result) => (result as PromiseFulfilledResult<any>).value.saleNumber).sort(),
      Array.from({ length: 10 }, (_, index) => `SALE-${String(index + 1).padStart(6, '0')}`),
    );
  });

  it('keeps different product variants independent while applying the same atomic boundary', async () => {
    const store = makeTransactionStore({ stock: 1, variants: ['variant-1', 'variant-2'] });
    const results = await runConcurrent(store.db, [
      saleInput(),
      saleInput({ items: [{ productId: 'product-1', variantId: 'variant-2', quantity: 1, unitPrice: 10, lineTotal: 10 }] }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assert.equal(Number(store.rows.inventory[0].currentQuantity), 0);
    assert.equal(Number(store.rows.inventory[1].currentQuantity), 0);
  });

  it('rolls back sale, payment, movement, and inventory when the atomic stock boundary fails', async () => {
    const store = makeTransactionStore({ stock: 1 });
    const result = await createSale(
      saleInput({ items: [{ productId: 'product-1', variantId: 'variant-1', quantity: 2, unitPrice: 10, lineTotal: 20 }], subtotal: 20, total: 20, payments: [{ paymentMethod: 'CARD', amount: 20 }] }),
      undefined,
      undefined,
      deps(store.db),
    ).then(() => null, (error) => error);

    assert.match(String(result?.message), /Insufficient stock/i);
    assert.equal(store.rows.sales.length, 0);
    assert.equal(store.rows.payments.length, 0);
    assert.equal(store.rows.movements.length, 0);
    assert.equal(Number(store.rows.inventory[0].currentQuantity), 1);

    const retry = await createSale(saleInput(), undefined, undefined, deps(store.db));
    assert.equal(retry.saleNumber, 'SALE-000001', 'a rolled-back checkout does not consume a sale number');
  });
});

describe('H5: invoice numbering and persistent duplicate keys', () => {
  it('allocates unique INV-prefixed six-digit invoice numbers under concurrent calls', async () => {
    const store = makeInvoiceStore();
    const numbers = await Promise.all(Array.from({ length: 11 }, () => generateInvoiceNumber(
      'business-1',
      { prisma: store.db as never, audit: (async () => undefined) as never },
    )));

    assert.equal(new Set(numbers).size, 11);
    assert.deepEqual(
      numbers.sort(),
      Array.from({ length: 11 }, (_, index) => `INV${String(index + 1).padStart(6, '0')}`),
    );
    assert.equal((store.getSetting()?.value as Row).nextNumber, 12);
  });
});

describe('H5: payments and persistent duplicate keys', () => {
  it('preserves cash, credit, and partial-payment financial paths in concurrent-safe transactions', async () => {
    const store = makeTransactionStore({ stock: 3 });
    await createSale(saleInput(), undefined, undefined, deps(store.db));
    await createSale(saleInput({
      customerId: 'customer-1',
      payments: [],
      amountPaid: 0,
      outstandingAmount: 10,
    }), undefined, undefined, deps(store.db));
    await createSale(saleInput({
      customerId: 'customer-1',
      payments: [{ paymentMethod: 'CARD', amount: 5 }],
      amountPaid: 5,
      outstandingAmount: 5,
    }), undefined, undefined, deps(store.db));

    assert.equal(store.rows.sales.length, 3);
    assert.equal(store.rows.payments.length, 2);
    assert.equal(store.rows.movements.length, 3);
    assert.equal(store.rows.ledger.length, 2);
    assert.equal(Number(store.rows.customers[0].currentBalance), 15);
    assert.equal(Number(store.rows.inventory[0].currentQuantity), 0);
  });

  it('allows only one committed sale for concurrent duplicate idempotency retries', async () => {
    const store = makeTransactionStore({ stock: 2 });
    const results = await runConcurrent(store.db, [
      saleInput({ idempotencyKey: 'offline-operation-1' }),
      saleInput({ idempotencyKey: 'offline-operation-1' }),
    ]);
    assert.equal(store.rows.sales.length, 1);
    assert.equal(Number(store.rows.inventory[0].currentQuantity), 1);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.match(String(results.find((result) => result.status === 'rejected')?.reason?.message), /Duplicate sale submission/i);
  });
});
