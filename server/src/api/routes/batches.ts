import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createBatchSchema,
  batchSearchSchema,
  expirySearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as expiryService from '../../services/expiryService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /batches/summary
 * Get expiry summary
 */
router.get('/summary', authorize('inventory.expiry.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const branchId = req.query.branchId as string | undefined;

    const summary = await expiryService.getExpirySummary(req.user.businessId, branchId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch expiry summary',
      },
    });
  }
});

/**
 * GET /batches/expiring
 * Get expiring stock
 */
router.get('/expiring', authorize('inventory.expiry.view'), validate(expirySearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, branchId, status, productId } = req.query as Record<string, string>;

    const result = await expiryService.getExpiringStock(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      branchId,
      status: status as any,
      productId,
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
        message: 'Failed to fetch expiring stock',
      },
    });
  }
});

/**
 * GET /batches/fefe/:productId
 * Get FEFO (First Expire First Out) order for a product
 */
router.get('/fefe/:productId', authorize('inventory.expiry.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const productId = req.params.productId as string;
    const branchId = req.query.branchId as string | undefined;
    const variantId = req.query.variantId as string | undefined;

    if (!branchId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Branch ID is required' },
      });
      return;
    }

    const batches = await expiryService.getFEFOBatches(
      req.user.businessId,
      branchId,
      productId,
      variantId
    );

    res.status(200).json({
      success: true,
      data: batches,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch FEFO batches',
      },
    });
  }
});

/**
 * POST /batches/refresh
 * Refresh expiry statuses
 */
router.post('/refresh', authorize('inventory.expiry.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await expiryService.refreshExpiryStatuses(
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh expiry statuses',
      },
    });
  }
});

/**
 * GET /batches
 * Get all batches
 */
router.get('/', authorize('inventory.expiry.view'), validate(batchSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, branchId, productId, variantId, status, hasExpiry } =
      req.query as Record<string, string>;

    const result = await expiryService.getBatches(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      branchId,
      productId,
      variantId,
      status,
      hasExpiry: hasExpiry !== undefined ? hasExpiry === 'true' : undefined,
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
        message: 'Failed to fetch batches',
      },
    });
  }
});

/**
 * GET /batches/:id
 * Get batch by ID
 */
router.get('/:id', authorize('inventory.expiry.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const batch = await expiryService.getBatchById(
      req.params.id as string,
      req.user.businessId
    );

    if (!batch) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Batch not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: batch,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch batch',
      },
    });
  }
});

/**
 * POST /batches
 * Create a new batch
 */
router.post('/', authorize('inventory.expiry.manage'), validate(createBatchSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const batch = await expiryService.createBatch(
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
      data: batch,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create batch',
      },
    });
  }
});

export default router;
