import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as expenseCategoryService from '../../services/expenseCategoryService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /expense-categories
 * Get all expense categories
 */
router.get('/', authorize('expense_categories.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, q, isActive } = req.query as Record<string, string>;

    const result = await expenseCategoryService.getExpenseCategories(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search: q,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
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
        message: 'Failed to fetch expense categories',
      },
    });
  }
});

/**
 * GET /expense-categories/:id
 * Get expense category by ID
 */
router.get('/:id', authorize('expense_categories.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const category = await expenseCategoryService.getExpenseCategoryById(
      req.params.id as string,
      req.user.businessId
    );

    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense category not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch expense category',
      },
    });
  }
});

/**
 * POST /expense-categories
 * Create expense category
 */
router.post('/', authorize('expense_categories.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { name, description } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Category name is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await expenseCategoryService.createExpenseCategory(
      {
        businessId: req.user.businessId,
        name: name.trim(),
        description,
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
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create expense category',
      },
    });
  }
});

/**
 * PUT /expense-categories/:id
 * Update expense category
 */
router.put('/:id', authorize('expense_categories.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { name, description } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await expenseCategoryService.updateExpenseCategory(
      req.params.id as string,
      req.user.businessId,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update expense category',
      },
    });
  }
});

/**
 * PATCH /expense-categories/:id/toggle
 * Enable/disable expense category
 */
router.patch('/:id/toggle', authorize('expense_categories.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'isActive must be a boolean' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const category = await expenseCategoryService.toggleExpenseCategory(
      req.params.id as string,
      req.user.businessId,
      isActive,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to toggle expense category',
      },
    });
  }
});

export default router;
