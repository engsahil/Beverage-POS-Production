import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as posService from '../../services/posService.js';
import { logger } from '../../lib/logger.js';

const router = Router();

// All POS routes require authentication
router.use(authenticate);

/**
 * GET /pos/products
 * Search products for POS with inventory data
 */
router.get('/products', authorize('pos.access'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { search, categoryId, page, limit } = req.query;

    // Get branch ID from user or query
    const branchId = req.query.branchId as string | undefined;
    
    if (!branchId && !req.user.branchId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Branch ID is required',
        },
      });
      return;
    }

    const result = await posService.searchProductsForPOS(
      req.user.businessId,
      (branchId || req.user.branchId) as string,
      {
        search: search as string | undefined,
        categoryId: categoryId as string | undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      }
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('POS product search failed', { error, userId: req.user?.sub });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search products',
      },
    });
  }
});

/**
 * GET /pos/barcode/:barcode
 * Search product by barcode for POS
 */
router.get('/barcode/:barcode', authorize('pos.access'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const barcode = req.params.barcode as string;
    const branchId = req.query.branchId as string | undefined;

    if (!branchId && !req.user.branchId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Branch ID is required',
        },
      });
      return;
    }

    const result = await posService.searchByBarcodeForPOS(
      barcode,
      req.user.businessId,
      (branchId || req.user.branchId) as string
    );

    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Barcode not recognized',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('POS barcode search failed', { error, userId: req.user?.sub });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search by barcode',
      },
    });
  }
});

/**
 * GET /pos/sku/:sku
 * Search product by SKU for POS
 */
router.get('/sku/:sku', authorize('pos.access'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const sku = req.params.sku as string;
    const branchId = req.query.branchId as string | undefined;

    if (!branchId && !req.user.branchId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Branch ID is required',
        },
      });
      return;
    }

    const result = await posService.searchBySkuForPOS(
      sku,
      req.user.businessId,
      (branchId || req.user.branchId) as string
    );

    if (!result) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'SKU not found',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('POS SKU search failed', { error, userId: req.user?.sub });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search by SKU',
      },
    });
  }
});

/**
 * GET /pos/categories
 * Get categories for POS
 */
router.get('/categories', authorize('pos.access'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const categories = await posService.getCategoriesForPOS(req.user.businessId);

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('POS categories fetch failed', { error, userId: req.user?.sub });
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch categories',
      },
    });
  }
});

/**
 * GET /pos/stock/:variantId
 * Get stock for a specific variant
 */
router.get('/stock/:variantId', authorize('pos.access'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const variantId = req.params.variantId as string;
    const branchId = req.query.branchId as string | undefined;

    if (!branchId && !req.user.branchId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Branch ID is required',
        },
      });
      return;
    }

    const stock = await posService.getVariantStock(
      variantId,
      req.user.businessId,
      (branchId || req.user.branchId) as string
    );

    if (!stock) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Stock information not found',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: stock,
    });
  } catch (error) {
    logger.error('POS stock fetch failed', { error, userId: req.user?.sub });
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch stock',
      },
    });
  }
});

export default router;
