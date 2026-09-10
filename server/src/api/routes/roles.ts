import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createRoleSchema, updateRoleSchema, uuidParamSchema } from '../validators/schemas.js';
import * as roleService from '../../services/roleService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /roles
 * Get all roles
 */
router.get('/', authorize('roles.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const roles = await roleService.getRoles(req.user.businessId);

    res.status(200).json({
      success: true,
      data: roles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch roles',
      },
    });
  }
});

/**
 * GET /roles/:id
 * Get role by ID
 */
router.get('/:id', authorize('roles.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { id } = req.params;
    const role = await roleService.getRoleById(id as string, req.user.businessId);

    if (!role) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch role',
      },
    });
  }
});

/**
 * POST /roles
 * Create a new role
 */
router.post('/', authorize('roles.manage'), validate(createRoleSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const role = await roleService.createRole(
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
      data: role,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Role name already exists') {
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
        message: 'Failed to create role',
      },
    });
  }
});

/**
 * PUT /roles/:id
 * Update role
 */
router.put('/:id', authorize('roles.manage'), validate(uuidParamSchema, 'params'), validate(updateRoleSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const { id } = req.params;
    const role = await roleService.updateRole(
      id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Role not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot rename system roles' || error.message === 'Cannot delete system roles') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update role',
      },
    });
  }
});

/**
 * DELETE /roles/:id
 * Delete role
 */
router.delete('/:id', authorize('roles.manage'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const { id } = req.params;
    await roleService.deleteRole(
      id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Role not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot delete system roles') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot delete role with assigned users') {
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
        message: 'Failed to delete role',
      },
    });
  }
});

export default router;
