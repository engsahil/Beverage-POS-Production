import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as permissionService from '../../services/permissionService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /permissions
 * Get all permissions
 */
router.get('/', authorize('roles.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const permissions = await permissionService.getPermissions(req.user.businessId);

    res.status(200).json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch permissions',
      },
    });
  }
});

/**
 * GET /permissions/grouped
 * Get permissions grouped by module
 */
router.get('/grouped', authorize('roles.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const grouped = await permissionService.getPermissionsByModule(req.user.businessId);

    res.status(200).json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch permissions',
      },
    });
  }
});

export default router;
