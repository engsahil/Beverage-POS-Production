import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as syncService from '../../services/syncService.js';
import prisma from '../../lib/prisma.js';

const router = Router();

// All sync routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/sync/process
 * Process a batch of queued operations from POS
 */
router.post('/process', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    const { operations } = req.body;

    if (!operations || !Array.isArray(operations)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Operations array is required' },
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const businessId = req.user.businessId;
    const branchId = req.user.branchId || undefined;
    const userId = req.user.sub;

    const results = await syncService.processSyncBatch(
      businessId,
      branchId,
      userId,
      operations
    );

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success && !r.conflict).length,
          conflicts: results.filter(r => r.conflict).length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: error instanceof Error ? error.message : 'Sync processing failed',
      },
    });
  }
});

/**
 * GET /api/v1/sync/conflicts
 * Get pending sync conflicts for admin review
 */
router.get('/conflicts', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'OPEN';
    
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const conflicts = await syncService.getSyncConflicts(
      req.user.businessId,
      status as 'OPEN' | 'RESOLVED' | 'DISMISSED'
    );

    res.json({
      success: true,
      data: conflicts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch sync conflicts',
      },
    });
  }
});

/**
 * POST /api/v1/sync/conflicts/:id/resolve
 * Resolve a sync conflict
 */
router.post('/conflicts/:id/resolve', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { resolutionNotes } = req.body;

    if (!resolutionNotes) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Resolution notes are required' },
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const conflict = await syncService.resolveConflict(
      id,
      req.user.businessId,
      req.user.sub,
      resolutionNotes
    );

    res.json({
      success: true,
      data: conflict,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESOLVE_ERROR',
        message: 'Failed to resolve conflict',
      },
    });
  }
});

/**
 * POST /api/v1/sync/conflicts/:id/dismiss
 * Dismiss a sync conflict
 */
router.post('/conflicts/:id/dismiss', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { resolutionNotes } = req.body;

    if (!resolutionNotes) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Resolution notes are required' },
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const conflict = await syncService.dismissConflict(
      id,
      req.user.businessId,
      req.user.sub,
      resolutionNotes
    );

    res.json({
      success: true,
      data: conflict,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DISMISS_ERROR',
        message: 'Failed to dismiss conflict',
      },
    });
  }
});

/**
 * GET /api/v1/sync/conflicts/stats
 * Get sync conflict statistics
 */
router.get('/conflicts/stats', authorize('reports.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated' },
      });
      return;
    }

    const businessId = req.user.businessId;

    const [open, resolved, dismissed] = await Promise.all([
      prisma.syncConflict.count({
        where: { businessId, status: 'OPEN' },
      }),
      prisma.syncConflict.count({
        where: { businessId, status: 'RESOLVED' },
      }),
      prisma.syncConflict.count({
        where: { businessId, status: 'DISMISSED' },
      }),
    ]);

    const byType = await prisma.syncConflict.groupBy({
      by: ['conflictType'],
      where: { businessId, status: 'OPEN' },
      _count: { id: true },
    });

    const bySeverity = await prisma.syncConflict.groupBy({
      by: ['severity'],
      where: { businessId, status: 'OPEN' },
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        total: open + resolved + dismissed,
        open,
        resolved,
        dismissed,
        byType: byType.map(t => ({ type: t.conflictType, count: t._count.id })),
        bySeverity: bySeverity.map(s => ({ severity: s.severity, count: s._count.id })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to fetch conflict statistics',
      },
    });
  }
});

/**
 * POST /api/v1/sync/cleanup
 * Clean up expired idempotency records
 */
router.post('/cleanup', authorize('reports.view'), async (_req: Request, res: Response) => {
  try {
    const count = await syncService.cleanupExpiredIdempotencyRecords();

    res.json({
      success: true,
      data: {
        deletedCount: count,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLEANUP_ERROR',
        message: 'Failed to cleanup expired records',
      },
    });
  }
});

export default router;
