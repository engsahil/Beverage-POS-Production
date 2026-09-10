import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createStockCountSchema,
  stockCountSearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as stockCountService from '../../services/stockCountService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /stock-counts
 * Get all stock counts
 */
router.get('/', authorize('inventory.count'), validate(stockCountSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, branchId, status, startDate, endDate } = req.query as Record<string, string>;

    const result = await stockCountService.getStockCounts(req.user.businessId, {
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
        message: 'Failed to fetch stock counts',
      },
    });
  }
});

/**
 * GET /stock-counts/:id
 * Get stock count by ID
 */
router.get('/:id', authorize('inventory.count'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const stockCount = await stockCountService.getStockCountById(
      req.params.id as string,
      req.user.businessId
    );

    if (!stockCount) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Stock count not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: stockCount,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch stock count',
      },
    });
  }
});

/**
 * POST /stock-counts
 * Create a new stock count
 */
router.post('/', authorize('inventory.count'), validate(createStockCountSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const stockCount = await stockCountService.createStockCount(
      {
        ...req.body,
        businessId: req.user.businessId,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: stockCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create stock count',
      },
    });
  }
});

/**
 * POST /stock-counts/:id/confirm
 * Confirm stock count and create adjustments
 */
router.post('/:id/confirm', authorize('inventory.count'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const stockCount = await stockCountService.confirmStockCount(
      {
        stockCountId: req.params.id as string,
        businessId: req.user.businessId,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: stockCount,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Stock count not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only draft stock counts can be confirmed') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIRM_ERROR',
        message: error instanceof Error ? error.message : 'Failed to confirm stock count',
      },
    });
  }
});

/**
 * POST /stock-counts/:id/cancel
 * Cancel stock count
 */
router.post('/:id/cancel', authorize('inventory.count'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const stockCount = await stockCountService.cancelStockCount(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: stockCount,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Stock count not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only draft stock counts can be cancelled') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel stock count',
      },
    });
  }
});

export default router;
