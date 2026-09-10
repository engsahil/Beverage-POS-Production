import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as shiftService from '../../services/shiftService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /shifts
 * Get all shifts with filtering
 */
router.get('/', authorize('shifts.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      branchId,
      cashierId,
      status,
      startDate,
      endDate,
    } = req.query as Record<string, string>;

    const result = await shiftService.getShifts(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      branchId,
      cashierId,
      status,
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
        message: 'Failed to fetch shifts',
      },
    });
  }
});

/**
 * GET /shifts/active
 * Get active shift for current cashier at a branch
 */
router.get('/active', authorize('shifts.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const branchId = (req.query as Record<string, string>).branchId || req.user.branchId;

    if (!branchId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'branchId is required' },
      });
      return;
    }

    const shift = await shiftService.getActiveShift(
      req.user.businessId,
      req.user.sub,
      branchId
    );

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch active shift',
      },
    });
  }
});

/**
 * GET /shifts/:id
 * Get shift by ID
 */
router.get('/:id', authorize('shifts.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const shift = await shiftService.getShiftById(req.params.id as string, req.user.businessId);

    if (!shift) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Shift not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch shift',
      },
    });
  }
});

/**
 * POST /shifts/open
 * Open a new shift
 */
router.post('/open', authorize('shifts.open'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, openingCash, openingNotes } = req.body;

    if (!branchId || openingCash === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId and openingCash are required',
        },
      });
      return;
    }

    if (typeof openingCash !== 'number' || openingCash < 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Opening cash must be a non-negative number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const shift = await shiftService.openShift(
      {
        businessId: req.user.businessId,
        branchId,
        cashierId: req.user.sub,
        openingCash,
        openingNotes,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OPEN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to open shift',
      },
    });
  }
});

/**
 * POST /shifts/:id/close
 * Close a shift
 */
router.post('/:id/close', authorize('shifts.close'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { actualCash, closingNotes, differenceReason } = req.body;

    if (actualCash === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'actualCash is required' },
      });
      return;
    }

    if (typeof actualCash !== 'number' || actualCash < 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Actual cash must be a non-negative number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const shift = await shiftService.closeShift(
      req.params.id as string,
      req.user.businessId,
      {
        actualCash,
        closingNotes,
        differenceReason,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLOSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to close shift',
      },
    });
  }
});

/**
 * POST /shifts/:id/admin-close
 * Admin override: close shift on behalf of cashier
 */
router.post('/:id/admin-close', authorize('shifts.override'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { actualCash, closingNotes, differenceReason } = req.body;

    if (actualCash === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'actualCash is required' },
      });
      return;
    }

    if (typeof actualCash !== 'number' || actualCash < 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Actual cash must be a non-negative number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const shift = await shiftService.adminCloseShift(
      req.params.id as string,
      req.user.businessId,
      {
        actualCash,
        closingNotes,
        differenceReason,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLOSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to close shift',
      },
    });
  }
});

/**
 * POST /shifts/:id/cancel
 * Cancel a shift (admin only)
 */
router.post('/:id/cancel', authorize('shifts.manage'), async (req: Request, res: Response) => {
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

    const shift = await shiftService.cancelShift(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel shift',
      },
    });
  }
});

export default router;
