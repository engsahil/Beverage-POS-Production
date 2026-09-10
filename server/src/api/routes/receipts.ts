import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uuidParamSchema } from '../validators/schemas.js';
import * as receiptService from '../../services/receiptService.js';

const router = Router();

router.use(authenticate);

/**
 * GET /receipts/:saleId
 * Get receipt data for a sale
 */
router.get('/:saleId', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const receiptData = await receiptService.generateReceiptData(
      req.params.saleId as string,
      req.user.businessId,
      false
    );

    res.status(200).json({
      success: true,
      data: receiptData,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'RECEIPT_ERROR',
        message: 'Failed to generate receipt data',
      },
    });
  }
});

/**
 * GET /receipts/:saleId/reprint
 * Get receipt data for reprint (logs as reprint)
 */
router.get('/:saleId/reprint', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const receiptData = await receiptService.generateReceiptData(
      req.params.saleId as string,
      req.user.businessId,
      true
    );

    await receiptService.logReceiptGeneration(
      req.params.saleId as string,
      req.user.businessId,
      req.user.sub,
      true,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: receiptData,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'RECEIPT_ERROR',
        message: 'Failed to generate receipt data',
      },
    });
  }
});

/**
 * GET /receipts/:saleId/short-order
 * Get short order data for a sale
 */
router.get('/:saleId/short-order', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const shortOrderData = await receiptService.generateShortOrderData(
      req.params.saleId as string,
      req.user.businessId
    );

    await receiptService.logShortOrderPrint(
      req.params.saleId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      data: shortOrderData,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SHORT_ORDER_ERROR',
        message: 'Failed to generate short order data',
      },
    });
  }
});

/**
 * POST /receipts/:saleId/pdf
 * Log PDF generation (actual PDF generation happens client-side)
 */
router.post('/:saleId/pdf', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    await receiptService.logPdfGeneration(
      req.params.saleId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: 'PDF generation logged',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PDF_LOG_ERROR',
        message: 'Failed to log PDF generation',
      },
    });
  }
});

export default router;

/**
 * GET /receipts/:saleId/html
 * Get receipt as HTML
 */
router.get('/:saleId/html', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const receiptData = await receiptService.generateReceiptData(
      req.params.saleId as string,
      req.user.businessId,
      false
    );

    const { generateReceiptHTML } = await import('../../services/receiptRenderer.js');
    const html = await generateReceiptHTML(receiptData);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'RECEIPT_ERROR',
        message: 'Failed to generate receipt HTML',
      },
    });
  }
});

/**
 * GET /receipts/:saleId/pdf
 * Get receipt as PDF
 */
router.get('/:saleId/pdf', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const receiptData = await receiptService.generateReceiptData(
      req.params.saleId as string,
      req.user.businessId,
      false
    );

    const { generateReceiptHTML, generatePDF } = await import('../../services/receiptRenderer.js');
    const html = await generateReceiptHTML(receiptData);
    const pdf = await generatePDF(html, receiptData.settings.receiptWidth);

    await receiptService.logPdfGeneration(
      req.params.saleId as string,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptData.sale.saleNumber}.pdf"`);
    res.send(pdf);
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'PDF_ERROR',
        message: 'Failed to generate receipt PDF',
      },
    });
  }
});

/**
 * GET /receipts/:saleId/short-order/html
 * Get short order as HTML
 */
router.get('/:saleId/short-order/html', authorize('sales.view'), validate(uuidParamSchema, 'params'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const shortOrderData = await receiptService.generateShortOrderData(
      req.params.saleId as string,
      req.user.businessId
    );

    const { generateShortOrderHTML } = await import('../../services/receiptRenderer.js');
    const html = generateShortOrderHTML(shortOrderData);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    if (error instanceof Error && error.message === 'Sale not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SHORT_ORDER_ERROR',
        message: 'Failed to generate short order HTML',
      },
    });
  }
});
