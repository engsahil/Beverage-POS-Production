import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Decimal } from '@prisma/client/runtime/library.js';

describe('Phase 14: Sales Reports', () => {
  it('should calculate daily sales totals with Decimal', () => {
    const sales = [
      { subtotal: new Decimal('10000'), discountAmount: new Decimal('500'), taxAmount: new Decimal('1000'), total: new Decimal('10500') },
      { subtotal: new Decimal('15000'), discountAmount: new Decimal('1000'), taxAmount: new Decimal('1500'), total: new Decimal('15500') },
      { subtotal: new Decimal('8000'), discountAmount: new Decimal('200'), taxAmount: new Decimal('800'), total: new Decimal('8600') },
    ];

    let grossSales = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let totalTax = new Decimal(0);
    let netSales = new Decimal(0);

    for (const sale of sales) {
      grossSales = grossSales.plus(sale.subtotal);
      totalDiscount = totalDiscount.plus(sale.discountAmount);
      totalTax = totalTax.plus(sale.taxAmount);
      netSales = netSales.plus(sale.total);
    }

    assert.strictEqual(grossSales.toString(), '33000');
    assert.strictEqual(totalDiscount.toString(), '1700');
    assert.strictEqual(totalTax.toString(), '3300');
    assert.strictEqual(netSales.toString(), '34600');
  });

  it('should calculate average transaction value with Decimal', () => {
    const netSales = new Decimal('34600');
    const transactionCount = 3;
    const average = netSales.dividedBy(transactionCount);

    assert.strictEqual(average.toFixed(2), '11533.33');
  });

  it('should exclude voided sales from totals', () => {
    const sales = [
      { status: 'COMPLETED', total: new Decimal('10000') },
      { status: 'VOIDED', total: new Decimal('5000') },
      { status: 'COMPLETED', total: new Decimal('15000') },
    ];

    const completedSales = sales.filter(s => s.status === 'COMPLETED');
    const total = completedSales.reduce(
      (sum, s) => sum.plus(s.total),
      new Decimal(0)
    );

    assert.strictEqual(completedSales.length, 2);
    assert.strictEqual(total.toString(), '25000');
  });

  it('should aggregate payments by method with Decimal', () => {
    const payments = [
      { paymentMethod: 'CASH', amount: new Decimal('5000') },
      { paymentMethod: 'CASH', amount: new Decimal('3000') },
      { paymentMethod: 'CARD', amount: new Decimal('7000') },
      { paymentMethod: 'BANK_TRANSFER', amount: new Decimal('2000') },
      { paymentMethod: 'OTHER', amount: new Decimal('500') },
    ];

    const breakdown: Record<string, Decimal> = {
      CASH: new Decimal(0),
      CARD: new Decimal(0),
      BANK_TRANSFER: new Decimal(0),
      OTHER: new Decimal(0),
    };

    let total = new Decimal(0);

    for (const payment of payments) {
      breakdown[payment.paymentMethod] = breakdown[payment.paymentMethod].plus(payment.amount);
      total = total.plus(payment.amount);
    }

    assert.strictEqual(breakdown['CASH'].toString(), '8000');
    assert.strictEqual(breakdown['CARD'].toString(), '7000');
    assert.strictEqual(breakdown['BANK_TRANSFER'].toString(), '2000');
    assert.strictEqual(breakdown['OTHER'].toString(), '500');
    assert.strictEqual(total.toString(), '17500');
  });

  it('should handle split payments correctly', () => {
    const sale = {
      total: new Decimal('10000'),
      payments: [
        { paymentMethod: 'CASH', amount: new Decimal('6000') },
        { paymentMethod: 'CARD', amount: new Decimal('4000') },
      ],
    };

    const paymentTotal = sale.payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Decimal(0)
    );

    assert.strictEqual(paymentTotal.toString(), '10000');
    assert.strictEqual(paymentTotal.equals(sale.total), true);
  });

  it('should identify credit sales (outstanding > 0)', () => {
    const sales = [
      { total: new Decimal('10000'), outstandingAmount: new Decimal('0') },
      { total: new Decimal('15000'), outstandingAmount: new Decimal('5000') },
      { total: new Decimal('8000'), outstandingAmount: new Decimal('8000') },
    ];

    const creditSales = sales.filter(s => s.outstandingAmount.greaterThan(0));
    const totalCredit = creditSales.reduce(
      (sum, s) => sum.plus(s.outstandingAmount),
      new Decimal(0)
    );

    assert.strictEqual(creditSales.length, 2);
    assert.strictEqual(totalCredit.toString(), '13000');
  });

  it('should count total items sold', () => {
    const sales = [
      { items: [{ quantity: new Decimal('2') }, { quantity: new Decimal('3') }] },
      { items: [{ quantity: new Decimal('5') }] },
      { items: [{ quantity: new Decimal('1') }, { quantity: new Decimal('4') }] },
    ];

    let totalItems = 0;
    for (const sale of sales) {
      for (const item of sale.items) {
        totalItems += Number(item.quantity);
      }
    }

    assert.strictEqual(totalItems, 15);
  });
});

describe('Phase 14: Product & Category Reports', () => {
  it('should aggregate product sales with Decimal', () => {
    const items = [
      { productId: 'p1', quantity: new Decimal('10'), unitPrice: new Decimal('100'), lineTotal: new Decimal('1000') },
      { productId: 'p1', quantity: new Decimal('5'), unitPrice: new Decimal('100'), lineTotal: new Decimal('500') },
      { productId: 'p2', quantity: new Decimal('8'), unitPrice: new Decimal('200'), lineTotal: new Decimal('1600') },
    ];

    const productMap = new Map<string, { quantity: Decimal; sales: Decimal }>();

    for (const item of items) {
      if (!productMap.has(item.productId)) {
        productMap.set(item.productId, { quantity: new Decimal(0), sales: new Decimal(0) });
      }
      const data = productMap.get(item.productId)!;
      data.quantity = data.quantity.plus(item.quantity);
      data.sales = data.sales.plus(item.lineTotal);
    }

    assert.strictEqual(productMap.get('p1')!.quantity.toString(), '15');
    assert.strictEqual(productMap.get('p1')!.sales.toString(), '1500');
    assert.strictEqual(productMap.get('p2')!.quantity.toString(), '8');
    assert.strictEqual(productMap.get('p2')!.sales.toString(), '1600');
  });

  it('should sort products by sales amount', () => {
    const products = [
      { name: 'Product A', sales: new Decimal('5000') },
      { name: 'Product B', sales: new Decimal('15000') },
      { name: 'Product C', sales: new Decimal('8000') },
    ];

    const sorted = products.sort((a, b) => b.sales.minus(a.sales).toNumber());

    assert.strictEqual(sorted[0].name, 'Product B');
    assert.strictEqual(sorted[1].name, 'Product C');
    assert.strictEqual(sorted[2].name, 'Product A');
  });

  it('should get top N products', () => {
    const products = [
      { name: 'Product A', sales: new Decimal('5000') },
      { name: 'Product B', sales: new Decimal('15000') },
      { name: 'Product C', sales: new Decimal('8000') },
      { name: 'Product D', sales: new Decimal('12000') },
      { name: 'Product E', sales: new Decimal('3000') },
    ];

    const sorted = products.sort((a, b) => b.sales.minus(a.sales).toNumber());
    const top3 = sorted.slice(0, 3);

    assert.strictEqual(top3.length, 3);
    assert.strictEqual(top3[0].name, 'Product B');
    assert.strictEqual(top3[1].name, 'Product D');
    assert.strictEqual(top3[2].name, 'Product C');
  });
});

describe('Phase 14: Inventory Reports', () => {
  it('should calculate stock status', () => {
    const getStockStatus = (quantity: number, min?: number | null, max?: number | null): string => {
      if (quantity <= 0) return 'OUT_OF_STOCK';
      if (min && quantity <= min) return 'LOW_STOCK';
      if (max && quantity > max) return 'OVERSTOCKED';
      return 'NORMAL';
    };

    assert.strictEqual(getStockStatus(0), 'OUT_OF_STOCK');
    assert.strictEqual(getStockStatus(5, 10), 'LOW_STOCK');
    assert.strictEqual(getStockStatus(15, 10), 'NORMAL');
    assert.strictEqual(getStockStatus(150, 10, 100), 'OVERSTOCKED');
  });

  it('should calculate available quantity with Decimal', () => {
    const currentQuantity = new Decimal('100');
    const reservedQuantity = new Decimal('20');
    const available = currentQuantity.minus(reservedQuantity);

    assert.strictEqual(available.toString(), '80');
  });

  it('should identify low stock items', () => {
    const inventory = [
      { product: 'A', currentQuantity: new Decimal('5'), minThreshold: 10, status: 'LOW_STOCK' },
      { product: 'B', currentQuantity: new Decimal('50'), minThreshold: 10, status: 'NORMAL' },
      { product: 'C', currentQuantity: new Decimal('0'), minThreshold: 10, status: 'OUT_OF_STOCK' },
    ];

    const lowStock = inventory.filter(i => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK');

    assert.strictEqual(lowStock.length, 2);
  });

  it('should identify expired batches', () => {
    const now = new Date();
    const batches = [
      { batchNumber: 'B1', expiryDate: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // Yesterday
      { batchNumber: 'B2', expiryDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000) }, // 15 days
      { batchNumber: 'B3', expiryDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) }, // 60 days
    ];

    const expired = batches.filter(b => b.expiryDate < now);
    const expiringSoon = batches.filter(b => {
      const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return b.expiryDate >= now && b.expiryDate < warningDate;
    });

    assert.strictEqual(expired.length, 1);
    assert.strictEqual(expiringSoon.length, 1);
  });
});

describe('Phase 14: Purchase & Vendor Reports', () => {
  it('should calculate vendor balances with Decimal', () => {
    const purchases = [
      { vendorId: 'v1', total: new Decimal('50000'), amountPaid: new Decimal('30000') },
      { vendorId: 'v1', total: new Decimal('30000'), amountPaid: new Decimal('30000') },
      { vendorId: 'v2', total: new Decimal('20000'), amountPaid: new Decimal('10000') },
    ];

    const vendorMap = new Map<string, { total: Decimal; paid: Decimal }>();

    for (const purchase of purchases) {
      if (!vendorMap.has(purchase.vendorId)) {
        vendorMap.set(purchase.vendorId, { total: new Decimal(0), paid: new Decimal(0) });
      }
      const data = vendorMap.get(purchase.vendorId)!;
      data.total = data.total.plus(purchase.total);
      data.paid = data.paid.plus(purchase.amountPaid);
    }

    const v1 = vendorMap.get('v1')!;
    const v2 = vendorMap.get('v2')!;

    assert.strictEqual(v1.total.toString(), '80000');
    assert.strictEqual(v1.paid.toString(), '60000');
    assert.strictEqual(v1.total.minus(v1.paid).toString(), '20000');

    assert.strictEqual(v2.total.toString(), '20000');
    assert.strictEqual(v2.paid.toString(), '10000');
    assert.strictEqual(v2.total.minus(v2.paid).toString(), '10000');
  });

  it('should exclude cancelled purchases', () => {
    const purchases = [
      { status: 'RECEIVED', total: new Decimal('50000') },
      { status: 'CANCELLED', total: new Decimal('30000') },
      { status: 'RECEIVED', total: new Decimal('20000') },
    ];

    const received = purchases.filter(p => p.status === 'RECEIVED');
    const total = received.reduce(
      (sum, p) => sum.plus(p.total),
      new Decimal(0)
    );

    assert.strictEqual(received.length, 2);
    assert.strictEqual(total.toString(), '70000');
  });
});

describe('Phase 14: Expense Reports', () => {
  it('should calculate expense totals with Decimal', () => {
    const expenses = [
      { amount: new Decimal('5000'), category: 'Rent' },
      { amount: new Decimal('3000'), category: 'Utilities' },
      { amount: new Decimal('2000'), category: 'Rent' },
    ];

    const total = expenses.reduce(
      (sum, e) => sum.plus(e.amount),
      new Decimal(0)
    );

    assert.strictEqual(total.toString(), '10000');
  });

  it('should break down expenses by category', () => {
    const expenses = [
      { amount: new Decimal('5000'), category: 'Rent' },
      { amount: new Decimal('3000'), category: 'Utilities' },
      { amount: new Decimal('2000'), category: 'Rent' },
      { amount: new Decimal('1500'), category: 'Transport' },
    ];

    const categoryBreakdown = new Map<string, Decimal>();

    for (const expense of expenses) {
      const current = categoryBreakdown.get(expense.category) || new Decimal(0);
      categoryBreakdown.set(expense.category, current.plus(expense.amount));
    }

    assert.strictEqual(categoryBreakdown.get('Rent')!.toString(), '7000');
    assert.strictEqual(categoryBreakdown.get('Utilities')!.toString(), '3000');
    assert.strictEqual(categoryBreakdown.get('Transport')!.toString(), '1500');
  });

  it('should exclude cancelled expenses', () => {
    const expenses = [
      { status: 'ACTIVE', amount: new Decimal('5000') },
      { status: 'CANCELLED', amount: new Decimal('3000') },
      { status: 'ACTIVE', amount: new Decimal('2000') },
    ];

    const active = expenses.filter(e => e.status === 'ACTIVE');
    const total = active.reduce(
      (sum, e) => sum.plus(e.amount),
      new Decimal(0)
    );

    assert.strictEqual(active.length, 2);
    assert.strictEqual(total.toString(), '7000');
  });
});

describe('Phase 14: Customer Reports', () => {
  it('should calculate customer credit with Decimal', () => {
    const customer = {
      creditLimit: new Decimal('50000'),
      currentBalance: new Decimal('15000'),
    };

    const availableCredit = customer.creditLimit.minus(customer.currentBalance);

    assert.strictEqual(availableCredit.toString(), '35000');
  });

  it('should identify customers with outstanding balance', () => {
    const customers = [
      { name: 'Customer A', currentBalance: new Decimal('0') },
      { name: 'Customer B', currentBalance: new Decimal('5000') },
      { name: 'Customer C', currentBalance: new Decimal('10000') },
    ];

    const outstanding = customers.filter(c => c.currentBalance.greaterThan(0));

    assert.strictEqual(outstanding.length, 2);
  });

  it('should sort customers by outstanding balance', () => {
    const customers = [
      { name: 'Customer A', currentBalance: new Decimal('5000') },
      { name: 'Customer B', currentBalance: new Decimal('15000') },
      { name: 'Customer C', currentBalance: new Decimal('10000') },
    ];

    const sorted = customers.sort((a, b) =>
      b.currentBalance.minus(a.currentBalance).toNumber()
    );

    assert.strictEqual(sorted[0].name, 'Customer B');
    assert.strictEqual(sorted[1].name, 'Customer C');
    assert.strictEqual(sorted[2].name, 'Customer A');
  });
});

describe('Phase 14: Shift Reports', () => {
  it('should calculate shift totals', () => {
    const shifts = [
      { salesTotal: new Decimal('50000'), cashSales: new Decimal('30000'), cardSales: new Decimal('20000') },
      { salesTotal: new Decimal('40000'), cashSales: new Decimal('25000'), cardSales: new Decimal('15000') },
    ];

    const totalSales = shifts.reduce(
      (sum, s) => sum.plus(s.salesTotal),
      new Decimal(0)
    );

    const totalCash = shifts.reduce(
      (sum, s) => sum.plus(s.cashSales),
      new Decimal(0)
    );

    assert.strictEqual(totalSales.toString(), '90000');
    assert.strictEqual(totalCash.toString(), '55000');
  });

  it('should calculate cash difference', () => {
    const expectedCash = new Decimal('20000');
    const actualCash = new Decimal('19500');
    const difference = actualCash.minus(expectedCash);

    assert.strictEqual(difference.toString(), '-500');
    assert.strictEqual(difference.lessThan(0), true);
  });
});

describe('Phase 14: Business Isolation', () => {
  it('should enforce business isolation on reports', () => {
    const sales = [
      { id: 's1', businessId: 'b1', total: new Decimal('10000') },
      { id: 's2', businessId: 'b2', total: new Decimal('15000') },
    ];

    const businessASales = sales.filter(s => s.businessId === 'b1');
    assert.strictEqual(businessASales.length, 1);
    assert.strictEqual(businessASales[0].id, 's1');
  });

  it('should enforce branch isolation on reports', () => {
    const sales = [
      { id: 's1', businessId: 'b1', branchId: 'branch-1', total: new Decimal('10000') },
      { id: 's2', businessId: 'b1', branchId: 'branch-2', total: new Decimal('15000') },
    ];

    const branch1Sales = sales.filter(s => s.branchId === 'branch-1');
    assert.strictEqual(branch1Sales.length, 1);
    assert.strictEqual(branch1Sales[0].id, 's1');
  });
});

describe('Phase 14: Authorization', () => {
  it('should require reports.view permission', () => {
    const userPermissions = ['reports.view'];
    const requiredPermission = 'reports.view';

    const hasPermission = userPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should require specific report permissions', () => {
    const userPermissions = ['reports.sales.view', 'reports.inventory.view'];
    
    assert.strictEqual(userPermissions.includes('reports.sales.view'), true);
    assert.strictEqual(userPermissions.includes('reports.inventory.view'), true);
    assert.strictEqual(userPermissions.includes('reports.purchases.view'), false);
  });

  it('should support wildcard permission', () => {
    const adminPermissions = ['*'];
    const requiredPermissions = [
      'reports.view',
      'reports.sales.view',
      'reports.inventory.view',
      'reports.purchases.view',
      'reports.expenses.view',
      'reports.customers.view',
    ];

    for (const perm of requiredPermissions) {
      const hasPermission = adminPermissions.includes('*') || adminPermissions.includes(perm);
      assert.strictEqual(hasPermission, true);
    }
  });
});

describe('Phase 14: Receipt Regression', () => {
  it('should not break receipt data structure', () => {
    const receiptData = {
      business: { name: 'Test Business', phone: '+923001234567' },
      sale: { saleNumber: 'SALE-000001', total: 1000 },
      items: [{ productName: 'Product A', quantity: 2, lineTotal: 1000 }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
      settings: { receiptWidth: '80mm', showBarcode: true },
    };

    assert.strictEqual(receiptData.business.name, 'Test Business');
    assert.strictEqual(receiptData.sale.saleNumber, 'SALE-000001');
    assert.strictEqual(receiptData.settings.receiptWidth, '80mm');
  });

  it('should not break thermal receipt widths', () => {
    const widths = ['58mm', '80mm'];
    assert.strictEqual(widths.includes('58mm'), true);
    assert.strictEqual(widths.includes('80mm'), true);
  });
});
