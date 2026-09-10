import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/schemas.js';
import * as customerService from '../../services/customerService.js';
import * as customerLedgerService from '../../services/customerLedgerService.js';
import * as customerPaymentService from '../../services/customerPaymentService.js';

const router = Router();

router.use(authenticate);

/**
 * GET /customers
 * Search customers
 */
router.get('/', authorize('customers.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { search, status, hasBalance, page, limit } = req.query as Record<string, string>;

    const result = await customerService.searchCustomers(req.user.businessId, {
      search,
      status,
      hasBalance: hasBalance === 'true' || hasBalance === '1',
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
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
        message: 'Failed to fetch customers',
      },
    });
  }
});

/**
 * GET /customers/:id
 * Get customer by ID
 */
router.get('/:id', authorize('customers.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const customer = await customerService.getCustomerById(
      req.params.id as string,
      req.user.businessId
    );

    if (!customer) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Customer not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer',
      },
    });
  }
});

/**
 * POST /customers
 * Create customer
 */
router.post('/', authorize('customers.create'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const customer = await customerService.createCustomer(
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
      data: customer,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create customer',
      },
    });
  }
});

/**
 * PUT /customers/:id
 * Update customer
 */
router.put('/:id', authorize('customers.edit'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const customer = await customerService.updateCustomer(
      req.params.id as string,
      req.user.businessId,
      req.body,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Customer not found') {
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

    res.status(400).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update customer',
      },
    });
  }
});

/**
 * GET /customers/:id/balance
 * Get customer balance
 */
router.get('/:id/balance', authorize('customers.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const balance = await customerService.getCustomerBalance(
      req.params.id as string,
      req.user.businessId
    );

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Customer not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer balance',
      },
    });
  }
});

/**
 * GET /customers/:id/ledger
 * Get customer ledger
 */
router.get('/:id/ledger', authorize('customers.view_ledger'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { startDate, endDate, page, limit } = req.query as Record<string, string>;

    const result = await customerLedgerService.getCustomerLedger(
      req.params.id as string,
      req.user.businessId,
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      }
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer ledger',
      },
    });
  }
});

/**
 * GET /customers/:id/statement
 * Get customer statement
 */
router.get('/:id/statement', authorize('customers.view_ledger'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { startDate, endDate } = req.query as Record<string, string>;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'startDate and endDate are required' },
      });
      return;
    }

    const statement = await customerLedgerService.getCustomerStatement(
      req.params.id as string,
      req.user.businessId,
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }
    );

    res.status(200).json({
      success: true,
      data: statement,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Customer not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer statement',
      },
    });
  }
});

/**
 * POST /customers/:id/payments
 * Record customer payment/recovery
 */
router.post('/:id/payments', authorize('customers.add_payment'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const payment = await customerPaymentService.createCustomerPayment(
      {
        ...req.body,
        businessId: req.user.businessId,
        customerId: req.params.id as string,
        userId: req.user.sub,
      },
      ipAddress,
      userAgent
    );

    res.status(201).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Customer not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
        return;
      }
      if (error.message.includes('Duplicate payment')) {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE', message: error.message },
        });
        return;
      }
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record payment',
      },
    });
  }
});

/**
 * GET /customers/:id/payments
 * Get customer payments
 */
router.get('/:id/payments', authorize('customers.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit } = req.query as Record<string, string>;

    const result = await customerPaymentService.getCustomerPayments(
      req.params.id as string,
      req.user.businessId,
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      }
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer payments',
      },
    });
  }
});

export default router;
