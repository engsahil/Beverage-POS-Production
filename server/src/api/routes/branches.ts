import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import prisma from '../../lib/prisma.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /branches
 * List active branches for the current business (reference data for
 * transfers, stock counts, opening stock and filters).
 */
router.get('/', authorize('branches.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const branches = await prisma.branch.findMany({
      where: { businessId: req.user.businessId, isActive: true },
      select: { id: true, name: true, code: true, address: true, phone: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: branches,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch branches',
      },
    });
  }
});

export default router;
