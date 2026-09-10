import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as expenseService from '../../services/expenseService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /expenses
 * Get all expenses with filtering
 */
router.get('/', authorize('expenses.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      q,
      categoryId,
      branchId,
      paymentMethod,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      createdBy,
    } = req.query as Record<string, string>;

    const result = await expenseService.getExpenses(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      categoryId,
      branchId,
      paymentMethod,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      createdBy,
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
        message: 'Failed to fetch expenses',
      },
    });
  }
});

/**
 * GET /expenses/totals
 * Get expense totals
 */
router.get('/totals', authorize('expenses.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, categoryId, startDate, endDate } = req.query as Record<string, string>;

    const totals = await expenseService.getExpenseTotals(req.user.businessId, {
      branchId,
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: totals,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch expense totals',
      },
    });
  }
});

/**
 * GET /expenses/totals/by-category
 * Get expense totals by category
 */
router.get('/totals/by-category', authorize('expenses.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { branchId, startDate, endDate } = req.query as Record<string, string>;

    const totals = await expenseService.getExpenseTotalsByCategory(req.user.businessId, {
      branchId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      success: true,
      data: totals,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch expense totals by category',
      },
    });
  }
});

/**
 * GET /expenses/:id
 * Get expense by ID
 */
router.get('/:id', authorize('expenses.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const expense = await expenseService.getExpenseById(req.params.id as string, req.user.businessId);

    if (!expense) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch expense',
      },
    });
  }
});

/**
 * POST /expenses
 * Create expense
 */
router.post('/', authorize('expenses.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      branchId,
      categoryId,
      description,
      amount,
      paymentMethod,
      expenseDate,
      referenceNumber,
      notes,
      idempotencyKey,
    } = req.body;

    // Validation
    if (!branchId || !categoryId || !description || !amount || !paymentMethod || !expenseDate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId, categoryId, description, amount, paymentMethod, and expenseDate are required',
        },
      });
      return;
    }

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const expense = await expenseService.createExpense(
      {
        businessId: req.user.businessId,
        branchId,
        categoryId,
        description,
        amount,
        paymentMethod,
        expenseDate: new Date(expenseDate),
        referenceNumber,
        notes,
        idempotencyKey,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create expense',
      },
    });
  }
});

/**
 * PUT /expenses/:id
 * Update expense
 */
router.put('/:id', authorize('expenses.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      categoryId,
      description,
      amount,
      paymentMethod,
      expenseDate,
      referenceNumber,
      notes,
    } = req.body;

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const expense = await expenseService.updateExpense(
      req.params.id as string,
      req.user.businessId,
      {
        ...(categoryId !== undefined && { categoryId }),
        ...(description !== undefined && { description }),
        ...(amount !== undefined && { amount }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(expenseDate !== undefined && { expenseDate: new Date(expenseDate) }),
        ...(referenceNumber !== undefined && { referenceNumber }),
        ...(notes !== undefined && { notes }),
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update expense',
      },
    });
  }
});

/**
 * POST /expenses/:id/cancel
 * Cancel expense
 */
router.post('/:id/cancel', authorize('expenses.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cancellation reason is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const expense = await expenseService.cancelExpense(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel expense',
      },
    });
  }
});

export default router;
