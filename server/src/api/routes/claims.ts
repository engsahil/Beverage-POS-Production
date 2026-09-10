import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as claimService from '../../services/claimService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /claims
 * Get all claims with filtering
 */
router.get('/', authorize('claims.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      page,
      limit,
      q,
      claimType,
      branchId,
      vendorId,
      purchaseId,
      status,
      startDate,
      endDate,
      createdBy,
    } = req.query as Record<string, string>;

    const result = await claimService.getClaims(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q,
      claimType,
      branchId,
      vendorId,
      purchaseId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
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
        message: 'Failed to fetch claims',
      },
    });
  }
});

/**
 * GET /claims/:id
 * Get claim by ID
 */
router.get('/:id', authorize('claims.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const claim = await claimService.getClaimById(req.params.id as string, req.user.businessId);

    if (!claim) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Claim not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch claim',
      },
    });
  }
});

/**
 * POST /claims
 * Create claim
 */
router.post('/', authorize('claims.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      branchId,
      claimType,
      vendorId,
      purchaseId,
      claimDate,
      reason,
      description,
      referenceNumber,
      notes,
      items,
      idempotencyKey,
    } = req.body;

    // Validation
    if (!branchId || !claimType || !claimDate || !reason || !items) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branchId, claimType, claimDate, reason, and items are required',
        },
      });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one item is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.createClaim(
      {
        businessId: req.user.businessId,
        branchId,
        claimType,
        vendorId,
        purchaseId,
        claimDate: new Date(claimDate),
        reason,
        description,
        referenceNumber,
        notes,
        items,
        idempotencyKey,
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create claim',
      },
    });
  }
});

/**
 * PUT /claims/:id
 * Update claim (only DRAFT)
 */
router.put('/:id', authorize('claims.edit'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const {
      claimType,
      vendorId,
      purchaseId,
      claimDate,
      reason,
      description,
      referenceNumber,
      notes,
      items,
    } = req.body;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.updateClaim(
      req.params.id as string,
      req.user.businessId,
      {
        ...(claimType !== undefined && { claimType }),
        ...(vendorId !== undefined && { vendorId }),
        ...(purchaseId !== undefined && { purchaseId }),
        ...(claimDate !== undefined && { claimDate: new Date(claimDate) }),
        ...(reason !== undefined && { reason }),
        ...(description !== undefined && { description }),
        ...(referenceNumber !== undefined && { referenceNumber }),
        ...(notes !== undefined && { notes }),
        ...(items !== undefined && { items }),
      },
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update claim',
      },
    });
  }
});

/**
 * POST /claims/:id/submit
 * Submit claim
 */
router.post('/:id/submit', authorize('claims.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.submitClaim(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SUBMIT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to submit claim',
      },
    });
  }
});

/**
 * POST /claims/:id/review
 * Review claim
 */
router.post('/:id/review', authorize('claims.review'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.reviewClaim(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEW_ERROR',
        message: error instanceof Error ? error.message : 'Failed to review claim',
      },
    });
  }
});

/**
 * POST /claims/:id/approve
 * Approve claim
 */
router.post('/:id/approve', authorize('claims.approve'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.approveClaim(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'APPROVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to approve claim',
      },
    });
  }
});

/**
 * POST /claims/:id/reject
 * Reject claim
 */
router.post('/:id/reject', authorize('claims.approve'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.rejectClaim(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REJECT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to reject claim',
      },
    });
  }
});

/**
 * POST /claims/:id/resolve
 * Resolve claim
 */
router.post('/:id/resolve', authorize('claims.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { resolutionNotes, applyInventoryAction } = req.body;

    if (!resolutionNotes || typeof resolutionNotes !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Resolution notes are required' },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const claim = await claimService.resolveClaim(
      req.params.id as string,
      req.user.businessId,
      resolutionNotes,
      applyInventoryAction === true,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESOLVE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to resolve claim',
      },
    });
  }
});

/**
 * POST /claims/:id/cancel
 * Cancel claim
 */
router.post('/:id/cancel', authorize('claims.manage'), async (req: Request, res: Response) => {
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

    const claim = await claimService.cancelClaim(
      req.params.id as string,
      req.user.businessId,
      reason,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: claim,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel claim',
      },
    });
  }
});

export default router;
