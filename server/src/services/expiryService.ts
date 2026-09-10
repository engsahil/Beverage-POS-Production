import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export type ExpiryStatus = 'NOT_TRACKED' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

export interface CreateBatchInput {
  businessId: string;
  branchId: string;
  productId: string;
  variantId?: string;
  batchNumber?: string;
  quantity: number;
  receivedDate: string;
  expiryDate?: string;
  manufacturingDate?: string;
  purchaseId?: string;
}

/**
 * Calculate expiry status for a batch
 */
export function calculateExpiryStatus(
  expiryDate: Date | null | undefined,
  expiryWarningDays: number = 30
): ExpiryStatus {
  if (!expiryDate) {
    return 'NOT_TRACKED';
  }

  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 0) {
    return 'EXPIRED';
  } else if (diffDays <= expiryWarningDays) {
    return 'EXPIRING_SOON';
  } else {
    return 'VALID';
  }
}

/**
 * Create a stock batch
 */
export async function createBatch(
  input: CreateBatchInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate product
  const product = await prisma.product.findFirst({
    where: { id: input.productId, businessId: input.businessId },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Validate branch
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found');
  }

  // If variant specified, validate it
  if (input.variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: input.variantId, productId: input.productId },
    });

    if (!variant) {
      throw new Error('Variant not found for this product');
    }
  }

  // Determine expiry status
  const expiryWarningDays = product.expiryWarningDays || 30;
  const status = calculateExpiryStatus(
    input.expiryDate ? new Date(input.expiryDate) : null,
    expiryWarningDays
  );

  const batch = await prisma.stockBatch.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      productId: input.productId,
      variantId: input.variantId,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      receivedDate: new Date(input.receivedDate),
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      manufacturingDate: input.manufacturingDate ? new Date(input.manufacturingDate) : null,
      purchaseId: input.purchaseId,
      status,
    },
    include: {
      branch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.BATCH_CREATED,
    entityType: 'stockBatch',
    entityId: batch.id,
    newValues: {
      batchNumber: batch.batchNumber,
      productId: input.productId,
      quantity: input.quantity,
      expiryDate: input.expiryDate,
      status,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Stock batch created', {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    businessId: input.businessId,
    userId,
  });

  return batch;
}

/**
 * Update all batch expiry statuses for a business
 * This should be run as a daily job
 */
export async function refreshExpiryStatuses(
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const batches = await prisma.stockBatch.findMany({
    where: {
      businessId,
      quantity: { gt: 0 },
      expiryDate: { not: null },
    },
    include: {
      product: { select: { expiryWarningDays: true } },
    },
  });

  let updatedCount = 0;
  const changes: Array<{ batchId: string; oldStatus: string; newStatus: string }> = [];

  for (const batch of batches) {
    const warningDays = batch.product.expiryWarningDays || 30;
    const newStatus = calculateExpiryStatus(batch.expiryDate, warningDays);

    if (batch.status !== newStatus) {
      await prisma.stockBatch.update({
        where: { id: batch.id },
        data: { status: newStatus },
      });

      changes.push({
        batchId: batch.id,
        oldStatus: batch.status,
        newStatus,
      });

      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.EXPIRY_PROCESSED,
      entityType: 'stockBatch',
      entityId: 'batch-refresh',
      newValues: {
        updatedCount,
        changes,
      },
      ipAddress,
      userAgent,
    });

    logger.info('Expiry statuses refreshed', {
      businessId,
      updatedCount,
      userId,
    });
  }

  return { updatedCount, changes };
}

/**
 * Get expiring/expired stock batches
 */
export async function getExpiringStock(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    status?: ExpiryStatus;
    productId?: string;
  } = {}
) {
  const { page = 1, limit = 50, branchId, status, productId } = params;

  const where: any = {
    businessId,
    quantity: { gt: 0 },
    expiryDate: { not: null },
  };

  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (productId) where.productId = productId;

  const [batches, total] = await Promise.all([
    prisma.stockBatch.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true, expiryWarningDays: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { expiryDate: 'asc' }, // Earliest expiry first (FEFO order)
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockBatch.count({ where }),
  ]);

  return {
    data: batches,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get FEFO (First Expire First Out) order for a product
 * This tells the POS which batch to sell first
 */
export async function getFEFOBatches(
  businessId: string,
  branchId: string,
  productId: string,
  variantId?: string
) {
  const batches = await prisma.stockBatch.findMany({
    where: {
      businessId,
      branchId,
      productId,
      variantId: variantId || null,
      quantity: { gt: 0 },
      status: { not: 'EXPIRED' }, // Don't include expired batches
      expiryDate: { not: null },
    },
    orderBy: { expiryDate: 'asc' }, // Earliest expiry first
    include: {
      product: { select: { name: true } },
      variant: { select: { name: true } },
    },
  });

  return batches;
}

/**
 * Deduct stock from FEFO batch (sell from oldest expiry first)
 */
export async function deductFromFEFO(
  businessId: string,
  branchId: string,
  productId: string,
  variantId: string | undefined,
  quantity: number,
  _movementId?: string
) {
  const batches = await getFEFOBatches(businessId, branchId, productId, variantId);

  let remaining = quantity;
  const deductions: Array<{ batchId: string; quantity: number }> = [];

  for (const batch of batches) {
    if (remaining <= 0) break;

    const batchQty = Number(batch.quantity);
    const deduct = Math.min(batchQty, remaining);

    deductions.push({ batchId: batch.id, quantity: deduct });
    remaining -= deduct;
  }

  // Apply deductions in a transaction
  if (deductions.length > 0) {
    await prisma.$transaction(
      deductions.map((d) =>
        prisma.stockBatch.update({
          where: { id: d.batchId },
          data: { quantity: { decrement: d.quantity } },
        })
      )
    );
  }

  return {
    deducted: deductions,
    fulfilled: quantity - remaining,
    shortfall: remaining,
  };
}

/**
 * Get batch by ID
 */
export async function getBatchById(batchId: string, businessId: string) {
  return prisma.stockBatch.findFirst({
    where: { id: batchId, businessId },
    include: {
      branch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true, expiryWarningDays: true } },
      variant: { select: { id: true, name: true, sku: true } },
      purchase: { select: { id: true, purchaseNumber: true } },
    },
  });
}

/**
 * Get all batches for a business
 */
export async function getBatches(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    productId?: string;
    variantId?: string;
    status?: string;
    hasExpiry?: boolean;
  } = {}
) {
  const { page = 1, limit = 50, branchId, productId, variantId, status, hasExpiry } = params;

  const where: any = { businessId };
  if (branchId) where.branchId = branchId;
  if (productId) where.productId = productId;
  if (variantId) where.variantId = variantId;
  if (status) where.status = status;
  if (hasExpiry !== undefined) {
    if (hasExpiry) {
      where.expiryDate = { not: null };
    } else {
      where.expiryDate = null;
    }
  }

  const [batches, total] = await Promise.all([
    prisma.stockBatch.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
      },
      orderBy: { expiryDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockBatch.count({ where }),
  ]);

  return {
    data: batches,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get expiry summary for a business
 */
export async function getExpirySummary(businessId: string, branchId?: string) {
  const where: any = {
    businessId,
    quantity: { gt: 0 },
    expiryDate: { not: null },
  };

  if (branchId) where.branchId = branchId;

  const [valid, expiringSoon, expired, total] = await Promise.all([
    prisma.stockBatch.count({ where: { ...where, status: 'VALID' } }),
    prisma.stockBatch.count({ where: { ...where, status: 'EXPIRING_SOON' } }),
    prisma.stockBatch.count({ where: { ...where, status: 'EXPIRED' } }),
    prisma.stockBatch.count({ where }),
  ]);

  return {
    valid,
    expiringSoon,
    expired,
    total,
  };
}

/**
 * Update batch quantity (for adjustments)
 */
export async function updateBatchQuantity(
  batchId: string,
  businessId: string,
  quantityChange: number,
  userId: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
) {
  const batch = await prisma.stockBatch.findFirst({
    where: { id: batchId, businessId },
  });

  if (!batch) {
    throw new Error('Batch not found');
  }

  const newQuantity = Number(batch.quantity) + quantityChange;

  if (newQuantity < 0) {
    throw new Error('Batch quantity cannot be negative');
  }

  const updated = await prisma.stockBatch.update({
    where: { id: batchId },
    data: { quantity: newQuantity },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.BATCH_UPDATED,
    entityType: 'stockBatch',
    entityId: batchId,
    oldValues: { quantity: Number(batch.quantity) },
    newValues: { quantity: newQuantity, reason },
    ipAddress,
    userAgent,
  });

  return updated;
}
