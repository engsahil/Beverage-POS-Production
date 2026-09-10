import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorSearchSchema,
  uuidParamSchema,
} from '../validators/schemas.js';
import * as vendorService from '../../services/vendorService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /vendors
 * Get all vendors with search and filtering
 */
router.get('/', authorize('vendors.view'), validate(vendorSearchSchema, 'query'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, q, isActive } = req.query as Record<string, string>;

    const result = await vendorService.getVendors(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
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
        message: 'Failed to fetch vendors',
      },
    });
  }
});

/**
 * GET /vendors/:id
 * Get vendor by ID
 */
router.get('/:id', authorize('vendors.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const vendor = await vendorService.getVendorById(req.params.id as string, req.user.businessId);

    if (!vendor) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vendor not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vendor',
      },
    });
  }
});

/**
 * POST /vendors
 * Create a new vendor
 */
router.post('/', authorize('vendors.create'), validate(createVendorSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const vendor = await vendorService.createVendor(
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
      data: vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create vendor',
      },
    });
  }
});

/**
 * PUT /vendors/:id
 * Update vendor
 */
router.put('/:id', authorize('vendors.edit'), validate(uuidParamSchema, 'params'), validate(updateVendorSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const vendor = await vendorService.updateVendor(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Vendor not found') {
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
        message: error instanceof Error ? error.message : 'Failed to update vendor',
      },
    });
  }
});

/**
 * POST /vendors/:id/disable
 * Disable vendor
 */
router.post('/:id/disable', authorize('vendors.manage'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const vendor = await vendorService.disableVendor(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Vendor not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot disable vendor with existing purchases') {
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
        code: 'DISABLE_ERROR',
        message: 'Failed to disable vendor',
      },
    });
  }
});

/**
 * POST /vendors/:id/enable
 * Enable vendor
 */
router.post('/:id/enable', authorize('vendors.manage'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const vendor = await vendorService.enableVendor(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Vendor not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ENABLE_ERROR',
        message: 'Failed to enable vendor',
      },
    });
  }
});

export default router;
