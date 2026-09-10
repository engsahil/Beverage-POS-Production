/**
 * Phase 21: Data Management Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { importLimiter, exportLimiter } from '../middleware/rateLimiter.js';
import * as importService from '../../services/dataManagement/importService.js';
import * as exportService from '../../services/dataManagement/exportService.js';
import * as templateService from '../../services/dataManagement/templateService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==========================================
// IMPORT ROUTES
// ==========================================

/**
 * POST /api/v1/data/import/upload
 * Upload and validate import file
 */
router.post('/import/upload', importLimiter, authorize('data.import'), async (req, res) => {
  try {
    const { entityType, importMode, fileName, fileData, mimeType, idempotencyKey } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Decode base64 file
    const fileBuffer = Buffer.from(fileData, 'base64');

    const result = await importService.uploadImportFile(
      req.user.businessId,
      req.user.sub,
      entityType,
      importMode || 'CREATE_ONLY',
      fileBuffer,
      fileName,
      mimeType,
      idempotencyKey
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMPORT_UPLOAD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to upload file',
      },
    });
  }
});

/**
 * POST /api/v1/data/import/validate
 * Validate and preview import
 */
router.post('/import/validate', importLimiter, authorize('data.import'), async (req, res) => {
  try {
    const { operationId, parsedData } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const result = await importService.validateAndPreview(
      operationId,
      req.user.businessId,
      parsedData
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMPORT_VALIDATION_FAILED',
        message: error instanceof Error ? error.message : 'Validation failed',
      },
    });
  }
});

/**
 * POST /api/v1/data/import/process
 * Process confirmed import
 */
router.post('/import/process', importLimiter, authorize('data.import'), async (req, res) => {
  try {
    const { operationId } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await importService.processImport(
      operationId,
      req.user.businessId,
      req.user.sub,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMPORT_PROCESS_FAILED',
        message: error instanceof Error ? error.message : 'Import failed',
      },
    });
  }
});

/**
 * GET /api/v1/data/imports
 * List import operations
 */
router.get('/imports', authorize('data.import'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { page, limit, entityType, status } = req.query;

    const result = await importService.listImportOperations(req.user.businessId, {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      entityType: entityType as string,
      status: status as string,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list imports',
      },
    });
  }
});

/**
 * GET /api/v1/data/imports/:id
 * Get import operation details
 */
router.get('/imports/:id', authorize('data.import'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const operation = await importService.getImportOperation(req.params.id as string, req.user.businessId);

    if (!operation) {
      return res.status(404).json({
        success: false,
        error: { code: 'IMPORT_NOT_FOUND', message: 'Import operation not found' },
      });
    }

    return res.json({ success: true, data: operation });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_GET_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get import',
      },
    });
  }
});

// ==========================================
// EXPORT ROUTES
// ==========================================

/**
 * POST /api/v1/data/export
 * Export data
 */
router.post('/export', exportLimiter, authorize('data.export'), async (req, res) => {
  try {
    const { entityType, fileFormat, filters } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await exportService.exportData(
      req.user.businessId,
      req.user.sub,
      entityType,
      fileFormat || 'CSV',
      filters,
      ipAddress,
      userAgent
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Export failed',
      },
    });
  }
});

/**
 * GET /api/v1/data/exports
 * List export operations
 */
router.get('/exports', authorize('data.export'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { page, limit } = req.query;

    const result = await exportService.listExportOperations(req.user.businessId, {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list exports',
      },
    });
  }
});

// ==========================================
// TEMPLATE ROUTES
// ==========================================

/**
 * GET /api/v1/data/templates/:entityType
 * Download import template
 */
router.get('/templates/:entityType', authorize('data.import'), async (req, res) => {
  try {
    const { entityType } = req.params;
    const { format } = req.query;

    const fileFormat = (format as string)?.toUpperCase() === 'XLSX' ? 'XLSX' : 'CSV';

    const buffer = templateService.generateTemplate(entityType as any, fileFormat);
    const fileName = templateService.getTemplateFileName(entityType as any, fileFormat);

    res.setHeader('Content-Type', fileFormat === 'CSV' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TEMPLATE_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate template',
      },
    });
  }
});

export default router;
