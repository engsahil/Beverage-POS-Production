import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as commissionService from '../../services/commissionService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==========================================
// Commission Rules
// ==========================================

/**
 * GET /commissions/rules
 * Get all commission rules
 */
router.get('/rules', authorize('commission.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      q,
      commissionType,
      isActive,
      assignedUserId,
      assignedBranchId,
    } = req.query as Record<string, string>;

    const result = await commissionService.getCommissionRules(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      commissionType,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      assignedUserId,
      assignedBranchId,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch commission rules',
      },
    });
  }
});

/**
 * GET /commissions/rules/:id
 * Get commission rule by ID
 */
router.get('/rules/:id', authorize('commission.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const rule = await commissionService.getCommissionRuleById(
      req.params.id as string,
      req.user.businessId
    );

    if (!rule) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission rule not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: rule,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch commission rule',
      },
    });
  }
});

/**
 * POST /commissions/rules
 * Create commission rule
 */
router.post('/rules', authorize('commission.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      name,
      commissionType,
      percentage,
      fixedAmount,
      minimumAchievement,
      maximumCommission,
      targetBasedOnAmount,
      productId,
      categoryId,
      assignedUserId,
      assignedBranchId,
      startDate,
      endDate,
      notes,
    } = req.body;

    // Validation
    if (!name || !commissionType || !startDate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, commissionType, and startDate are required',
        },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const rule = await commissionService.createCommissionRule(
      {
        businessId: req.user.businessId,
        name,
        commissionType,
        percentage,
        fixedAmount,
        minimumAchievement,
        maximumCommission,
        targetBasedOnAmount,
        productId,
        categoryId,
        assignedUserId,
        assignedBranchId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        notes,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create commission rule',
      },
    });
  }
});

/**
 * PUT /commissions/rules/:id
 * Update commission rule
 */
router.put('/rules/:id', authorize('commission.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      name,
      percentage,
      fixedAmount,
      minimumAchievement,
      maximumCommission,
      notes,
    } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const rule = await commissionService.updateCommissionRule(
      req.params.id as string,
      req.user.businessId,
      {
        ...(name !== undefined && { name }),
        ...(percentage !== undefined && { percentage }),
        ...(fixedAmount !== undefined && { fixedAmount }),
        ...(minimumAchievement !== undefined && { minimumAchievement }),
        ...(maximumCommission !== undefined && { maximumCommission }),
        ...(notes !== undefined && { notes }),
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update commission rule',
      },
    });
  }
});

/**
 * PATCH /commissions/rules/:id/toggle
 * Enable/disable commission rule
 */
router.patch('/rules/:id/toggle', authorize('commission.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'isActive must be a boolean' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const rule = await commissionService.toggleCommissionRule(
      req.params.id as string,
      req.user.businessId,
      isActive,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to toggle commission rule',
      },
    });
  }
});

// ==========================================
// Commission Records
// ==========================================

/**
 * GET /commissions
 * Get all commission records
 */
router.get('/', authorize('commission.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      userId,
      status,
      periodStart,
      periodEnd,
    } = req.query as Record<string, string>;

    const result = await commissionService.getCommissionRecords(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      userId,
      status,
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch commission records',
      },
    });
  }
});

/**
 * GET /commissions/:id
 * Get commission record by ID
 */
router.get('/:id', authorize('commission.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const record = await commissionService.getCommissionRecordById(
      req.params.id as string,
      req.user.businessId
    );

    if (!record) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission record not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch commission record',
      },
    });
  }
});

/**
 * POST /commissions/calculate
 * Calculate commission for a user and period
 */
router.post('/calculate', authorize('commission.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { userId, periodStart, periodEnd } = req.body;

    if (!userId || !periodStart || !periodEnd) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId, periodStart, and periodEnd are required',
        },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await commissionService.calculateCommission(
      req.user.businessId,
      userId,
      new Date(periodStart),
      new Date(periodEnd),
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate commission',
      },
    });
  }
});

/**
 * POST /commissions/:id/approve
 * Approve commission
 */
router.post('/:id/approve', authorize('commission.approve'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const record = await commissionService.approveCommission(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'APPROVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to approve commission',
      },
    });
  }
});

/**
 * POST /commissions/:id/reject
 * Reject commission
 */
router.post('/:id/reject', authorize('commission.approve'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const record = await commissionService.rejectCommission(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REJECT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to reject commission',
      },
    });
  }
});

/**
 * POST /commissions/:id/mark-paid
 * Mark commission as paid
 */
router.post('/:id/mark-paid', authorize('commission.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { paymentReference } = req.body;

    if (!paymentReference || typeof paymentReference !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Payment reference is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const record = await commissionService.markCommissionPaid(
      req.params.id as string,
      req.user.businessId,
      paymentReference,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to mark commission as paid',
      },
    });
  }
});

export default router;
