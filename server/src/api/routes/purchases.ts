import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseSearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as purchaseService from '../../services/purchaseService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /purchases
 * Get all purchases with search and filtering
 */
router.get('/', authorize('purchases.view'), validate(purchaseSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, q, vendorId, branchId, status, paymentStatus, startDate, endDate } = req.query as Record<string, string>;

    const result = await purchaseService.getPurchases(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      vendorId,
      branchId,
      status,
      paymentStatus,
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
        message: 'Failed to fetch purchases',
      },
    });
  }
});

/**
 * GET /purchases/:id
 * Get purchase by ID
 */
router.get('/:id', authorize('purchases.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const purchase = await purchaseService.getPurchaseById(req.params.id as string, req.user.businessId);

    if (!purchase) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Purchase not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch purchase',
      },
    });
  }
});

/**
 * POST /purchases
 * Create a new purchase (draft)
 */
router.post('/', authorize('purchases.create'), validate(createPurchaseSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const purchase = await purchaseService.createPurchase(
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
      data: purchase,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create purchase',
      },
    });
  }
});

/**
 * PUT /purchases/:id
 * Update purchase (only DRAFT purchases can be updated)
 */
router.put('/:id', authorize('purchases.edit'), validate(uuidParamSchema, 'params'), validate(updatePurchaseSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const purchase = await purchaseService.updatePurchase(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Purchase not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only draft purchases can be updated') {
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
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update purchase',
      },
    });
  }
});

/**
 * POST /purchases/:id/receive
 * Receive purchase (update inventory)
 */
router.post('/:id/receive', authorize('purchases.receive'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const purchase = await purchaseService.receivePurchase(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Purchase not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only draft purchases can be received') {
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
        code: 'RECEIVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to receive purchase',
      },
    });
  }
});

/**
 * POST /purchases/:id/cancel
 * Cancel purchase
 */
router.post('/:id/cancel', authorize('purchases.cancel'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const purchase = await purchaseService.cancelPurchase(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Purchase not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Purchase is already cancelled') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot cancel received purchase') {
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
        message: error instanceof Error ? error.message : 'Failed to cancel purchase',
      },
    });
  }
});

export default router;
