import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';

export interface ReportFilters {
  businessId: string;
  branchId?: string;
  startDate?: Date;
  endDate?: Date;
  cashierId?: string;
  productId?: string;
  categoryId?: string;
  vendorId?: string;
  customerId?: string;
  status?: string;
}

/**
 * Daily Sales Report
 */
export async function getDailySalesReport(filters: ReportFilters) {
  const where: Prisma.SaleWhereInput = {
    businessId: filters.businessId,
    status: 'COMPLETED',
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.cashierId) where.cashierId = filters.cashierId;
  if (filters.startDate || filters.endDate) {
    where.saleDate = {};
    if (filters.startDate) (where.saleDate as any).gte = filters.startDate;
    if (filters.endDate) (where.saleDate as any).lte = filters.endDate;
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      payments: true,
      items: true,
    },
  });

  // Calculate totals
  let grossSales = new Decimal(0);
  let totalDiscount = new Decimal(0);
  let totalTax = new Decimal(0);
  let netSales = new Decimal(0);
  let cashSales = new Decimal(0);
  let cardSales = new Decimal(0);
  let bankTransferSales = new Decimal(0);
  let otherSales = new Decimal(0);
  let creditSales = new Decimal(0);
  let totalItems = 0;

  for (const sale of sales) {
    grossSales = grossSales.plus(sale.subtotal);
    totalDiscount = totalDiscount.plus(sale.discountAmount);
    totalTax = totalTax.plus(sale.taxAmount);
    netSales = netSales.plus(sale.total);
    totalItems += sale.items.reduce((sum, item) => sum + Number(item.quantity), 0);

    // Credit sales (outstanding > 0)
    if (sale.outstandingAmount.greaterThan(0)) {
      creditSales = creditSales.plus(sale.outstandingAmount);
    }

    // Payment breakdown
    for (const payment of sale.payments) {
      if (payment.paymentMethod === 'CASH') {
        cashSales = cashSales.plus(payment.amount);
      } else if (payment.paymentMethod === 'CARD') {
        cardSales = cardSales.plus(payment.amount);
      } else if (payment.paymentMethod === 'BANK_TRANSFER') {
        bankTransferSales = bankTransferSales.plus(payment.amount);
      } else {
        otherSales = otherSales.plus(payment.amount);
      }
    }
  }

  // Voided sales
  const voidedCount = await prisma.sale.count({
    where: {
      ...where,
      status: 'VOIDED',
    },
  });

  return {
    businessDate: filters.startDate || new Date(),
    branch: filters.branchId,
    transactionCount: sales.length,
    grossSales,
    totalDiscount,
    totalTax,
    netSales,
    cashSales,
    cardSales,
    bankTransferSales,
    otherSales,
    creditSales,
    totalItems,
    voidedCount,
    averageTransactionValue: sales.length > 0 ? netSales.dividedBy(sales.length) : new Decimal(0),
  };
}

/**
 * Payment Method Report
 */
export async function getPaymentMethodReport(filters: ReportFilters) {
  const where: Prisma.PaymentWhereInput = {
    sale: {
      businessId: filters.businessId,
      status: 'COMPLETED',
    },
  };

  if (filters.branchId) {
    (where.sale as any).branchId = filters.branchId;
  }
  if (filters.startDate || filters.endDate) {
    (where.sale as any).saleDate = {};
    if (filters.startDate) ((where.sale as any).saleDate as any).gte = filters.startDate;
    if (filters.endDate) ((where.sale as any).saleDate as any).lte = filters.endDate;
  }

  const payments = await prisma.payment.findMany({
    where,
  });

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

  return {
    breakdown,
    total,
    transactionCount: payments.length,
  };
}

/**
 * Cashier Sales Report
 */
export async function getCashierSalesReport(filters: ReportFilters) {
  const where: Prisma.SaleWhereInput = {
    businessId: filters.businessId,
    status: 'COMPLETED',
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.startDate || filters.endDate) {
    where.saleDate = {};
    if (filters.startDate) (where.saleDate as any).gte = filters.startDate;
    if (filters.endDate) (where.saleDate as any).lte = filters.endDate;
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      cashier: { select: { id: true, username: true, fullName: true } },
      payments: true,
    },
  });

  // Group by cashier
  const cashierMap = new Map<string, any>();

  for (const sale of sales) {
    const cashierId = sale.cashierId;
    if (!cashierMap.has(cashierId)) {
      cashierMap.set(cashierId, {
        cashier: sale.cashier,
        transactionCount: 0,
        salesAmount: new Decimal(0),
        cashSales: new Decimal(0),
        cardSales: new Decimal(0),
      });
    }

    const data = cashierMap.get(cashierId);
    data.transactionCount++;
    data.salesAmount = data.salesAmount.plus(sale.total);

    for (const payment of sale.payments) {
      if (payment.paymentMethod === 'CASH') {
        data.cashSales = data.cashSales.plus(payment.amount);
      } else if (payment.paymentMethod === 'CARD') {
        data.cardSales = data.cardSales.plus(payment.amount);
      }
    }
  }

  return Array.from(cashierMap.values());
}

/**
 * Product Sales Report
 */
export async function getProductSalesReport(filters: ReportFilters) {
  const where: Prisma.SaleItemWhereInput = {
    sale: {
      businessId: filters.businessId,
      status: 'COMPLETED',
    },
  };

  if (filters.branchId) {
    (where.sale as any).branchId = filters.branchId;
  }
  if (filters.startDate || filters.endDate) {
    (where.sale as any).saleDate = {};
    if (filters.startDate) ((where.sale as any).saleDate as any).gte = filters.startDate;
    if (filters.endDate) ((where.sale as any).saleDate as any).lte = filters.endDate;
  }
  if (filters.productId) where.productId = filters.productId;
  if (filters.categoryId) {
    where.product = { categoryId: filters.categoryId };
  }

  const items = await prisma.saleItem.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true } },
    },
  });

  // Group by product/variant
  const productMap = new Map<string, any>();

  for (const item of items) {
    const key = `${item.productId}-${item.variantId || 'base'}`;
    if (!productMap.has(key)) {
      productMap.set(key, {
        product: item.product,
        variant: item.variant,
        quantitySold: new Decimal(0),
        grossSales: new Decimal(0),
        discount: new Decimal(0),
        tax: new Decimal(0),
        netSales: new Decimal(0),
      });
    }

    const data = productMap.get(key);
    data.quantitySold = data.quantitySold.plus(item.quantity);
    data.grossSales = data.grossSales.plus(item.quantity.times(item.unitPrice));
    data.discount = data.discount.plus(item.discountAmount);
    data.tax = data.tax.plus(item.taxAmount);
    data.netSales = data.netSales.plus(item.lineTotal);
  }

  return Array.from(productMap.values()).sort((a, b) =>
    b.netSales.minus(a.netSales).toNumber()
  );
}

/**
 * Category Sales Report
 */
export async function getCategorySalesReport(filters: ReportFilters) {
  const where: Prisma.SaleItemWhereInput = {
    sale: {
      businessId: filters.businessId,
      status: 'COMPLETED',
    },
  };

  if (filters.branchId) {
    (where.sale as any).branchId = filters.branchId;
  }
  if (filters.startDate || filters.endDate) {
    (where.sale as any).saleDate = {};
    if (filters.startDate) ((where.sale as any).saleDate as any).gte = filters.startDate;
    if (filters.endDate) ((where.sale as any).saleDate as any).lte = filters.endDate;
  }

  const items = await prisma.saleItem.findMany({
    where,
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Group by category
  const categoryMap = new Map<string, any>();

  for (const item of items) {
    const categoryId = item.product.categoryId;
    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        category: item.product.category,
        quantitySold: new Decimal(0),
        salesAmount: new Decimal(0),
        discount: new Decimal(0),
        netSales: new Decimal(0),
      });
    }

    const data = categoryMap.get(categoryId);
    data.quantitySold = data.quantitySold.plus(item.quantity);
    data.salesAmount = data.salesAmount.plus(item.quantity.times(item.unitPrice));
    data.discount = data.discount.plus(item.discountAmount);
    data.netSales = data.netSales.plus(item.lineTotal);
  }

  return Array.from(categoryMap.values()).sort((a, b) =>
    b.netSales.minus(a.netSales).toNumber()
  );
}

/**
 * Top Selling Products
 */
export async function getTopSellingProducts(filters: ReportFilters, limit: number = 10) {
  const products = await getProductSalesReport(filters);
  return products.slice(0, limit);
}

/**
 * Inventory Report - Current Stock
 */
export async function getCurrentStockReport(filters: ReportFilters) {
  const where: Prisma.InventoryWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;

  const inventory = await prisma.inventory.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true, minStockThreshold: true, maxStockThreshold: true } },
      variant: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  return inventory.map(inv => ({
    product: inv.product,
    variant: inv.variant,
    branch: inv.branch,
    currentQuantity: inv.currentQuantity,
    reservedQuantity: inv.reservedQuantity,
    availableQuantity: inv.currentQuantity.minus(inv.reservedQuantity),
    minThreshold: inv.product.minStockThreshold,
    maxThreshold: inv.product.maxStockThreshold,
    status: getStockStatus(inv.currentQuantity, inv.product.minStockThreshold, inv.product.maxStockThreshold),
  }));
}

function getStockStatus(quantity: Decimal, min?: number | null, max?: number | null): string {
  const qty = quantity.toNumber();
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (min && qty <= min) return 'LOW_STOCK';
  if (max && qty > max) return 'OVERSTOCKED';
  return 'NORMAL';
}

/**
 * Low Stock Report
 */
export async function getLowStockReport(filters: ReportFilters) {
  const stock = await getCurrentStockReport(filters);
  return stock.filter(s => s.status === 'LOW_STOCK' || s.status === 'OUT_OF_STOCK');
}

/**
 * Stock Movement Report
 */
export async function getStockMovementReport(filters: ReportFilters) {
  const where: Prisma.StockMovementWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) (where.createdAt as any).gte = filters.startDate;
    if (filters.endDate) (where.createdAt as any).lte = filters.endDate;
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, username: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return movements;
}

/**
 * Expiry Report
 */
export async function getExpiryReport(filters: ReportFilters) {
  const where: Prisma.StockBatchWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;

  const batches = await prisma.stockBatch.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });

  const now = new Date();
  const warningDays = 30; // Default warning period
  const warningDate = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

  return batches.map(batch => ({
    ...batch,
    status: batch.expiryDate
      ? batch.expiryDate < now
        ? 'EXPIRED'
        : batch.expiryDate < warningDate
        ? 'EXPIRING_SOON'
        : 'VALID'
      : 'VALID',
  }));
}

/**
 * Purchase Report
 */
export async function getPurchaseReport(filters: ReportFilters) {
  const where: Prisma.PurchaseWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.purchaseDate = {};
    if (filters.startDate) (where.purchaseDate as any).gte = filters.startDate;
    if (filters.endDate) (where.purchaseDate as any).lte = filters.endDate;
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      vendor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { purchaseDate: 'desc' },
  });

  return purchases;
}

/**
 * Vendor Balance Report
 */
export async function getVendorBalanceReport(filters: ReportFilters) {
  const where: Prisma.VendorWhereInput = {
    businessId: filters.businessId,
    isActive: true,
  };

  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      purchases: {
        where: {
          status: 'RECEIVED',
        },
      },
    },
  });

  return vendors.map(vendor => {
    const totalPurchases = vendor.purchases.reduce(
      (sum, p) => sum.plus(p.total),
      new Decimal(0)
    );
    const totalPaid = vendor.purchases.reduce(
      (sum, p) => sum.plus(p.amountPaid),
      new Decimal(0)
    );
    const totalDue = totalPurchases.minus(totalPaid);

    return {
      vendor: { id: vendor.id, name: vendor.name },
      totalPurchases,
      totalPaid,
      totalDue,
    };
  });
}

/**
 * Expense Report
 */
export async function getExpenseReport(filters: ReportFilters) {
  const where: Prisma.ExpenseWhereInput = {
    businessId: filters.businessId,
    status: 'ACTIVE',
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.startDate || filters.endDate) {
    where.expenseDate = {};
    if (filters.startDate) (where.expenseDate as any).gte = filters.startDate;
    if (filters.endDate) (where.expenseDate as any).lte = filters.endDate;
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { expenseDate: 'desc' },
  });

  const totalExpenses = expenses.reduce(
    (sum, e) => sum.plus(e.amount),
    new Decimal(0)
  );

  // Category breakdown
  const categoryBreakdown = new Map<string, Decimal>();
  for (const expense of expenses) {
    const current = categoryBreakdown.get(expense.category.name) || new Decimal(0);
    categoryBreakdown.set(expense.category.name, current.plus(expense.amount));
  }

  return {
    expenses,
    totalExpenses,
    categoryBreakdown: Object.fromEntries(categoryBreakdown),
  };
}

/**
 * Claim Report
 */
export async function getClaimReport(filters: ReportFilters) {
  const where: Prisma.ClaimWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.claimDate = {};
    if (filters.startDate) (where.claimDate as any).gte = filters.startDate;
    if (filters.endDate) (where.claimDate as any).lte = filters.endDate;
  }

  const claims = await prisma.claim.findMany({
    where,
    include: {
      vendor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { claimDate: 'desc' },
  });

  return claims;
}

/**
 * Customer Credit Report
 */
export async function getCustomerCreditReport(filters: ReportFilters) {
  const where: Prisma.CustomerWhereInput = {
    businessId: filters.businessId,
    status: 'ACTIVE',
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      sales: {
        where: {
          status: 'COMPLETED',
          outstandingAmount: { gt: 0 },
        },
      },
      payments: true,
    },
  });

  return customers.map(customer => {
    const totalCredit = customer.sales.reduce(
      (sum, s) => sum.plus(s.outstandingAmount),
      new Decimal(0)
    );
    const totalRecoveries = customer.payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Decimal(0)
    );

    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      totalCredit,
      totalRecoveries,
      outstandingBalance: customer.currentBalance,
      availableCredit: customer.creditLimit.minus(customer.currentBalance),
    };
  });
}

/**
 * Customer Outstanding Report
 */
export async function getCustomerOutstandingReport(filters: ReportFilters) {
  const creditReport = await getCustomerCreditReport(filters);
  return creditReport
    .filter(c => c.outstandingBalance.greaterThan(0))
    .sort((a, b) => b.outstandingBalance.minus(a.outstandingBalance).toNumber());
}

/**
 * Shift Report
 */
export async function getShiftReport(filters: ReportFilters) {
  const where: Prisma.CashierShiftWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.cashierId) where.cashierId = filters.cashierId;
  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.openingDate = {};
    if (filters.startDate) (where.openingDate as any).gte = filters.startDate;
    if (filters.endDate) (where.openingDate as any).lte = filters.endDate;
  }

  const shifts = await prisma.cashierShift.findMany({
    where,
    include: {
      cashier: { select: { id: true, username: true, fullName: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { openingDate: 'desc' },
  });

  return shifts;
}

/**
 * Target & Commission Report
 */
export async function getTargetCommissionReport(filters: ReportFilters) {
  const where: Prisma.SalesTargetWhereInput = {
    businessId: filters.businessId,
  };

  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.startDate || filters.endDate) {
    where.startDate = {};
    if (filters.startDate) (where.startDate as any).gte = filters.startDate;
    if (filters.endDate) (where.startDate as any).lte = filters.endDate;
  }

  const targets = await prisma.salesTarget.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      commissionRecords: true,
    },
  });

  return targets.map(target => {
    const totalCommission = target.commissionRecords.reduce(
      (sum, r) => sum.plus(r.commissionAmount),
      new Decimal(0)
    );

    return {
      target,
      totalCommission,
      commissionCount: target.commissionRecords.length,
    };
  });
}

/**
 * Monthly Summary Report
 */
export async function getMonthlyReport(filters: ReportFilters) {
  const salesReport = await getDailySalesReport(filters);
  const expenseReport = await getExpenseReport(filters);
  const purchaseReport = await getPurchaseReport(filters);

  const totalPurchases = purchaseReport.reduce(
    (sum, p) => sum.plus(p.total),
    new Decimal(0)
  );

  return {
    ...salesReport,
    totalExpenses: expenseReport.totalExpenses,
    totalPurchases,
    period: {
      start: filters.startDate,
      end: filters.endDate,
    },
  };
}
