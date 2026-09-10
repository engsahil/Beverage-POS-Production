import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema, uuidParamSchema } from '../validators/schemas.js';
import * as categoryService from '../../services/categoryService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /categories
 * Get all categories for the business
 */
router.get('/', authorize('products.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, search, isActive } = req.query;

    const result = await categoryService.getCategories(req.user.businessId, {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      search: search as string,
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
        message: 'Failed to fetch categories',
      },
    });
  }
});

/**
 * GET /categories/:id
 * Get category by ID
 */
router.get('/:id', authorize('products.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const category = await categoryService.getCategoryById(req.params.id as string, req.user.businessId);

    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Category not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch category',
      },
    });
  }
});

/**
 * POST /categories
 * Create a new category
 */
router.post('/', authorize('products.create'), validate(createCategorySchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await categoryService.createCategory(
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
      data: category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Category name already exists') {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create category',
      },
    });
  }
});

/**
 * PUT /categories/:id
 * Update category
 */
router.put('/:id', authorize('products.edit'), validate(uuidParamSchema, 'params'), validate(updateCategorySchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await categoryService.updateCategory(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Category not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Category name already exists') {
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
        message: 'Failed to update category',
      },
    });
  }
});

/**
 * POST /categories/:id/disable
 * Disable category
 */
router.post('/:id/disable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await categoryService.disableCategory(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Category not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot disable category with active products') {
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
        code: 'DISABLE_ERROR',
        message: 'Failed to disable category',
      },
    });
  }
});

/**
 * POST /categories/:id/enable
 * Enable category
 */
router.post('/:id/enable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await categoryService.enableCategory(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Category not found') {
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
        message: 'Failed to enable category',
      },
    });
  }
});

/**
 * DELETE /categories/:id
 * Delete category (only if no products reference it)
 */
router.delete('/:id', authorize('products.delete'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await categoryService.deleteCategory(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Category not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot delete category with products') {
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
        code: 'DELETE_ERROR',
        message: 'Failed to delete category',
      },
    });
  }
});

export default router;
