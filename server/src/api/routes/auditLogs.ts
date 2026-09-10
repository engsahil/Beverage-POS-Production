import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as auditService from '../../services/auditService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /audit-logs
 * List audit logs with filtering and pagination
 */
router.get('/', authorize('audit.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, action, entityType, entityId, userId, startDate, endDate } =
      req.query as Record<string, string>;

    const result = await auditService.getAuditLogs({
      businessId: req.user.businessId,
      userId: userId || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100),
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
        message: 'Failed to fetch audit logs',
      },
    });
  }
});

export default router;
