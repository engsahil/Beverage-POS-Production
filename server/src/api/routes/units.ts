import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createUnitSchema, updateUnitSchema, uuidParamSchema } from '../validators/schemas.js';
import * as unitService from '../../services/unitService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /units
 * Get all units for the business
 */
router.get('/', authorize('products.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit, search, isActive } = req.query;

    const result = await unitService.getUnits(req.user.businessId, {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      search: search as string,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch units',
      },
    });
  }
});

/**
 * GET /units/:id
 * Get unit by ID
 */
router.get('/:id', authorize('products.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const unit = await unitService.getUnitById(req.params.id as string, req.user.businessId);

    if (!unit) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Unit not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: unit,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch unit',
      },
    });
  }
});

/**
 * POST /units
 * Create a new unit
 */
router.post('/', authorize('products.create'), validate(createUnitSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const unit = await unitService.createUnit(
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
      data: unit,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already exists'))) {
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
        message: 'Failed to create unit',
      },
    });
  }
});

/**
 * PUT /units/:id
 * Update unit
 */
router.put('/:id', authorize('products.edit'), validate(uuidParamSchema, 'params'), validate(updateUnitSchema), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const unit = await unitService.updateUnit(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: unit,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update unit',
      },
    });
  }
});

/**
 * POST /units/:id/disable
 * Disable unit
 */
router.post('/:id/disable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const unit = await unitService.disableUnit(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: unit,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unit not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message === 'Cannot disable unit with active product variants') {
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
        message: 'Failed to disable unit',
      },
    });
  }
});

/**
 * POST /units/:id/enable
 * Enable unit
 */
router.post('/:id/enable', authorize('products.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const unit = await unitService.enableUnit(
      req.params.id as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: unit,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unit not found') {
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
        message: 'Failed to enable unit',
      },
    });
  }
});

export default router;
