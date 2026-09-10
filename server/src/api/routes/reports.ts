import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as reportService from '../../services/reportService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /reports/sales
 * Sales summary report (totals + top products) for the Reports dashboard
 */
router.get('/sales', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;
    const filters = {
      businessId: req.user.businessId,
      branchId: branchId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const [daily, topProducts] = await Promise.all([
      reportService.getDailySalesReport(filters),
      reportService.getTopSellingProducts(filters, 10),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalSales: daily.transactionCount,
        totalRevenue: daily.netSales,
        totalDiscount: daily.totalDiscount,
        totalTax: daily.totalTax,
        averageOrderValue: daily.averageTransactionValue,
        cashSales: daily.cashSales,
        cardSales: daily.cardSales,
        creditSales: daily.creditSales,
        topProducts: topProducts.map((p: any) => ({
          name: p.variant?.name ? `${p.product?.name} (${p.variant.name})` : p.product?.name,
          quantity: Number(p.quantitySold),
          revenue: Number(p.netSales),
        })),
        dailyBreakdown: [],
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch sales report',
      },
    });
  }
});

/**
 * GET /reports/sales/daily
 * Daily sales report
 */
router.get('/sales/daily', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate, cashierId } = req.query as Record<string, string>;

    const report = await reportService.getDailySalesReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      cashierId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate daily sales report',
      },
    });
  }
});

/**
 * GET /reports/sales/payment-methods
 * Payment method breakdown
 */
router.get('/sales/payment-methods', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getPaymentMethodReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate payment method report',
      },
    });
  }
});

/**
 * GET /reports/sales/cashier
 * Cashier sales report
 */
router.get('/sales/cashier', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getCashierSalesReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate cashier sales report',
      },
    });
  }
});

/**
 * GET /reports/sales/products
 * Product sales report
 */
router.get('/sales/products', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate, productId, categoryId } = req.query as Record<string, string>;

    const report = await reportService.getProductSalesReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      productId,
      categoryId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate product sales report',
      },
    });
  }
});

/**
 * GET /reports/sales/categories
 * Category sales report
 */
router.get('/sales/categories', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getCategorySalesReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate category sales report',
      },
    });
  }
});

/**
 * GET /reports/sales/top-products
 * Top selling products
 */
router.get('/sales/top-products', authorize('reports.sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate, limit } = req.query as Record<string, string>;

    const report = await reportService.getTopSellingProducts(
      {
        businessId: req.user.businessId,
        branchId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      limit ? parseInt(limit) : 10
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate top products report',
      },
    });
  }
});

/**
 * GET /reports/inventory/current
 * Current stock report
 */
router.get('/inventory/current', authorize('reports.inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;

    const report = await reportService.getCurrentStockReport({
      businessId: req.user.businessId,
      branchId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate current stock report',
      },
    });
  }
});

/**
 * GET /reports/inventory/low-stock
 * Low stock report
 */
router.get('/inventory/low-stock', authorize('reports.inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;

    const report = await reportService.getLowStockReport({
      businessId: req.user.businessId,
      branchId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate low stock report',
      },
    });
  }
});

/**
 * GET /reports/inventory/movements
 * Stock movement report
 */
router.get('/inventory/movements', authorize('reports.inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getStockMovementReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate stock movement report',
      },
    });
  }
});

/**
 * GET /reports/inventory/expiry
 * Expiry report
 */
router.get('/inventory/expiry', authorize('reports.inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;

    const report = await reportService.getExpiryReport({
      businessId: req.user.businessId,
      branchId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate expiry report',
      },
    });
  }
});

/**
 * GET /reports/purchases
 * Purchase report
 */
router.get('/purchases', authorize('reports.purchases.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, vendorId, status, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getPurchaseReport({
      businessId: req.user.businessId,
      branchId,
      vendorId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate purchase report',
      },
    });
  }
});

/**
 * GET /reports/purchases/vendor-balances
 * Vendor balance report
 */
router.get('/purchases/vendor-balances', authorize('reports.purchases.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const report = await reportService.getVendorBalanceReport({
      businessId: req.user.businessId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate vendor balance report',
      },
    });
  }
});

/**
 * GET /reports/expenses
 * Expense report
 */
router.get('/expenses', authorize('reports.expenses.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getExpenseReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate expense report',
      },
    });
  }
});

/**
 * GET /reports/claims
 * Claim report
 */
router.get('/claims', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, status, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getClaimReport({
      businessId: req.user.businessId,
      branchId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate claim report',
      },
    });
  }
});

/**
 * GET /reports/customers/credit
 * Customer credit report
 */
router.get('/customers/credit', authorize('reports.customers.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const report = await reportService.getCustomerCreditReport({
      businessId: req.user.businessId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate customer credit report',
      },
    });
  }
});

/**
 * GET /reports/customers/outstanding
 * Customer outstanding report
 */
router.get('/customers/outstanding', authorize('reports.customers.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const report = await reportService.getCustomerOutstandingReport({
      businessId: req.user.businessId,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate customer outstanding report',
      },
    });
  }
});

/**
 * GET /reports/shifts
 * Shift report
 */
router.get('/shifts', authorize('reports.shifts.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, cashierId, status, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getShiftReport({
      businessId: req.user.businessId,
      branchId,
      cashierId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate shift report',
      },
    });
  }
});

/**
 * GET /reports/targets-commission
 * Target & commission report
 */
router.get('/targets-commission', authorize('reports.targets.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getTargetCommissionReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate target & commission report',
      },
    });
  }
});

/**
 * GET /reports/monthly
 * Monthly summary report
 */
router.get('/monthly', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const report = await reportService.getMonthlyReport({
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate monthly report',
      },
    });
  }
});

export default router;
