import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as dashboardService from '../../services/dashboardService.js';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/dashboard
 * Get comprehensive dashboard data
 */
router.get('/', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;
    
    const filters = {
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/summary
 * Get quick dashboard summary (lightweight)
 */
router.get('/summary', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;
    
    const filters = {
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const summary = await dashboardService.getDashboardSummary(filters);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/kpis
 * Get KPI metrics only
 */
router.get('/kpis', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;
    
    const filters = {
      businessId: req.user.businessId,
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data: {
        kpis: data.kpis,
        salesOverview: data.salesOverview,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/inventory-health
 * Get inventory health data only
 */
router.get('/inventory-health', authorize('reports.inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;
    
    const filters = {
      businessId: req.user.businessId,
      branchId,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data: data.inventoryHealth,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/customer-credit
 * Get customer credit overview
 */
router.get('/customer-credit', authorize('reports.customers.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const filters = {
      businessId: req.user.businessId,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data: data.customerCredit,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/vendor-balance
 * Get vendor balance overview
 */
router.get('/vendor-balance', authorize('reports.purchases.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const filters = {
      businessId: req.user.businessId,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data: data.vendorBalance,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/dashboard/attention
 * Get attention center alerts
 */
router.get('/attention', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;
    
    const filters = {
      businessId: req.user.businessId,
      branchId,
    };

    const data = await dashboardService.getDashboardData(filters);

    res.status(200).json({
      success: true,
      data: {
        attentionCenter: data.attentionCenter,
        activeShifts: data.activeShifts,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DASHBOARD_ERROR',
        message: error.message,
      },
    });
  }
});

export default router;
