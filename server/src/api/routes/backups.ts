/**
 * Phase 19: Cloud Backup API Routes
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { backupLimiter } from '../middleware/rateLimiter.js';
import * as backupService from '../../services/backupService.js';

const router = Router();

// Apply backup rate limiter to all routes
router.use(backupLimiter);

router.use(authenticate);

/**
 * GET /backups
 * List backups with pagination
 */
router.get('/', authorize('backup.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, status, type } = req.query;

    const result = await backupService.listBackups({
      businessId: req.user.businessId,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
      status: status as string,
      type: type as string,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'BACKUP_LIST_ERROR',
        message: error instanceof Error ? error.message : 'Failed to list backups',
      },
    });
  }
});

/**
 * GET /backups/storage/usage
 * Get storage usage and quota information
 */
router.get('/storage/usage', authorize('backup.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const usage = await backupService.getStorageUsage(req.user.businessId);
    res.json({ success: true, data: usage });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STORAGE_USAGE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get storage usage',
      },
    });
  }
});

/**
 * GET /backups/storage/health
 * Check storage provider health
 */
router.get('/storage/health', authorize('backup.manage'), async (_req: Request, res: Response) => {
  try {
    const health = await backupService.checkStorageHealth();
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STORAGE_HEALTH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to check storage health',
      },
    });
  }
});

/**
 * POST /backups
 * Create a manual backup
 */
router.post('/', authorize('backup.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const backup = await backupService.createBackup({
      businessId: req.user.businessId,
      userId: req.user.sub,
      type: 'MANUAL',
      ipAddress,
      userAgent,
    });

    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create backup';
    const statusCode = message.includes('quota') ? 413 : 400;

    res.status(statusCode).json({
      success: false,
      error: {
        code: 'BACKUP_CREATE_ERROR',
        message,
      },
    });
  }
});

/**
 * GET /backups/:id
 * Get backup details
 */
router.get('/:id', authorize('backup.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const backupId = req.params.id as string;
    const backup = await backupService.getBackup(backupId, req.user.businessId);

    if (!backup) {
      res.status(404).json({
        success: false,
        error: { code: 'BACKUP_NOT_FOUND', message: 'Backup not found' },
      });
      return;
    }

    res.json({ success: true, data: backup });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'BACKUP_GET_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get backup',
      },
    });
  }
});

/**
 * POST /backups/:id/retry
 * Retry a failed backup
 */
router.post('/:id/retry', authorize('backup.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const backupId = req.params.id as string;
    const backup = await backupService.retryBackup(
      backupId,
      req.user.businessId,
      req.user.sub
    );

    res.json({ success: true, data: backup });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BACKUP_RETRY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to retry backup',
      },
    });
  }
});

/**
 * POST /backups/:id/restore
 * Restore a backup
 *
 * Destructive operation: replaces the business's current data with the
 * backup snapshot inside a single transaction. Requires an explicit
 * confirmation flag ({ confirm: true }) from the caller.
 */
router.post('/:id/restore', authorize('backup.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const backupId = req.params.id as string;
    const result = await backupService.restoreBackup({
      backupId,
      businessId: req.user.businessId,
      userId: req.user.sub,
      confirm: req.body?.confirm === true,
      ipAddress,
      userAgent,
    });

    // success:true is only returned after the data restore actually
    // completed and committed (see backupRestore.performRestore).
    res.json({ success: true, data: result });
  } catch (error) {
    const restoreError = error as { code?: string; message?: string };
    const code = restoreError?.code;
    const statusCode =
      code === 'BACKUP_NOT_FOUND' ? 404
      : code === 'CONFIRMATION_REQUIRED' || code === 'CHECKSUM_MISMATCH' ||
        code === 'INVALID_BACKUP_FORMAT' || code === 'UNSUPPORTED_SCHEMA_VERSION' ||
        code === 'BUSINESS_MISMATCH' || code === 'NOT_RESTORABLE_STATE' ||
        code === 'MISSING_FILE_INFO' || code === 'BACKUP_DECOMPRESSION_FAILED' ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      restored: false,
      error: {
        code: code || 'BACKUP_RESTORE_ERROR',
        message: restoreError instanceof Error ? restoreError.message : 'Failed to restore backup',
      },
    });
  }
});

/**
 * DELETE /backups/:id
 * Delete a backup
 */
router.delete('/:id', authorize('backup.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const backupId = req.params.id as string;
    await backupService.deleteBackup(
      backupId,
      req.user.businessId,
      req.user.sub
    );

    res.json({ success: true, message: 'Backup deleted' });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BACKUP_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete backup',
      },
    });
  }
});

export default router;
