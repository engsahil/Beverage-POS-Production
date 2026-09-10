/**
 * Phase 19: Cloud Backup Service
 * 
 * Handles backup creation, restoration, listing, and management.
 * Backups are created from PostgreSQL data and stored in cloud storage.
 */

import { promisify } from 'util';
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'zlib';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getStorageProvider } from './storage/index.js';
import { performRestore } from './backupRestore.js';
import { createAuditLog, AuditActions } from './auditService.js';

const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

// ==========================================
// Types
// ==========================================

export interface CreateBackupInput {
  businessId: string;
  userId: string;
  type: 'MANUAL' | 'SCHEDULED';
  ipAddress?: string;
  userAgent?: string;
}

export interface RestoreBackupInput {
  backupId: string;
  businessId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListBackupsParams {
  businessId: string;
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
}

// ==========================================
// API Serialization (BigInt-safe)
// ==========================================

/**
 * Convert a CloudBackup Prisma record into a JSON-safe API object.
 * Prisma BigInt fields (fileSize) cannot be serialized by JSON.stringify,
 * so conversion happens here at the API boundary. Database values are untouched.
 */
export function serializeBackup<T extends { fileSize?: bigint | null }>(backup: T) {
  return {
    ...backup,
    fileSize: backup.fileSize != null ? Number(backup.fileSize) : null,
  };
}

// ==========================================
// Backup Number Generation
// ==========================================

async function generateBackupNumber(businessId: string): Promise<string> {
  const latest = await prisma.cloudBackup.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { backupNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.backupNumber.match(/BKP-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `BKP-${String(next).padStart(6, '0')}`;
}

// ==========================================
// Data Export
// ==========================================

/**
 * Export all business data from PostgreSQL for backup
 */
async function exportBusinessData(businessId: string): Promise<object> {
  // Fetch all business data in parallel
  const [
    business,
    branches,
    users,
    roles,
    rolePermissions,
    settings,
    categories,
    units,
    products,
    productVariants,
    inventories,
    stockMovements,
    vendors,
    purchases,
    purchaseItems,
    stockAdjustments,
    stockCounts,
    stockCountItems,
    transfers,
    transferItems,
    stockBatches,
    sales,
    saleItems,
    payments,
    customers,
    customerLedger,
    customerPayments,
    expenseCategories,
    expenses,
    claims,
    claimItems,
    salesTargets,
    commissionRules,
    commissionRecords,
    cashierShifts,
    dailyRecords,
    auditLogs,
  ] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.branch.findMany({ where: { businessId } }),
    prisma.user.findMany({ where: { businessId }, select: { id: true, businessId: true, branchId: true, username: true, email: true, phone: true, fullName: true, isActive: true, lastLoginAt: true, roleId: true, createdAt: true, updatedAt: true } }),
    prisma.role.findMany({ where: { businessId } }),
    prisma.rolePermission.findMany({ where: { role: { businessId } } }),
    prisma.setting.findMany({ where: { businessId } }),
    prisma.category.findMany({ where: { businessId } }),
    prisma.unit.findMany({ where: { businessId } }),
    prisma.product.findMany({ where: { businessId } }),
    prisma.productVariant.findMany({ where: { product: { businessId } } }),
    prisma.inventory.findMany({ where: { businessId } }),
    prisma.stockMovement.findMany({ where: { businessId } }),
    prisma.vendor.findMany({ where: { businessId } }),
    prisma.purchase.findMany({ where: { businessId } }),
    prisma.purchaseItem.findMany({ where: { purchase: { businessId } } }),
    prisma.stockAdjustment.findMany({ where: { businessId } }),
    prisma.stockCount.findMany({ where: { businessId } }),
    prisma.stockCountItem.findMany({ where: { stockCount: { businessId } } }),
    prisma.transfer.findMany({ where: { businessId } }),
    prisma.transferItem.findMany({ where: { transfer: { businessId } } }),
    prisma.stockBatch.findMany({ where: { businessId } }),
    prisma.sale.findMany({ where: { businessId } }),
    prisma.saleItem.findMany({ where: { sale: { businessId } } }),
    prisma.payment.findMany({ where: { sale: { businessId } } }),
    prisma.customer.findMany({ where: { businessId } }),
    prisma.customerLedger.findMany({ where: { businessId } }),
    prisma.customerPayment.findMany({ where: { businessId } }),
    prisma.expenseCategory.findMany({ where: { businessId } }),
    prisma.expense.findMany({ where: { businessId } }),
    prisma.claim.findMany({ where: { businessId } }),
    prisma.claimItem.findMany({ where: { claim: { businessId } } }),
    prisma.salesTarget.findMany({ where: { businessId } }),
    prisma.commissionRule.findMany({ where: { businessId } }),
    prisma.commissionRecord.findMany({ where: { businessId } }),
    prisma.cashierShift.findMany({ where: { businessId } }),
    prisma.dailyRecord.findMany({ where: { businessId } }),
    prisma.auditLog.findMany({ where: { businessId } }),
  ]);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    schemaVersion: 'phase19',
    data: {
      business,
      branches,
      users,
      roles,
      rolePermissions,
      settings,
      categories,
      units,
      products,
      productVariants,
      inventories,
      stockMovements,
      vendors,
      purchases,
      purchaseItems,
      stockAdjustments,
      stockCounts,
      stockCountItems,
      transfers,
      transferItems,
      stockBatches,
      sales,
      saleItems,
      payments,
      customers,
      customerLedger,
      customerPayments,
      expenseCategories,
      expenses,
      claims,
      claimItems,
      salesTargets,
      commissionRules,
      commissionRecords,
      cashierShifts,
      dailyRecords,
      auditLogs,
    },
  };
}

// ==========================================
// Quota Management
// ==========================================

async function getOrCreateQuota(businessId: string): Promise<{ quotaBytes: bigint; usedBytes: bigint }> {
  let quota = await prisma.cloudStorageQuota.findUnique({
    where: { businessId },
  });

  if (!quota) {
    // Default quota: 1 GB
    const defaultQuotaBytes = BigInt(1073741824);
    
    quota = await prisma.cloudStorageQuota.create({
      data: {
        businessId,
        quotaBytes: defaultQuotaBytes,
        usedBytes: BigInt(0),
      },
    });
  }

  return { quotaBytes: quota.quotaBytes, usedBytes: quota.usedBytes };
}

async function updateQuotaUsage(businessId: string, sizeDelta: bigint): Promise<void> {
  await prisma.cloudStorageQuota.update({
    where: { businessId },
    data: {
      usedBytes: {
        increment: sizeDelta,
      },
    },
  });
}

export async function getStorageUsage(businessId: string) {
  const quota = await getOrCreateQuota(businessId);
  
  // Calculate actual usage from completed backups
  const result = await prisma.cloudBackup.aggregate({
    where: {
      businessId,
      status: { in: ['COMPLETED', 'VERIFIED'] },
      fileSize: { not: null },
    },
    _sum: { fileSize: true },
    _count: true,
  });

  const actualUsed = result._sum.fileSize || BigInt(0);
  
  // Sync quota with actual usage
  if (actualUsed !== quota.usedBytes) {
    await prisma.cloudStorageQuota.update({
      where: { businessId },
      data: { usedBytes: actualUsed },
    });
  }

  const quotaBytes = Number(quota.quotaBytes);
  const usedBytes = Number(actualUsed);
  const remainingBytes = quotaBytes - usedBytes;
  const usagePercentage = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;

  return {
    quotaBytes,
    usedBytes,
    remainingBytes: Math.max(0, remainingBytes),
    usagePercentage: Math.round(usagePercentage * 100) / 100,
    backupCount: result._count,
    quotaStatus: usagePercentage >= 90 ? 'CRITICAL' : usagePercentage >= 75 ? 'WARNING' : 'OK',
  };
}

// ==========================================
// Create Backup
// ==========================================

export async function createBackup(input: CreateBackupInput) {
  const { businessId, userId, type, ipAddress, userAgent } = input;

  // Validate business exists
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new Error('Business not found');
  }

  // Check quota
  const usage = await getStorageUsage(businessId);
  if (usage.remainingBytes <= 0) {
    throw new Error('Storage quota exceeded. Cannot create backup.');
  }

  const backupNumber = await generateBackupNumber(businessId);

  // Create backup record with QUEUED status
  const backup = await prisma.cloudBackup.create({
    data: {
      businessId,
      backupNumber,
      type,
      status: 'QUEUED',
      createdBy: userId,
    },
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.BACKUP_CREATED,
    entityType: 'cloud_backup',
    entityId: backup.id,
    newValues: { backupNumber, type, status: 'QUEUED' },
    ipAddress,
    userAgent,
  });

  // Process backup asynchronously (but synchronously for now since we don't have a job queue)
  try {
    await processBackup(backup.id, businessId, userId);
  } catch (error) {
    logger.error('Backup processing failed', { backupId: backup.id, error: String(error) });
  }

  // Return updated backup record (serialized: BigInt fileSize -> number)
  const completed = await prisma.cloudBackup.findUnique({ where: { id: backup.id } });
  return completed ? serializeBackup(completed) : null;
}

/**
 * Process backup: export data, compress, upload
 */
async function processBackup(backupId: string, businessId: string, userId: string): Promise<void> {
  const storage = getStorageProvider();

  try {
    // Update status to IN_PROGRESS
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: { status: 'IN_PROGRESS' },
    });

    // Export data
    logger.info('Exporting business data for backup', { backupId, businessId });
    const exportData = await exportBusinessData(businessId);

    // Serialize to JSON
    const jsonString = JSON.stringify(exportData);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');

    // Compress
    logger.info('Compressing backup data', { backupId, originalSize: jsonBuffer.length });
    const compressed = await gzip(jsonBuffer) as Buffer;

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(compressed).digest('hex');

    // Upload to storage
    const storageKey = `business/${businessId}/backups/${backupId}.json.gz`;
    logger.info('Uploading backup to storage', { backupId, key: storageKey, size: compressed.length });

    const uploadResult = await storage.upload(storageKey, compressed, 'application/gzip');

    // Update backup record
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: {
        status: 'COMPLETED',
        filePath: storageKey,
        fileSize: BigInt(uploadResult.size),
        checksum,
        completedAt: new Date(),
        metadata: {
          originalSize: jsonBuffer.length,
          compressedSize: uploadResult.size,
          compressionRatio: (jsonBuffer.length / uploadResult.size).toFixed(2),
          schemaVersion: 'phase19',
          appVersion: '1.0.0',
        },
      },
    });

    // Update quota usage
    await updateQuotaUsage(businessId, BigInt(uploadResult.size));

    logger.info('Backup completed successfully', { backupId, businessId, size: uploadResult.size });

    // Verify backup integrity
    await verifyBackupIntegrity(backupId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    logger.error('Backup processing failed', { backupId, error: errorMessage });

    // Audit log for failure
    await createAuditLog({
      businessId,
      userId,
      action: 'BACKUP_FAILED',
      entityType: 'cloud_backup',
      entityId: backupId,
      newValues: { error: errorMessage },
    });
  }
}

// ==========================================
// Verify Backup Integrity
// ==========================================

async function verifyBackupIntegrity(backupId: string): Promise<boolean> {
  const storage = getStorageProvider();

  try {
    const backup = await prisma.cloudBackup.findUnique({ where: { id: backupId } });
    if (!backup || !backup.filePath || !backup.checksum) {
      return false;
    }

    // Update status to VERIFYING
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: { status: 'VERIFYING' },
    });

    // Download and verify checksum
    const data = await storage.download(backup.filePath);
    const actualChecksum = crypto.createHash('sha256').update(data).digest('hex');

    if (actualChecksum !== backup.checksum) {
      logger.error('Backup checksum mismatch', { backupId, expected: backup.checksum, actual: actualChecksum });
      await prisma.cloudBackup.update({
        where: { id: backupId },
        data: { status: 'FAILED', errorMessage: 'Checksum verification failed' },
      });
      return false;
    }

    // Try to decompress to verify data integrity
    try {
      const decompressed = await gunzip(data) as Buffer;
      const parsed = JSON.parse(decompressed.toString('utf-8'));
      
      if (!parsed.version || !parsed.data) {
        throw new Error('Invalid backup format');
      }
    } catch (decompressError) {
      logger.error('Backup decompression failed', { backupId, error: String(decompressError) });
      await prisma.cloudBackup.update({
        where: { id: backupId },
        data: { status: 'FAILED', errorMessage: 'Backup data corrupted' },
      });
      return false;
    }

    // Mark as verified
    await prisma.cloudBackup.update({
      where: { id: backupId },
      data: { status: 'VERIFIED' },
    });

    logger.info('Backup verified successfully', { backupId });
    return true;
  } catch (error) {
    logger.error('Backup verification failed', { backupId, error: String(error) });
    return false;
  }
}

// ==========================================
// List Backups
// ==========================================

export async function listBackups(params: ListBackupsParams) {
  const { businessId, page = 1, limit = 20, status, type } = params;

  const where: any = { businessId };
  if (status) where.status = status;
  if (type) where.type = type;

  const [backups, total] = await Promise.all([
    prisma.cloudBackup.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true, fullName: true } },
        restorer: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cloudBackup.count({ where }),
  ]);

  return {
    data: backups.map(b => serializeBackup(b)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ==========================================
// Get Backup
// ==========================================

export async function getBackup(backupId: string, businessId: string) {
  const backup = await prisma.cloudBackup.findFirst({
    where: { id: backupId, businessId },
    include: {
      creator: { select: { id: true, username: true, fullName: true } },
      restorer: { select: { id: true, username: true, fullName: true } },
    },
  });

  if (!backup) {
    return null;
  }

  return serializeBackup(backup);
}

// ==========================================
// Retry Failed Backup
// ==========================================

export async function retryBackup(backupId: string, businessId: string, userId: string) {
  const backup = await prisma.cloudBackup.findFirst({
    where: { id: backupId, businessId },
  });

  if (!backup) {
    throw new Error('Backup not found');
  }

  if (backup.status !== 'FAILED') {
    throw new Error('Only failed backups can be retried');
  }

  // Reset status and reprocess
  await prisma.cloudBackup.update({
    where: { id: backupId },
    data: {
      status: 'QUEUED',
      errorMessage: null,
      filePath: null,
      fileSize: null,
      checksum: null,
      completedAt: null,
    },
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: 'BACKUP_RETRIED',
    entityType: 'cloud_backup',
    entityId: backupId,
    newValues: { backupNumber: backup.backupNumber },
  });

  // Reprocess
  try {
    await processBackup(backupId, businessId, userId);
  } catch (error) {
    logger.error('Backup retry failed', { backupId, error: String(error) });
  }

  const retried = await prisma.cloudBackup.findUnique({ where: { id: backupId } });
  return retried ? serializeBackup(retried) : null;
}

// ==========================================
// Delete Backup
// ==========================================

export async function deleteBackup(backupId: string, businessId: string, userId: string) {
  const backup = await prisma.cloudBackup.findFirst({
    where: { id: backupId, businessId },
  });

  if (!backup) {
    throw new Error('Backup not found');
  }

  if (backup.filePath) {
    try {
      const storage = getStorageProvider();
      await storage.delete(backup.filePath);

      // Update quota
      if (backup.fileSize) {
        await updateQuotaUsage(businessId, -backup.fileSize);
      }
    } catch (error) {
      logger.error('Failed to delete backup file from storage', { backupId, error: String(error) });
    }
  }

  await prisma.cloudBackup.update({
    where: { id: backupId },
    data: {
      status: 'DELETED',
      filePath: null,
      fileSize: null,
    },
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: 'BACKUP_DELETED',
    entityType: 'cloud_backup',
    entityId: backupId,
    newValues: { backupNumber: backup.backupNumber },
  });
}

// ==========================================
// Restore Backup
// ==========================================

export async function restoreBackup(input: RestoreBackupInput & { confirm?: boolean }) {
  // C3: delegate to the real restore implementation (backupRestore.ts).
  // The previous implementation only verified the archive and reported
  // success without touching the database. Restore semantics now:
  //   * requires explicit confirm === true (destructive operation)
  //   * verifies checksum + structure, then replaces the business data
  //     inside a single transaction
  //   * reports success only after a committed, completed data restore
  return performRestore({
    backupId: input.backupId,
    businessId: input.businessId,
    userId: input.userId,
    confirm: input.confirm === true,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

// ==========================================
// Storage Health Check
// ==========================================

export async function checkStorageHealth(): Promise<{ connected: boolean; provider: string; message: string }> {
  try {
    const storage = getStorageProvider();
    const connected = await storage.healthCheck();
    
    return {
      connected,
      provider: process.env.STORAGE_PROVIDER || 'local',
      message: connected ? 'Storage provider is healthy' : 'Storage provider is unavailable',
    };
  } catch (error) {
    return {
      connected: false,
      provider: process.env.STORAGE_PROVIDER || 'local',
      message: error instanceof Error ? error.message : 'Storage provider error',
    };
  }
}

// ==========================================
// Retention Policy
// ==========================================

export async function applyRetentionPolicy(businessId: string): Promise<number> {
  // Get retention settings or use defaults
  const retentionDays = 30; // Default: keep backups for 30 days
  const minBackupsToKeep = 7; // Default: always keep at least 7 backups

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Count current backups
  const totalCount = await prisma.cloudBackup.count({
    where: {
      businessId,
      status: { in: ['COMPLETED', 'VERIFIED'] },
    },
  });

  if (totalCount <= minBackupsToKeep) {
    return 0; // Don't delete if we're at minimum
  }

  // Find expired backups (older than cutoff, but keep at least minBackupsToKeep)
  const expiredBackups = await prisma.cloudBackup.findMany({
    where: {
      businessId,
      status: { in: ['COMPLETED', 'VERIFIED'] },
      createdAt: { lt: cutoffDate },
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(0, totalCount - minBackupsToKeep),
  });

  let deletedCount = 0;

  for (const backup of expiredBackups) {
    try {
      if (backup.filePath) {
        const storage = getStorageProvider();
        await storage.delete(backup.filePath);

        if (backup.fileSize) {
          await updateQuotaUsage(businessId, -backup.fileSize);
        }
      }

      await prisma.cloudBackup.update({
        where: { id: backup.id },
        data: { status: 'EXPIRED', filePath: null, fileSize: null },
      });

      deletedCount++;
    } catch (error) {
      logger.error('Failed to delete expired backup', { backupId: backup.id, error: String(error) });
    }
  }

  logger.info('Retention policy applied', { businessId, deletedCount, totalBefore: totalCount });
  return deletedCount;
}
