/**
 * Phase 20: WhatsApp API Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { whatsappLimiter } from '../middleware/rateLimiter.js';
import prisma from '../../lib/prisma.js';
import * as whatsappService from '../../services/whatsapp/whatsappService.js';
import { MetaCloudAPIProvider } from '../../services/whatsapp/metaProvider.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/whatsapp/config
 * Get WhatsApp configuration for business
 */
router.get('/config', authorize('whatsapp.view'), async (req, res) => {
  try {
    const businessId = req.user!.businessId;

    const config = await prisma.whatsAppConfig.findUnique({
      where: { businessId },
    });

    // Check if provider credentials are configured
    const hasProviderCredentials = !!(
      process.env.WHATSAPP_META_ACCESS_TOKEN &&
      (config?.providerPhoneNumberId || process.env.WHATSAPP_META_PHONE_NUMBER_ID)
    );

    return res.json({
      success: true,
      data: {
        enabled: config?.enabled || false,
        adminPhoneNumber: config?.adminPhoneNumber || null,
        provider: config?.provider || 'meta',
        providerPhoneNumberId: config?.providerPhoneNumberId || null,
        hasProviderCredentials,
        lastTestSentAt: config?.lastTestSentAt || null,
        lastTestStatus: config?.lastTestStatus || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch WhatsApp configuration' },
    });
  }
});

/**
 * PUT /api/whatsapp/config
 * Update WhatsApp configuration
 */
router.put('/config', whatsappLimiter, authorize('whatsapp.manage'), async (req, res) => {
  try {
    const businessId = req.user!.businessId;
    const { enabled, adminPhoneNumber, providerPhoneNumberId } = req.body;

    // Validate phone number format
    if (adminPhoneNumber && !adminPhoneNumber.match(/^\+92\d{10}$/)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number must be in +92 format with 10 digits' },
      });
    }

    const config = await prisma.whatsAppConfig.upsert({
      where: { businessId },
      update: {
        enabled: enabled ?? undefined,
        adminPhoneNumber: adminPhoneNumber ?? undefined,
        providerPhoneNumberId: providerPhoneNumberId ?? undefined,
      },
      create: {
        businessId,
        enabled: enabled || false,
        adminPhoneNumber: adminPhoneNumber || null,
        providerPhoneNumberId: providerPhoneNumberId || null,
        provider: 'meta',
      },
    });

    return res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to update WhatsApp configuration' },
    });
  }
});

/**
 * POST /api/whatsapp/test
 * Send test message
 */
router.post('/test', authorize('whatsapp.manage'), async (req, res) => {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.sub;

    const result = await whatsappService.sendTestMessage({ businessId, userId });

    return res.json({
      success: result.success,
      error: result.error,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to send test message' },
    });
  }
});

/**
 * POST /api/whatsapp/test-connection
 * Test WhatsApp provider connection
 */
router.post('/test-connection', authorize('whatsapp.manage'), async (req, res) => {
  try {
    const businessId = req.user!.businessId;

    const config = await prisma.whatsAppConfig.findUnique({
      where: { businessId },
    });

    if (!config?.providerPhoneNumberId && !process.env.WHATSAPP_META_PHONE_NUMBER_ID) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number ID not configured' },
      });
    }

    const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: { message: 'Access token not configured' },
      });
    }

    const provider = new MetaCloudAPIProvider({
      provider: 'meta',
      accessToken,
      phoneNumberId: config?.providerPhoneNumberId || process.env.WHATSAPP_META_PHONE_NUMBER_ID!,
    });

    const connected = await provider.testConnection();

    return res.json({
      success: true,
      data: { connected },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Connection test failed' },
    });
  }
});

/**
 * GET /api/whatsapp/messages
 * Get WhatsApp messages for business
 */
router.get('/messages', authorize('whatsapp.view'), async (req, res) => {
  try {
    const businessId = req.user!.businessId;
    const { page = '1', limit = '20', status, messageType, shiftId } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = { businessId };
    if (status) where.status = status as string;
    if (messageType) where.messageType = messageType as string;
    if (shiftId) where.shiftId = shiftId as string;

    const [messages, total] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          shift: {
            select: {
              id: true,
              shiftNumber: true,
              openingDate: true,
              closingDate: true,
            },
          },
        },
      }),
      prisma.whatsAppMessage.count({ where }),
    ]);

    return res.json({
      success: true,
      data: messages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch messages' },
    });
  }
});

/**
 * POST /api/whatsapp/messages/:id/retry
 * Retry failed message
 */
router.post('/messages/:id/retry', authorize('whatsapp.manage'), async (req, res) => {
  try {
    const messageId = req.params.id as string;
    const businessId = req.user!.businessId;
    const userId = req.user!.sub;

    await whatsappService.retryMessage({ messageId, businessId, userId });

    return res.json({
      success: true,
      message: 'Message retry initiated',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retry message';
    return res.status(400).json({
      success: false,
      error: { message },
    });
  }
});

/**
 * GET /api/whatsapp/messages/:id
 * Get message details
 */
router.get('/messages/:id', authorize('whatsapp.view'), async (req, res) => {
  try {
    const messageId = req.params.id as string;
    const businessId = req.user!.businessId;

    const message = await prisma.whatsAppMessage.findFirst({
      where: { id: messageId, businessId },
      include: {
        shift: {
          include: {
            business: true,
            branch: true,
            cashier: true,
          },
        },
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: { message: 'Message not found' },
      });
      return;
    }

    return res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch message' },
    });
  }
});

export default router;
