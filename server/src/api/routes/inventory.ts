import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  openingStockSchema,
  stockAdjustmentSchema,
  inventorySearchSchema,
  stockMovementSearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as inventoryService from '../../services/inventoryService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==========================================
// INVENTORY ROUTES
// ==========================================

/**
 * GET /inventory
 * Get all inventory with filtering and search
 */
router.get('/', authorize('inventory.view'), validate(inventorySearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, q, categoryId, branchId, productId, stockStatus } = req.query as Record<string, string>;

    const result = await inventoryService.getInventories(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      categoryId,
      branchId,
      productId,
      stockStatus: stockStatus as 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL' | 'OVERSTOCKED' | undefined,
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
        message: 'Failed to fetch inventory',
      },
    });
  }
});

/**
 * GET /inventory/summary
 * Get inventory summary (stock status counts)
 */
router.get('/summary', authorize('inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId } = req.query;

    const summary = await inventoryService.getInventorySummary(
      req.user.businessId,
      branchId as string
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch inventory summary',
      },
    });
  }
});

/**
 * GET /inventory/:branchId/:productId
 * Get inventory for a specific product at a branch
 */
router.get('/:branchId/:productId', authorize('inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, productId } = req.params;
    const { variantId } = req.query;

    const inventory = await inventoryService.getInventory(
      req.user.businessId,
      branchId as string,
      productId as string,
      variantId as string | undefined
    );

    if (!inventory) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Inventory record not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: inventory,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch inventory',
      },
    });
  }
});

// ==========================================
// STOCK OPERATIONS
// ==========================================

/**
 * GET /inventory/opening-stock
 * List recorded opening stock entries (newest first)
 */
router.get('/opening-stock', authorize('inventory.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, branchId } = req.query as Record<string, string>;

    const result = await inventoryService.getOpeningStockEntries(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      branchId: branchId || undefined,
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
        message: 'Failed to fetch opening stock entries',
      },
    });
  }
});

/**
 * POST /inventory/opening-stock
 * Create opening stock for a product/variant
 */
router.post('/opening-stock', authorize('inventory.opening_stock'), validate(openingStockSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await inventoryService.createOpeningStock(
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
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: { code: 'CONFLICT', message: error.message },
        });
        return;
      }
      if (error.message.includes('Insufficient stock')) {
        res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_STOCK', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'STOCK_ERROR',
        message: 'Failed to create opening stock',
      },
    });
  }
});

/**
 * POST /inventory/adjust
 * Manual stock adjustment (increase or decrease)
 */
router.post('/adjust', authorize('inventory.adjust'), validate(stockAdjustmentSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await inventoryService.createStockAdjustment(
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
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
      if (error.message.includes('Insufficient stock')) {
        res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_STOCK', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ADJUSTMENT_ERROR',
        message: 'Failed to adjust stock',
      },
    });
  }
});

// ==========================================
// STOCK MOVEMENT ROUTES
// ==========================================

/**
 * GET /inventory/movements
 * Get stock movements with filtering
 */
router.get('/movements', authorize('inventory.movements.view'), validate(stockMovementSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, productId, variantId, branchId, movementType, performedBy, startDate, endDate } = req.query as Record<string, string>;

    const result = await inventoryService.getStockMovements(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      productId,
      variantId,
      branchId,
      movementType,
      performedBy,
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
        message: 'Failed to fetch stock movements',
      },
    });
  }
});

/**
 * GET /inventory/movements/:id
 * Get stock movement by ID
 */
router.get('/movements/:id', authorize('inventory.movements.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const movement = await inventoryService.getStockMovementById(
      req.params.id as string,
      req.user.businessId
    );

    if (!movement) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Stock movement not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: movement,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch stock movement',
      },
    });
  }
});

export default router;
