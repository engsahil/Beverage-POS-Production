import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema, resetPasswordSchema, uuidParamSchema, paginationSchema } from '../validators/schemas.js';
import * as userService from '../../services/userService.js';
import { resetPassword } from '../../services/authService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /users
 * Get all users (with pagination and filters)
 */
router.get('/', authorize('cashier.view'), validate(paginationSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, search, roleId, isActive, branchId } = req.query as Record<string, string>;

    const result = await userService.getUsers(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
      roleId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      branchId,
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
        message: 'Failed to fetch users',
      },
    });
  }
});

/**
 * GET /users/:id
 * Get user by ID
 */
router.get('/:id', authorize('cashier.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const user = await userService.getUserById(req.params.id as string, req.user.businessId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch user',
      },
    });
  }
});

/**
 * POST /users
 * Create a new user
 */
router.post('/', authorize('cashier.manage'), validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const user = await userService.createUser(
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
      data: user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Username already exists') {
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
        message: 'Failed to create user',
      },
    });
  }
});

/**
 * PUT /users/:id
 * Update user
 */
router.put('/:id', authorize('cashier.manage'), validate(uuidParamSchema, 'params'), validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const user = await userService.updateUser(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update user',
      },
    });
  }
});

/**
 * POST /users/:id/disable
 * Disable user
 */
router.post('/:id/disable', authorize('cashier.manage'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const user = await userService.disableUser(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'DISABLE_ERROR',
        message: 'Failed to disable user',
      },
    });
  }
});

/**
 * POST /users/:id/enable
 * Enable user
 */
router.post('/:id/enable', authorize('cashier.manage'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const user = await userService.enableUser(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'ENABLE_ERROR',
        message: 'Failed to enable user',
      },
    });
  }
});

/**
 * POST /users/reset-password
 * Reset user password (admin operation)
 */
router.post('/reset-password', authorize('cashier.manage'), validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { userId, newPassword } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    await resetPassword(
      userId,
      newPassword,
      req.user.sub,
      req.user.businessId,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESET_ERROR',
        message: 'Failed to reset password',
      },
    });
  }
});

export default router;
