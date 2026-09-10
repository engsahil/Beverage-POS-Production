import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createProductSchema, updateProductSchema, uuidParamSchema, productSearchSchema } from '../validators/schemas.js';
import * as productService from '../../services/productService.js';
import * as variantService from '../../services/variantService.js';
import { createVariantSchema } from '../validators/schemas.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /products
 * Get all products with filtering and search
 */
router.get('/', authorize('products.view'), validate(productSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, q, categoryId, isActive } = req.query as Record<string, string>;

    const result = await productService.getProducts(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      categoryId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
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
        message: 'Failed to fetch products',
      },
    });
  }
});

/**
 * GET /products/search/barcode/:barcode
 * Search product by barcode
 */
router.get('/search/barcode/:barcode', authorize('products.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const result = await productService.searchByBarcode(req.params.barcode as string, req.user.businessId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No product or variant found with this barcode' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
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
 * GET /products/search/sku/:sku
 * Search product by SKU
 */
router.get('/search/sku/:sku', authorize('products.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const result = await productService.searchBySku(req.params.sku as string, req.user.businessId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No product or variant found with this SKU' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
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
 * GET /products/:id
 * Get product by ID
 */
router.get('/:id', authorize('products.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const product = await productService.getProductById(req.params.id as string, req.user.businessId);

    if (!product) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Product not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

/**
 * POST /products
 * Create a new product
 */
router.post('/', authorize('products.create'), validate(createProductSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const product = await productService.createProduct(
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
      data: product,
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
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create product',
      },
    });
  }
});

/**
 * PUT /products/:id
 * Update product
 */
router.put('/:id', authorize('products.edit'), validate(uuidParamSchema, 'params'), validate(updateProductSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const product = await productService.updateProduct(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Product not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
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
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update product',
      },
    });
  }
});

/**
 * POST /products/:id/disable
 * Disable product
 */
router.post('/:id/disable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await productService.disableProduct(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Product not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DISABLE_ERROR',
        message: 'Failed to disable product',
      },
    });
  }
});

/**
 * POST /products/:id/enable
 * Enable product
 */
router.post('/:id/enable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const product = await productService.enableProduct(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Product not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ENABLE_ERROR',
        message: 'Failed to enable product',
      },
    });
  }
});

// ==========================================
// VARIANT ROUTES (nested under products)
// ==========================================

/**
 * GET /products/:productId/variants
 * Get all variants for a product
 */
router.get('/:productId/variants', authorize('products.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const variants = await variantService.getVariantsByProduct(
      req.params.productId as string,
      req.user.businessId
    );

    res.status(200).json({
      success: true,
      data: variants,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch variants',
      },
    });
  }
});

/**
 * POST /products/:productId/variants
 * Create a new variant for a product
 */
router.post('/:productId/variants', authorize('products.create'), validate(uuidParamSchema, 'params'), validate(createVariantSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const variant = await variantService.createVariant(
      {
        ...req.body,
        productId: req.params.productId as string,
      },
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: variant,
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
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create variant',
      },
    });
  }
});

/**
 * PUT /products/:productId/variants/:variantId
 * Update variant
 */
router.put('/:productId/variants/:variantId', authorize('products.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const variant = await variantService.updateVariant(
      req.params.variantId as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: variant,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Variant not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
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
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update variant',
      },
    });
  }
});

/**
 * POST /products/:productId/variants/:variantId/disable
 * Disable variant
 */
router.post('/:productId/variants/:variantId/disable', authorize('products.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const variant = await variantService.disableVariant(
      req.params.variantId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: variant,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Variant not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DISABLE_ERROR',
        message: 'Failed to disable variant',
      },
    });
  }
});

/**
 * POST /products/:productId/variants/:variantId/enable
 * Enable variant
 */
router.post('/:productId/variants/:variantId/enable', authorize('products.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const variant = await variantService.enableVariant(
      req.params.variantId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: variant,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Variant not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ENABLE_ERROR',
        message: 'Failed to enable variant',
      },
    });
  }
});

/**
 * DELETE /products/:productId/variants/:variantId
 * Delete a variant (only when it has no transaction history)
 */
router.delete('/:productId/variants/:variantId', authorize('products.delete'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    await variantService.deleteVariant(
      req.params.variantId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: 'Variant deleted',
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Variant not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message.includes('cannot be deleted')) {
        res.status(409).json({
          success: false,
          error: { code: 'CONFLICT', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete variant',
      },
    });
  }
});

export default router;
