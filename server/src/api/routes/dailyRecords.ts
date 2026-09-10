import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as dailyRecordService from '../../services/dailyRecordService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /daily-records
 * Get all daily records with filtering
 */
router.get('/', authorize('daily_open_close.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      branchId,
      status,
      startDate,
      endDate,
    } = req.query as Record<string, string>;

    const result = await dailyRecordService.getDailyRecords(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      branchId,
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
        message: 'Failed to fetch daily records',
      },
    });
  }
});

/**
 * GET /daily-records/current
 * Get current day status for a branch
 */
router.get('/current', authorize('daily_open_close.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query as Record<string, string>;

    if (!branchId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'branchId is required' },
      });
      return;
    }

    const status = await dailyRecordService.getCurrentDayStatus(
      req.user.businessId,
      branchId
    );

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch current day status',
      },
    });
  }
});

/**
 * GET /daily-records/:id
 * Get daily record by ID
 */
router.get('/:id', authorize('daily_open_close.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const record = await dailyRecordService.getDailyRecordById(
      req.params.id as string,
      req.user.businessId
    );

    if (!record) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Daily record not found' },
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
        message: 'Failed to fetch daily record',
      },
    });
  }
});

/**
 * GET /daily-records/:id/summary
 * Get daily summary (shifts and totals)
 */
router.get('/:id/summary', authorize('daily_open_close.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const summary = await dailyRecordService.getDailySummary(
      req.params.id as string,
      req.user.businessId
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch daily summary',
      },
    });
  }
});

/**
 * POST /daily-records/open
 * Open a business day
 */
router.post('/open', authorize('daily_open_close.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, businessDate, notes } = req.body;

    if (!branchId || !businessDate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId and businessDate are required',
        },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const record = await dailyRecordService.openDay(
      {
        businessId: req.user.businessId,
        branchId,
        businessDate: new Date(businessDate),
        notes,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OPEN_ERROR',
        message: error instanceof Error ? error.message : 'Failed to open day',
      },
    });
  }
});

/**
 * POST /daily-records/:id/close
 * Close a business day
 */
router.post('/:id/close', authorize('daily_open_close.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { notes } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const record = await dailyRecordService.closeDay(
      req.params.id as string,
      req.user.businessId,
      { notes },
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
        code: 'CLOSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to close day',
      },
    });
  }
});

export default router;
