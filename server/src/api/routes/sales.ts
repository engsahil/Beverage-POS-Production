import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/schemas.js';
import * as saleService from '../../services/saleService.js';
import * as checkoutService from '../../services/checkoutService.js';

const router = Router();

router.use(authenticate);

/**
 * POST /sales/checkout
 * Process checkout and create sale
 */
router.post('/checkout', authorize('sales.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await checkoutService.processCheckout(
      {
        ...req.body,
        businessId: req.user.businessId,
        branchId: req.body.branchId || req.user.branchId,
        cashierId: req.user.sub,
      },
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: result.sale,
      warnings: result.validation.warnings,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CHECKOUT_ERROR',
        message: error instanceof Error ? error.message : 'Checkout failed',
      },
    });
  }
});

/**
 * POST /sales/preview
 * Preview checkout totals without creating sale
 */
router.post('/preview', authorize('sales.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const result = await checkoutService.getCheckoutPreview({
      ...req.body,
      businessId: req.user.businessId,
      cashierId: req.user.sub,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'PREVIEW_ERROR',
        message: error instanceof Error ? error.message : 'Preview failed',
      },
    });
  }
});

/**
 * GET /sales
 * Get all sales
 */
router.get('/', authorize('sales.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, branchId, cashierId, status, startDate, endDate } = req.query as Record<string, string>;

    const result = await saleService.getSales(req.user.businessId, {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch sales',
      },
    });
  }
});

/**
 * GET /sales/:id
 * Get sale by ID
 */
router.get('/:id', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const sale = await saleService.getSaleById(req.params.id as string, req.user.businessId);

    if (!sale) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Sale not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch sale',
      },
    });
  }
});

/**
 * POST /sales/:id/void
 * Void a sale
 */
router.post('/:id/void', authorize('sales.void'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Void reason is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const sale = await saleService.voidSale(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      reason,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Sale not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only completed sales can be voided') {
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
        code: 'VOID_ERROR',
        message: error instanceof Error ? error.message : 'Failed to void sale',
      },
    });
  }
});

export default router;
