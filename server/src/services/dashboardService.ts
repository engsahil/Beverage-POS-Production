import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import * as reportService from './reportService.js';

export interface DashboardFilters {
  businessId: string;
  branchId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface DashboardData {
  kpis: {
    todaySales: Decimal;
    todayTransactions: number;
    averageTransactionValue: Decimal;
    lowStockCount: number;
    outOfStockCount: number;
    expiringSoonCount: number;
    outstandingCustomerCredit: Decimal;
    outstandingVendorBalance: Decimal;
    todayExpenses: Decimal;
  };
  salesOverview: {
    netSales: Decimal;
    transactionCount: number;
    grossSales: Decimal;
    totalDiscount: Decimal;
    totalTax: Decimal;
    cashSales: Decimal;
    cardSales: Decimal;
    bankTransferSales: Decimal;
    otherSales: Decimal;
    creditSales: Decimal;
  };
  paymentBreakdown: {
    method: string;
    amount: Decimal;
    percentage: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
    quantitySold: Decimal;
    totalSales: Decimal;
  }[];
  inventoryHealth: {
    outOfStock: number;
    lowStock: number;
    expiringSoon: number;
    expired: number;
    alerts: {
      type: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXPIRING_SOON' | 'EXPIRED';
      productName: string;
      variantName?: string;
      currentStock?: Decimal;
      expiryDate?: Date;
    }[];
  };
  customerCredit: {
    totalOutstanding: Decimal;
    customersWithBalance: number;
    approachingLimit: number;
    topDebtors: {
      customerId: string;
      customerName: string;
      outstandingBalance: Decimal;
      creditLimit: Decimal;
      utilizationPercentage: number;
    }[];
  };
  vendorBalance: {
    totalDue: Decimal;
    vendorsWithBalance: number;
    topVendors: {
      vendorId: string;
      vendorName: string;
      totalDue: Decimal;
    }[];
  };
  expenseOverview: {
    todayExpenses: Decimal;
    periodExpenses: Decimal;
    topCategories: {
      categoryName: string;
      amount: Decimal;
    }[];
  };
  activeShifts: {
    shiftId: string;
    shiftNumber: string;
    cashierName: string;
    branchName: string;
    openingTime: Date;
    currentSales: Decimal;
    expectedCash: Decimal;
    status: string;
  }[];
  targetCommission: {
    activeTargets: number;
    achievedTargets: number;
    totalCommissionPending: Decimal;
    totalCommissionApproved: Decimal;
  };
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId?: string;
    description: string;
    timestamp: Date;
    userName?: string;
  }[];
  attentionCenter: {
    type: 'WARNING' | 'INFO' | 'CRITICAL';
    category: string;
    message: string;
    count?: number;
    actionUrl?: string;
  }[];
}

/**
 * Get comprehensive dashboard data
 */
export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const { businessId, branchId, startDate, endDate } = filters;

  // Set default date range to today if not provided
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const effectiveStartDate = startDate || today;
  const effectiveEndDate = endDate || new Date();

  const reportFilters = {
    businessId,
    branchId,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
  };

  // Also fetch today's expenses separately (regardless of filter range)
  const todayExpenseQuery = prisma.expense.findMany({
    where: {
      businessId,
      ...(branchId ? { branchId } : {}),
      status: 'ACTIVE',
      expenseDate: {
        gte: today,
        lte: new Date(),
      },
    },
  });

  // Fetch all data in parallel
  const [
    salesReport,
    paymentReport,
    topProductsReport,
    inventoryReport,
    expiryReport,
    customerCreditReport,
    vendorBalanceReport,
    expenseReport,
    shiftReport,
    targetCommissionReport,
    recentAuditLogs,
    todayExpensesData,
  ] = await Promise.all([
    reportService.getDailySalesReport(reportFilters),
    reportService.getPaymentMethodReport(reportFilters),
    reportService.getTopSellingProducts(reportFilters, 10),
    reportService.getCurrentStockReport(reportFilters),
    reportService.getExpiryReport(reportFilters),
    reportService.getCustomerCreditReport(reportFilters),
    reportService.getVendorBalanceReport(reportFilters),
    reportService.getExpenseReport(reportFilters),
    reportService.getShiftReport({ businessId, branchId, status: 'OPEN' }),
    reportService.getTargetCommissionReport({ businessId, branchId }),
    prisma.auditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: { fullName: true },
        },
      },
    }),
    todayExpenseQuery,
  ]);

  // Calculate KPIs
  const lowStockItems = inventoryReport.filter(item => 
    item.currentQuantity.lessThan(item.product.minStockThreshold || 0) && item.currentQuantity.greaterThan(0)
  );
  const outOfStockItems = inventoryReport.filter(item => 
    item.currentQuantity.equals(0)
  );
  const expiringSoonItems = expiryReport.filter(item => 
    item.status === 'EXPIRING_SOON'
  );

  const totalOutstandingCredit = customerCreditReport.reduce(
    (sum, customer) => sum.plus(customer.outstandingBalance),
    new Decimal(0)
  );

  const totalVendorDue = vendorBalanceReport.reduce(
    (sum, vendor) => sum.plus(vendor.totalDue),
    new Decimal(0)
  );

  const todayExpenses = todayExpensesData.reduce(
    (sum, expense) => sum.plus(expense.amount),
    new Decimal(0)
  );

  // Build payment breakdown
  const paymentBreakdown = Object.entries(paymentReport.breakdown).map(([method, amount]) => ({
    method,
    amount,
    percentage: paymentReport.total.greaterThan(0)
      ? amount.dividedBy(paymentReport.total).times(100).toNumber()
      : 0,
  }));

  // Build inventory health
  const expiredItems = expiryReport.filter(item => item.status === 'EXPIRED');
  const inventoryAlerts = [
    ...outOfStockItems.slice(0, 5).map(item => ({
      type: 'OUT_OF_STOCK' as const,
      productName: item.product.name,
      variantName: item.variant?.name,
      currentStock: item.currentQuantity,
    })),
    ...lowStockItems.slice(0, 5).map(item => ({
      type: 'LOW_STOCK' as const,
      productName: item.product.name,
      variantName: item.variant?.name,
      currentStock: item.currentQuantity,
    })),
    ...expiringSoonItems.slice(0, 5).map(item => ({
      type: 'EXPIRING_SOON' as const,
      productName: item.product.name,
      variantName: item.variant?.name,
      expiryDate: item.expiryDate || undefined,
    })),
    ...expiredItems.slice(0, 5).map(item => ({
      type: 'EXPIRED' as const,
      productName: item.product.name,
      variantName: item.variant?.name,
      expiryDate: item.expiryDate || undefined,
    })),
  ];

  // Build customer credit overview
  const customersWithBalance = customerCreditReport.filter(c => c.outstandingBalance.greaterThan(0));
  const approachingLimit = customersWithBalance.filter(c => {
    if (c.creditLimit.lessThanOrEqualTo(0)) return false;
    const utilization = c.outstandingBalance.dividedBy(c.creditLimit).times(100);
    return utilization.greaterThan(80);
  });

  const topDebtors = customersWithBalance
    .sort((a, b) => b.outstandingBalance.minus(a.outstandingBalance).toNumber())
    .slice(0, 5)
    .map(c => ({
      customerId: c.customer.id,
      customerName: c.customer.name,
      outstandingBalance: c.outstandingBalance,
      creditLimit: c.creditLimit,
      utilizationPercentage: c.creditLimit.greaterThan(0)
        ? c.outstandingBalance.dividedBy(c.creditLimit).times(100).toNumber()
        : 0,
    }));

  // Build vendor balance overview
  const vendorsWithBalance = vendorBalanceReport.filter(v => v.totalDue.greaterThan(0));
  const topVendors = vendorsWithBalance
    .sort((a, b) => b.totalDue.minus(a.totalDue).toNumber())
    .slice(0, 5)
    .map(v => ({
      vendorId: v.vendor.id,
      vendorName: v.vendor.name,
      totalDue: v.totalDue,
    }));

  // Build expense overview - use pre-computed category breakdown from report
  const topExpenseCategories = Object.entries(expenseReport.categoryBreakdown)
    .map(([categoryName, amount]) => ({ categoryName, amount: amount as Decimal }))
    .sort((a, b) => b.amount.minus(a.amount).toNumber())
    .slice(0, 5);

  // Build active shifts
  const activeShifts = shiftReport.map(shift => ({
    shiftId: shift.id,
    shiftNumber: shift.shiftNumber,
    cashierName: shift.cashier.fullName,
    branchName: shift.branch.name,
    openingTime: shift.openingDate,
    currentSales: shift.salesTotal,
    expectedCash: shift.expectedCash || new Decimal(0),
    status: shift.status,
  }));

  // Build target & commission overview
  const activeTargets = targetCommissionReport.filter(t => t.target.status === 'ACTIVE');
  const achievedTargets = targetCommissionReport.filter(t => t.commissionCount > 0); // Simplified - has commissions means some achievement
  const totalCommissionPending = targetCommissionReport.reduce(
    (sum, t) => sum.plus(t.totalCommission),
    new Decimal(0)
  );

  // Build recent activity
  const recentActivity = recentAuditLogs.map(log => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId || undefined,
    description: `${log.action} on ${log.entityType}`,
    timestamp: log.createdAt,
    userName: log.user?.fullName,
  }));

  // Build attention center
  const attentionCenter = [];

  if (outOfStockItems.length > 0) {
    attentionCenter.push({
      type: 'CRITICAL' as const,
      category: 'Inventory',
      message: `${outOfStockItems.length} product(s) out of stock`,
      count: outOfStockItems.length,
      actionUrl: '/inventory?status=OUT_OF_STOCK',
    });
  }

  if (lowStockItems.length > 0) {
    attentionCenter.push({
      type: 'WARNING' as const,
      category: 'Inventory',
      message: `${lowStockItems.length} product(s) low on stock`,
      count: lowStockItems.length,
      actionUrl: '/inventory?status=LOW_STOCK',
    });
  }

  if (expiringSoonItems.length > 0) {
    attentionCenter.push({
      type: 'WARNING' as const,
      category: 'Inventory',
      message: `${expiringSoonItems.length} product(s) expiring soon`,
      count: expiringSoonItems.length,
      actionUrl: '/inventory/expiry',
    });
  }

  if (expiredItems.length > 0) {
    attentionCenter.push({
      type: 'CRITICAL' as const,
      category: 'Inventory',
      message: `${expiredItems.length} product(s) expired`,
      count: expiredItems.length,
      actionUrl: '/inventory/expiry',
    });
  }

  if (customersWithBalance.length > 0) {
    attentionCenter.push({
      type: 'INFO' as const,
      category: 'Customers',
      message: `${customersWithBalance.length} customer(s) with outstanding balance`,
      count: customersWithBalance.length,
      actionUrl: '/customers?hasBalance=true',
    });
  }

  if (vendorsWithBalance.length > 0) {
    attentionCenter.push({
      type: 'INFO' as const,
      category: 'Vendors',
      message: `${vendorsWithBalance.length} vendor(s) with outstanding balance`,
      count: vendorsWithBalance.length,
      actionUrl: '/vendors?hasBalance=true',
    });
  }

  return {
    kpis: {
      todaySales: salesReport.netSales,
      todayTransactions: salesReport.transactionCount,
      averageTransactionValue: salesReport.transactionCount > 0
        ? salesReport.netSales.dividedBy(salesReport.transactionCount)
        : new Decimal(0),
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      expiringSoonCount: expiringSoonItems.length,
      outstandingCustomerCredit: totalOutstandingCredit,
      outstandingVendorBalance: totalVendorDue,
      todayExpenses,
    },
    salesOverview: {
      netSales: salesReport.netSales,
      transactionCount: salesReport.transactionCount,
      grossSales: salesReport.grossSales,
      totalDiscount: salesReport.totalDiscount,
      totalTax: salesReport.totalTax,
      cashSales: salesReport.cashSales,
      cardSales: salesReport.cardSales,
      bankTransferSales: salesReport.bankTransferSales,
      otherSales: salesReport.otherSales,
      creditSales: salesReport.creditSales,
    },
    paymentBreakdown,
    topProducts: topProductsReport.map(p => ({
      productId: p.product.id,
      productName: p.product.name,
      variantId: p.variant?.id,
      variantName: p.variant?.name,
      quantitySold: p.quantitySold,
      totalSales: p.netSales,
    })),
    inventoryHealth: {
      outOfStock: outOfStockItems.length,
      lowStock: lowStockItems.length,
      expiringSoon: expiringSoonItems.length,
      expired: expiredItems.length,
      alerts: inventoryAlerts,
    },
    customerCredit: {
      totalOutstanding: totalOutstandingCredit,
      customersWithBalance: customersWithBalance.length,
      approachingLimit: approachingLimit.length,
      topDebtors,
    },
    vendorBalance: {
      totalDue: totalVendorDue,
      vendorsWithBalance: vendorsWithBalance.length,
      topVendors,
    },
    expenseOverview: {
      todayExpenses,
      periodExpenses: expenseReport.totalExpenses,
      topCategories: topExpenseCategories,
    },
    activeShifts,
    targetCommission: {
      activeTargets: activeTargets.length,
      achievedTargets: achievedTargets.length,
      totalCommissionPending,
      totalCommissionApproved: new Decimal(0), // Would need to query approved commissions
    },
    recentActivity,
    attentionCenter,
  };
}

/**
 * Get dashboard summary for quick overview
 */
export async function getDashboardSummary(filters: DashboardFilters) {
  const data = await getDashboardData(filters);
  
  return {
    kpis: data.kpis,
    attentionCount: data.attentionCenter.length,
    activeShiftsCount: data.activeShifts.length,
    lastUpdated: new Date(),
  };
}
