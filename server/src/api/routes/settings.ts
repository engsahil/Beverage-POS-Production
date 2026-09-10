/**
 * Phase 22: Settings Routes
 * RESTful API for settings management
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { sensitiveLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import * as settingsService from '../../services/settingsService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply sensitive limiter to all settings operations
// NOTE: sensitiveLimiter is applied per mutating route (not globally), so normal
// settings reads never trip the sensitive-operations rate limit.

// ==========================================
// GET ALL SETTINGS
// ==========================================

/**
 * GET /api/v1/settings
 * Get all settings for the business
 */
router.get('/', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getAllSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SETTINGS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch settings',
      },
    });
  }
});

// ==========================================
// BUSINESS PROFILE
// ==========================================

/**
 * GET /api/v1/settings/business-profile
 * Get business profile settings
 */
router.get('/business-profile', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const profile = await settingsService.getBusinessProfile(req.user.businessId);

    return res.json({ success: true, data: profile });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch business profile',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/business-profile
 * Update business profile settings
 */
router.put('/business-profile', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const profile = await settingsService.updateBusinessProfile(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: profile });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update business profile',
      },
    });
  }
});

// ==========================================
// LOGO MANAGEMENT
// ==========================================

/**
 * POST /api/v1/settings/logo
 * Upload business logo
 */
router.post('/logo', sensitiveLimiter, uploadLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { fileData, fileName, mimeType } = req.body;

    if (!fileData || !fileName || !mimeType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATA', message: 'File data, name, and MIME type are required' },
      });
    }

    const fileBuffer = Buffer.from(fileData, 'base64');
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const logoUrl = await settingsService.uploadLogo(
      req.user.businessId,
      req.user.sub,
      fileBuffer,
      fileName,
      mimeType,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: { logoUrl } });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'LOGO_UPLOAD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to upload logo',
      },
    });
  }
});

/**
 * DELETE /api/v1/settings/logo
 * Remove business logo
 */
router.delete('/logo', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    await settingsService.removeLogo(req.user.businessId, req.user.sub, ipAddress, userAgent);

    return res.json({ success: true, message: 'Logo removed successfully' });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'LOGO_REMOVE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to remove logo',
      },
    });
  }
});

// ==========================================
// RECEIPT SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/receipt
 * Get receipt settings
 */
router.get('/receipt', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getReceiptSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'RECEIPT_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch receipt settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/receipt
 * Update receipt settings
 */
router.put('/receipt', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateReceiptSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'RECEIPT_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update receipt settings',
      },
    });
  }
});

// ==========================================
// INVOICE SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/invoice
 * Get invoice settings
 */
router.get('/invoice', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getInvoiceSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INVOICE_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch invoice settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/invoice
 * Update invoice settings
 */
router.put('/invoice', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateInvoiceSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVOICE_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update invoice settings',
      },
    });
  }
});

// ==========================================
// POS SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/pos
 * Get POS settings
 */
router.get('/pos', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getPOSSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'POS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch POS settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/pos
 * Update POS settings
 */
router.put('/pos', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updatePOSSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'POS_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update POS settings',
      },
    });
  }
});

// ==========================================
// INVENTORY SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/inventory
 * Get inventory settings
 */
router.get('/inventory', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getInventorySettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INVENTORY_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch inventory settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/inventory
 * Update inventory settings
 */
router.put('/inventory', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateInventorySettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVENTORY_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update inventory settings',
      },
    });
  }
});

// ==========================================
// CUSTOMER SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/customer
 * Get customer settings
 */
router.get('/customer', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getCustomerSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CUSTOMER_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch customer settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/customer
 * Update customer settings
 */
router.put('/customer', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateCustomerSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CUSTOMER_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update customer settings',
      },
    });
  }
});

// ==========================================
// CLOUD SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/cloud
 * Get cloud/backup settings
 */
router.get('/cloud', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getCloudSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CLOUD_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch cloud settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/cloud
 * Update cloud/backup settings
 */
router.put('/cloud', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateCloudSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CLOUD_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update cloud settings',
      },
    });
  }
});

// ==========================================
// WHATSAPP SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/whatsapp
 * Get WhatsApp settings
 */
router.get('/whatsapp', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getWhatsAppSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'WHATSAPP_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch WhatsApp settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/whatsapp
 * Update WhatsApp settings
 */
router.put('/whatsapp', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updateWhatsAppSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'WHATSAPP_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update WhatsApp settings',
      },
    });
  }
});

// ==========================================
// POS OFFLINE SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/pos-offline
 * Get POS offline/sync settings
 */
router.get('/pos-offline', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getPOSOfflineSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'POS_OFFLINE_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch POS offline settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/pos-offline
 * Update POS offline/sync settings
 */
router.put('/pos-offline', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updatePOSOfflineSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'POS_OFFLINE_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update POS offline settings',
      },
    });
  }
});

// ==========================================
// POS SCANNER SETTINGS
// ==========================================

/**
 * GET /api/v1/settings/pos-scanner
 * Get POS barcode scanner settings
 */
router.get('/pos-scanner', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await settingsService.getPOSScannerSettings(req.user.businessId);

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'POS_SCANNER_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch POS scanner settings',
      },
    });
  }
});

/**
 * PUT /api/v1/settings/pos-scanner
 * Update POS barcode scanner settings
 */
router.put('/pos-scanner', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const settings = await settingsService.updatePOSScannerSettings(
      req.user.businessId,
      req.user.sub,
      req.body,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'POS_SCANNER_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update POS scanner settings',
      },
    });
  }
});

// ==========================================
// POS QUICK KEYS
// ==========================================

router.get('/pos-quick-keys', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const keys = await settingsService.getQuickKeysEnriched(req.user.businessId);
    return res.json({ success: true, data: keys });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'QUICK_KEYS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch quick keys',
      },
    });
  }
});

router.post('/pos-quick-keys', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const keys = await settingsService.createQuickKey(
      req.user.businessId, req.user.sub, req.body, ipAddress, userAgent
    );
    return res.status(201).json({ success: true, data: keys });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUICK_KEY_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create quick key',
      },
    });
  }
});

router.post('/pos-quick-keys/reset', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const keys = await settingsService.resetQuickKeys(
      req.user.businessId, req.user.sub, ipAddress, userAgent
    );
    return res.json({ success: true, data: keys });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUICK_KEYS_RESET_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reset quick keys',
      },
    });
  }
});

router.put('/pos-quick-keys/reorder', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const keys = await settingsService.reorderQuickKeys(
      req.user.businessId, req.user.sub, req.body?.ids || [], ipAddress, userAgent
    );
    return res.json({ success: true, data: keys });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUICK_KEYS_REORDER_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reorder quick keys',
      },
    });
  }
});

router.patch('/pos-quick-keys/:id', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const keys = await settingsService.updateQuickKey(
      req.user.businessId, req.user.sub, req.params.id as string, req.body, ipAddress, userAgent
    );
    return res.json({ success: true, data: keys });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUICK_KEY_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update quick key',
      },
    });
  }
});

router.delete('/pos-quick-keys/:id', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const keys = await settingsService.deleteQuickKey(
      req.user.businessId, req.user.sub, req.params.id as string, ipAddress, userAgent
    );
    return res.json({ success: true, data: keys });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'QUICK_KEY_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete quick key',
      },
    });
  }
});

// ==========================================
// POS SHORTCUTS
// ==========================================

router.get('/pos-shortcuts', authorize('settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const shortcuts = await settingsService.getShortcuts(req.user.businessId);
    return res.json({ success: true, data: shortcuts });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SHORTCUTS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch shortcuts',
      },
    });
  }
});

router.patch('/pos-shortcuts/:id', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const shortcuts = await settingsService.updateShortcut(
      req.user.businessId, req.user.sub, req.params.id as string, req.body?.key, ipAddress, userAgent
    );
    return res.json({ success: true, data: shortcuts });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SHORTCUT_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update shortcut',
      },
    });
  }
});

router.post('/pos-shortcuts/reset', sensitiveLimiter, authorize('settings.manage'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');
    const shortcuts = await settingsService.resetShortcuts(
      req.user.businessId, req.user.sub, ipAddress, userAgent
    );
    return res.json({ success: true, data: shortcuts });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SHORTCUTS_RESET_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reset shortcuts',
      },
    });
  }
});

export default router;
