/**
 * Phase 21: Import Service
 * Orchestrates the import workflow with REAL data processing
 */

import prisma from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { createAuditLog } from '../auditService.js';
import { parseFile, validateFileSize, validateFileType } from './fileParser.js';
import { validateImportRow } from './validationService.js';
import { 
  ImportEntityType, 
  ImportMode, 
  ImportPreviewResult, 
  ImportResult,
  ImportPreviewRow,
  ImportRowError
} from './types.js';

/**
 * Step 1: Upload and validate file
 */
export async function uploadImportFile(
  businessId: string,
  userId: string,
  entityType: ImportEntityType,
  importMode: ImportMode,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  idempotencyKey?: string
) {
  // Check idempotency
  if (idempotencyKey) {
    const existing = await prisma.importOperation.findFirst({
      where: { businessId, idempotencyKey },
    });
    if (existing) {
      return { operationId: existing.id, status: existing.status };
    }
  }

  // Validate file
  validateFileSize(fileBuffer.length);
  validateFileType(mimeType, fileName);

  // Parse file
  const parsed = await parseFile(fileBuffer, mimeType, fileName);

  // Create operation record with parsed data
  const operation = await prisma.importOperation.create({
    data: {
      businessId,
      userId,
      entityType,
      fileName,
      fileSize: fileBuffer.length,
      mimeType,
      importMode,
      status: 'VALIDATING',
      totalRows: parsed.totalRows,
      parsedData: parsed as any, // Store parsed data for later processing
      idempotencyKey,
      startedAt: new Date(),
    },
  });

  logger.info('Import operation created', {
    operationId: operation.id,
    entityType,
    totalRows: parsed.totalRows,
  });

  return { operationId: operation.id, parsed };
}

/**
 * Step 2: Validate and preview
 */
export async function validateAndPreview(
  operationId: string,
  businessId: string,
  parsedData: { headers: string[]; rows: Record<string, unknown>[] }
): Promise<ImportPreviewResult> {
  const operation = await prisma.importOperation.findFirst({
    where: { id: operationId, businessId },
  });

  if (!operation) {
    throw new Error('Import operation not found');
  }

  const rows: ImportPreviewRow[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let toCreate = 0;
  let toUpdate = 0;
  let toSkip = 0;

  // Validate each row
  for (let i = 0; i < parsedData.rows.length; i++) {
    const rowNumber = i + 2; // +2 because row 1 is headers, and we're 1-indexed
    const rowData = parsedData.rows[i];

    const validation = await validateImportRow(
      operation.entityType as ImportEntityType,
      businessId,
      rowNumber,
      rowData,
      operation.importMode as ImportMode
    );

    let action: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
    
    if (!validation.isValid) {
      action = 'ERROR';
      invalidCount++;
    } else if (validation.cleanedData.existingId) {
      if (operation.importMode === 'UPDATE_EXISTING' || operation.importMode === 'CREATE_UPDATE') {
        action = 'UPDATE';
        toUpdate++;
        validCount++;
      } else {
        action = 'SKIP';
        toSkip++;
        validCount++;
      }
    } else {
      action = 'CREATE';
      toCreate++;
      validCount++;
    }

    rows.push({
      rowNumber,
      data: validation.cleanedData,
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      action,
      existingId: validation.cleanedData.existingId as string | undefined,
    });
  }

  // Update operation
  await prisma.importOperation.update({
    where: { id: operationId },
    data: {
      status: 'PREVIEW_READY',
      validRows: validCount,
      invalidRows: invalidCount,
    },
  });

  return {
    operationId,
    entityType: operation.entityType as ImportEntityType,
    importMode: operation.importMode as ImportMode,
    totalRows: parsedData.rows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    rows,
    summary: {
      toCreate,
      toUpdate,
      toSkip,
      errors: invalidCount,
    },
  };
}

/**
 * Step 3: Process import - REAL IMPLEMENTATION
 */
export async function processImport(
  operationId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ImportResult> {
  const operation = await prisma.importOperation.findFirst({
    where: { id: operationId, businessId, status: 'PREVIEW_READY' },
  });

  if (!operation) {
    throw new Error('Import operation not found or not ready');
  }

  if (!operation.parsedData) {
    throw new Error('No parsed data found for import operation');
  }

  // Update status
  await prisma.importOperation.update({
    where: { id: operationId },
    data: { status: 'PROCESSING' },
  });

  const parsedData = operation.parsedData as any;
  const rows = parsedData.rows as Record<string, unknown>[];
  const entityType = operation.entityType as ImportEntityType;
  const importMode = operation.importMode as ImportMode;

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: ImportRowError[] = [];

  // Process in a transaction for safety
  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2;
        const rowData = rows[i];

        try {
          // Re-validate to get cleaned data
          const validation = await validateImportRow(
            entityType,
            businessId,
            rowNumber,
            rowData,
            importMode
          );

          if (!validation.isValid) {
            failedCount++;
            errors.push(...validation.errors);
            continue;
          }

          const cleanedData = validation.cleanedData;
          const existingId = cleanedData.existingId as string | undefined;

          // Determine action
          if (existingId) {
            if (importMode === 'CREATE_ONLY') {
              skippedCount++;
              continue;
            }
            // Update existing
            await updateRecord(tx, entityType, existingId, cleanedData, businessId, userId);
            updatedCount++;
          } else {
            // Create new
            await createRecord(tx, entityType, cleanedData, businessId, userId);
            createdCount++;
          }
        } catch (error) {
          failedCount++;
          errors.push({
            rowNumber,
            message: error instanceof Error ? error.message : 'Failed to process row',
          });
        }
      }
    });

    // Update operation with final results
    await prisma.importOperation.update({
      where: { id: operationId },
      data: {
        status: 'COMPLETED',
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errorSummary: errors.length > 0 ? errors as any : null,
        completedAt: new Date(),
      },
    });

    // Audit log
    await createAuditLog({
      businessId,
      userId,
      action: 'DATA_IMPORTED',
      entityType: operation.entityType,
      entityId: operationId,
      newValues: {
        fileName: operation.fileName,
        totalRows: operation.totalRows,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      },
      ipAddress,
      userAgent,
    });

    logger.info('Import completed', {
      operationId,
      entityType,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
    });

    return {
      operationId,
      status: 'COMPLETED',
      totalRows: operation.totalRows || 0,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      errors,
      completedAt: new Date(),
    };
  } catch (error) {
    // Transaction failed
    await prisma.importOperation.update({
      where: { id: operationId },
      data: {
        status: 'FAILED',
        errorSummary: { message: error instanceof Error ? error.message : 'Import failed' } as any,
        completedAt: new Date(),
      },
    });

    logger.error('Import failed', { operationId, error: String(error) });
    throw error;
  }
}

/**
 * Create a new record based on entity type
 */
async function createRecord(
  tx: any,
  entityType: ImportEntityType,
  data: Record<string, unknown>,
  businessId: string,
  userId: string
): Promise<void> {
  switch (entityType) {
    case 'PRODUCT':
      await tx.product.create({
        data: {
          businessId,
          name: data.name as string,
          categoryId: data.categoryId as string,
          sku: data.sku as string | undefined,
          barcode: data.barcode as string | undefined,
          description: data.description as string | undefined,
          purchasePrice: data.purchasePrice as number,
          sellingPrice: data.sellingPrice as number,
          isActive: (data.isActive as boolean) ?? true,
          taxEnabled: (data.taxEnabled as boolean) ?? false,
          taxRate: data.taxRate as number | undefined,
          discountAllowed: (data.discountAllowed as boolean) ?? true,
          maxDiscountPercent: data.maxDiscountPercent as number | undefined,
          minStockThreshold: data.minStockThreshold as number | undefined,
          maxStockThreshold: data.maxStockThreshold as number | undefined,
          expiryTrackingEnabled: (data.expiryTrackingEnabled as boolean) ?? false,
          expiryWarningDays: data.expiryWarningDays as number | undefined,
        },
      });
      break;

    case 'CATEGORY':
      await tx.category.create({
        data: {
          businessId,
          name: data.name as string,
          description: data.description as string | undefined,
          isActive: (data.isActive as boolean) ?? true,
        },
      });
      break;

    case 'UNIT':
      await tx.unit.create({
        data: {
          businessId,
          name: data.name as string,
          shortCode: data.shortCode as string,
          isActive: (data.isActive as boolean) ?? true,
        },
      });
      break;

    case 'CUSTOMER':
      await tx.customer.create({
        data: {
          businessId,
          name: data.name as string,
          phone: data.phone as string | undefined,
          whatsapp: data.whatsapp as string | undefined,
          email: data.email as string | undefined,
          address: data.address as string | undefined,
          city: data.city as string | undefined,
          notes: data.notes as string | undefined,
          creditLimit: (data.creditLimit as number) ?? 0,
          currentBalance: 0, // NEVER overwrite balance from import
          status: (data.status as string) ?? 'ACTIVE',
          createdBy: userId,
        },
      });
      break;

    case 'VENDOR':
      await tx.vendor.create({
        data: {
          businessId,
          name: data.name as string,
          companyName: data.companyName as string | undefined,
          contactPerson: data.contactPerson as string | undefined,
          phone: data.phone as string | undefined,
          whatsapp: data.whatsapp as string | undefined,
          email: data.email as string | undefined,
          address: data.address as string | undefined,
          city: data.city as string | undefined,
          notes: data.notes as string | undefined,
          openingBalance: (data.openingBalance as number) ?? 0,
          paymentTerms: data.paymentTerms as number | undefined,
          isActive: (data.isActive as boolean) ?? true,
          createdBy: userId,
        },
      });
      break;

    case 'PRODUCT_VARIANT':
      await tx.productVariant.create({
        data: {
          productId: data.productId as string,
          unitId: data.unitId as string,
          name: data.name as string,
          quantity: data.quantity as number,
          sku: data.sku as string | undefined,
          barcode: data.barcode as string | undefined,
          purchasePrice: data.purchasePrice as number,
          sellingPrice: data.sellingPrice as number,
          isActive: (data.isActive as boolean) ?? true,
        },
      });
      break;

    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

/**
 * Update an existing record based on entity type
 */
async function updateRecord(
  tx: any,
  entityType: ImportEntityType,
  id: string,
  data: Record<string, unknown>,
  businessId: string,
  _userId: string
): Promise<void> {
  // Remove existingId from data before update
  const { existingId, ...updateData } = data;

  switch (entityType) {
    case 'PRODUCT':
      await tx.product.update({
        where: { id, businessId },
        data: {
          name: updateData.name as string | undefined,
          categoryId: updateData.categoryId as string | undefined,
          sku: updateData.sku as string | undefined,
          barcode: updateData.barcode as string | undefined,
          description: updateData.description as string | undefined,
          purchasePrice: updateData.purchasePrice as number | undefined,
          sellingPrice: updateData.sellingPrice as number | undefined,
          isActive: updateData.isActive as boolean | undefined,
          taxEnabled: updateData.taxEnabled as boolean | undefined,
          taxRate: updateData.taxRate as number | undefined,
          discountAllowed: updateData.discountAllowed as boolean | undefined,
          maxDiscountPercent: updateData.maxDiscountPercent as number | undefined,
          minStockThreshold: updateData.minStockThreshold as number | undefined,
          maxStockThreshold: updateData.maxStockThreshold as number | undefined,
          expiryTrackingEnabled: updateData.expiryTrackingEnabled as boolean | undefined,
          expiryWarningDays: updateData.expiryWarningDays as number | undefined,
        },
      });
      break;

    case 'CATEGORY':
      await tx.category.update({
        where: { id, businessId },
        data: {
          name: updateData.name as string | undefined,
          description: updateData.description as string | undefined,
          isActive: updateData.isActive as boolean | undefined,
        },
      });
      break;

    case 'UNIT':
      await tx.unit.update({
        where: { id, businessId },
        data: {
          name: updateData.name as string | undefined,
          shortCode: updateData.shortCode as string | undefined,
          isActive: updateData.isActive as boolean | undefined,
        },
      });
      break;

    case 'CUSTOMER':
      // NEVER update currentBalance from import
      const { currentBalance, ...customerUpdate } = updateData;
      await tx.customer.update({
        where: { id, businessId },
        data: {
          name: customerUpdate.name as string | undefined,
          phone: customerUpdate.phone as string | undefined,
          whatsapp: customerUpdate.whatsapp as string | undefined,
          email: customerUpdate.email as string | undefined,
          address: customerUpdate.address as string | undefined,
          city: customerUpdate.city as string | undefined,
          notes: customerUpdate.notes as string | undefined,
          creditLimit: customerUpdate.creditLimit as number | undefined,
          status: customerUpdate.status as string | undefined,
        },
      });
      break;

    case 'VENDOR':
      await tx.vendor.update({
        where: { id, businessId },
        data: {
          name: updateData.name as string | undefined,
          companyName: updateData.companyName as string | undefined,
          contactPerson: updateData.contactPerson as string | undefined,
          phone: updateData.phone as string | undefined,
          whatsapp: updateData.whatsapp as string | undefined,
          email: updateData.email as string | undefined,
          address: updateData.address as string | undefined,
          city: updateData.city as string | undefined,
          notes: updateData.notes as string | undefined,
          openingBalance: updateData.openingBalance as number | undefined,
          paymentTerms: updateData.paymentTerms as number | undefined,
          isActive: updateData.isActive as boolean | undefined,
        },
      });
      break;

    case 'PRODUCT_VARIANT':
      await tx.productVariant.update({
        where: { id },
        data: {
          productId: updateData.productId as string | undefined,
          unitId: updateData.unitId as string | undefined,
          name: updateData.name as string | undefined,
          quantity: updateData.quantity as number | undefined,
          sku: updateData.sku as string | undefined,
          barcode: updateData.barcode as string | undefined,
          purchasePrice: updateData.purchasePrice as number | undefined,
          sellingPrice: updateData.sellingPrice as number | undefined,
          isActive: updateData.isActive as boolean | undefined,
        },
      });
      break;

    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

/**
 * Get import operation
 */
export async function getImportOperation(operationId: string, businessId: string) {
  return prisma.importOperation.findFirst({
    where: { id: operationId, businessId },
    include: {
      user: {
        select: { id: true, username: true, fullName: true },
      },
    },
  });
}

/**
 * List import operations
 */
export async function listImportOperations(
  businessId: string,
  params: { page?: number; limit?: number; entityType?: string; status?: string }
) {
  const { page = 1, limit = 20, entityType, status } = params;

  const where: any = { businessId };
  if (entityType) where.entityType = entityType;
  if (status) where.status = status;

  const [operations, total] = await Promise.all([
    prisma.importOperation.findMany({
      where,
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.importOperation.count({ where }),
  ]);

  return {
    data: operations,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
