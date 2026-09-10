import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as targetService from '../../services/targetService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /targets
 * Get all targets with filtering
 */
router.get('/', authorize('targets.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      q,
      targetType,
      periodType,
      status,
      assignedUserId,
      assignedBranchId,
      startDate,
      endDate,
    } = req.query as Record<string, string>;

    const result = await targetService.getTargets(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      targetType,
      periodType,
      status,
      assignedUserId,
      assignedBranchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
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
        message: 'Failed to fetch targets',
      },
    });
  }
});

/**
 * GET /targets/:id
 * Get target by ID
 */
router.get('/:id', authorize('targets.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const target = await targetService.getTargetById(req.params.id as string, req.user.businessId);

    if (!target) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Target not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: target,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch target',
      },
    });
  }
});

/**
 * GET /targets/:id/progress
 * Get target progress
 */
router.get('/:id/progress', authorize('targets.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const progress = await targetService.calculateTargetProgress(
      req.params.id as string,
      req.user.businessId
    );

    res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate target progress',
      },
    });
  }
});

/**
 * POST /targets
 * Create target
 */
router.post('/', authorize('targets.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      branchId,
      name,
      targetType,
      periodType,
      startDate,
      endDate,
      targetValue,
      targetQuantity,
      assignedUserId,
      assignedBranchId,
      productId,
      categoryId,
      notes,
    } = req.body;

    // Validation
    if (!name || !targetType || !periodType || !startDate || !endDate || targetValue === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, targetType, periodType, startDate, endDate, and targetValue are required',
        },
      });
      return;
    }

    if (typeof targetValue !== 'number' || targetValue <= 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Target value must be a positive number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const target = await targetService.createTarget(
      {
        businessId: req.user.businessId,
        branchId,
        name,
        targetType,
        periodType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        targetValue,
        targetQuantity,
        assignedUserId,
        assignedBranchId,
        productId,
        categoryId,
        notes,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: target,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create target',
      },
    });
  }
});

/**
 * PUT /targets/:id
 * Update target
 */
router.put('/:id', authorize('targets.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      name,
      targetValue,
      targetQuantity,
      assignedUserId,
      assignedBranchId,
      notes,
    } = req.body;

    if (targetValue !== undefined && (typeof targetValue !== 'number' || targetValue <= 0)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Target value must be a positive number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const target = await targetService.updateTarget(
      req.params.id as string,
      req.user.businessId,
      {
        ...(name !== undefined && { name }),
        ...(targetValue !== undefined && { targetValue }),
        ...(targetQuantity !== undefined && { targetQuantity }),
        ...(assignedUserId !== undefined && { assignedUserId }),
        ...(assignedBranchId !== undefined && { assignedBranchId }),
        ...(notes !== undefined && { notes }),
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: target,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update target',
      },
    });
  }
});

/**
 * POST /targets/:id/cancel
 * Cancel target
 */
router.post('/:id/cancel', authorize('targets.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cancellation reason is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const target = await targetService.cancelTarget(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: target,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel target',
      },
    });
  }
});

export default router;
