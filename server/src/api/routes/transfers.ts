import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createTransferSchema,
  transferSearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as transferService from '../../services/transferService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /transfers
 * Get all transfers
 */
router.get('/', authorize('inventory.transfer.view'), validate(transferSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, sourceBranchId, destinationBranchId, status, startDate, endDate } =
      req.query as Record<string, string>;

    const result = await transferService.getTransfers(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      sourceBranchId,
      destinationBranchId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
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
        message: 'Failed to fetch transfers',
      },
    });
  }
});

/**
 * GET /transfers/:id
 * Get transfer by ID
 */
router.get('/:id', authorize('inventory.transfer.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const transfer = await transferService.getTransferById(
      req.params.id as string,
      req.user.businessId
    );

    if (!transfer) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transfer not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch transfer',
      },
    });
  }
});

/**
 * POST /transfers
 * Create a new transfer
 */
router.post('/', authorize('inventory.transfer.create'), validate(createTransferSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const transfer = await transferService.createTransfer(
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
      data: transfer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create transfer',
      },
    });
  }
});

/**
 * POST /transfers/:id/approve
 * Approve transfer (mark as in transit)
 */
router.post('/:id/approve', authorize('inventory.transfer.approve'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const transfer = await transferService.approveTransfer(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Transfer not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only draft transfers can be approved') {
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
        code: 'APPROVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to approve transfer',
      },
    });
  }
});

/**
 * POST /transfers/:id/receive
 * Receive transfer
 */
router.post('/:id/receive', authorize('inventory.transfer.receive'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const transfer = await transferService.receiveTransfer(
      {
        transferId: req.params.id as string,
        businessId: req.user.businessId,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Transfer not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Only in-transit transfers can be received') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
      if (error.message === 'This transfer has already been received') {
        res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'RECEIVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to receive transfer',
      },
    });
  }
});

/**
 * POST /transfers/:id/cancel
 * Cancel transfer
 */
router.post('/:id/cancel', authorize('inventory.transfer.approve'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const transfer = await transferService.cancelTransfer(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Transfer not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Received transfers cannot be cancelled') {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: error.message },
        });
        return;
      }
      if (error.message === 'Transfer is already cancelled') {
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
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel transfer',
      },
    });
  }
});

export default router;
