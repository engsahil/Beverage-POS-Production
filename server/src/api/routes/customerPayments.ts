import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as customerPaymentService from '../../services/customerPaymentService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /customer-payments
 * List recent customer payments across all customers
 */
router.get('/', authorize('customers.view_ledger'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { page, limit } = req.query as Record<string, string>;

    const result = await customerPaymentService.listCustomerPayments(req.user.businessId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
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
        message: 'Failed to fetch customer payments',
      },
    });
  }
});

/**
 * POST /customer-payments
 * Record a payment from a customer (reduces outstanding balance)
 */
router.post('/', authorize('customers.add_payment'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { customerId, amount, paymentMethod, paymentDate, referenceNumber, notes, idempotencyKey } = req.body;

    if (!customerId || amount === undefined || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'customerId, amount and paymentMethod are required',
        },
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const payment = await customerPaymentService.createCustomerPayment(
      {
        businessId: req.user.businessId,
        customerId,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentMethod,
        amount: Number(amount),
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
        idempotencyKey: idempotencyKey || undefined,
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
    res.status(400).json({
      success: false,
      error: {
        code: 'PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record payment',
      },
    });
  }
});

export default router;
