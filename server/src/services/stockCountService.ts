import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { createStockMovement } from './inventoryService.js';
import { MOVEMENT_TYPES } from '../api/validators/schemas.js';
import { logger } from '../lib/logger.js';

export interface CreateStockCountInput {
  businessId: string;
  branchId: string;
  countDate: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    physicalQuantity: number;
    notes?: string;
  }>;
}

export interface ConfirmStockCountInput {
  stockCountId: string;
  businessId: string;
}

/**
 * Generate next stock count number
 */
async function generateCountNumber(businessId: string): Promise<string> {
  const latest = await prisma.stockCount.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { countNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.countNumber.match(/COUNT-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `COUNT-${String(next).padStart(6, '0')}`;
}

/**
 * Create a stock count (draft)
 */
export async function createStockCount(
  input: CreateStockCountInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate branch
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  // Generate count number
  const countNumber = await generateCountNumber(input.businessId);

  // Calculate system quantities and differences
  const itemsWithSystemQty = await Promise.all(
    input.items.map(async (item) => {
      const inventory = await prisma.inventory.findFirst({
        where: {
          businessId: input.businessId,
          branchId: input.branchId,
          productId: item.productId,
          variantId: item.variantId || null,
        },
      });

      const systemQuantity = inventory ? Number(inventory.currentQuantity) : 0;
      const difference = item.physicalQuantity - systemQuantity;

      return {
        ...item,
        systemQuantity,
        difference,
      };
    })
  );

  // Create stock count with items
  const stockCount = await prisma.stockCount.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      countNumber,
      countDate: new Date(input.countDate),
      status: 'DRAFT',
      notes: input.notes,
      createdBy: userId,
      items: {
        create: itemsWithSystemQty.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          systemQuantity: item.systemQuantity,
          physicalQuantity: item.physicalQuantity,
          difference: item.difference,
          notes: item.notes,
        })),
      },
    },
    include: {
      branch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.STOCK_COUNT_CREATED,
    entityType: 'stockCount',
    entityId: stockCount.id,
    newValues: {
      countNumber: stockCount.countNumber,
      branchId: input.branchId,
      itemCount: input.items.length,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Stock count created', {
    stockCountId: stockCount.id,
    countNumber: stockCount.countNumber,
    businessId: input.businessId,
    userId,
  });

  return stockCount;
}

/**
 * Confirm stock count and create adjustments
 */
export async function confirmStockCount(
  input: ConfirmStockCountInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const stockCount = await prisma.stockCount.findFirst({
    where: {
      id: input.stockCountId,
      businessId: input.businessId,
    },
    include: {
      items: true,
    },
  });

  if (!stockCount) {
    throw new Error('Stock count not found');
  }

  if (stockCount.status !== 'DRAFT') {
    throw new Error('Only draft stock counts can be confirmed');
  }

  // Confirm in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Claim the draft atomically so concurrent confirmations cannot apply the
    // same adjustment movements twice.
    const claim = await tx.stockCount.updateMany({
      where: {
        id: input.stockCountId,
        businessId: input.businessId,
        status: 'DRAFT',
      },
      data: {
        status: 'CONFIRMED',
        confirmedBy: userId,
        confirmedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      throw new Error('Only draft stock counts can be confirmed');
    }

    const updatedCount = await tx.stockCount.findUnique({
      where: { id: input.stockCountId },
    });

    if (!updatedCount) {
      throw new Error('Stock count not found');
    }

    // Create adjustments for items with differences
    for (const item of stockCount.items) {
      if (Number(item.difference) !== 0) {
        const movementType = Number(item.difference) > 0
          ? MOVEMENT_TYPES.ADJUSTMENT_IN
          : MOVEMENT_TYPES.ADJUSTMENT_OUT;

        await createStockMovement({
          businessId: input.businessId,
          branchId: stockCount.branchId,
          productId: item.productId,
          variantId: item.variantId || undefined,
          movementType,
          quantity: Number(item.difference),
          reason: `Stock count ${stockCount.countNumber}`,
          referenceType: 'stock_count',
          referenceId: stockCount.id,
          performedBy: userId,
        }, { db: tx });
      }
    }

    return updatedCount;
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.STOCK_COUNT_CONFIRMED,
    entityType: 'stockCount',
    entityId: input.stockCountId,
    newValues: {
      countNumber: stockCount.countNumber,
      status: 'CONFIRMED',
    },
    ipAddress,
    userAgent,
  });

  logger.info('Stock count confirmed', {
    stockCountId: input.stockCountId,
    countNumber: stockCount.countNumber,
    businessId: input.businessId,
    userId,
  });

  return result;
}

/**
 * Get stock count by ID
 */
export async function getStockCountById(stockCountId: string, businessId: string) {
  return prisma.stockCount.findFirst({
    where: { id: stockCountId, businessId },
    include: {
      branch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      confirmer: { select: { id: true, username: true, fullName: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });
}

/**
 * Get all stock counts for a business
 */
export async function getStockCounts(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { page = 1, limit = 20, branchId, status, startDate, endDate } = params;

  const where: any = { businessId };
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.countDate = {};
    if (startDate) where.countDate.gte = startDate;
    if (endDate) where.countDate.lte = endDate;
  }

  const [counts, total] = await Promise.all([
    prisma.stockCount.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockCount.count({ where }),
  ]);

  return {
    data: counts,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Cancel stock count
 */
export async function cancelStockCount(
  stockCountId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const stockCount = await prisma.stockCount.findFirst({
    where: { id: stockCountId, businessId },
  });

  if (!stockCount) {
    throw new Error('Stock count not found');
  }

  if (stockCount.status !== 'DRAFT') {
    throw new Error('Only draft stock counts can be cancelled');
  }

  const updated = await prisma.stockCount.update({
    where: { id: stockCountId },
    data: { status: 'CANCELLED' },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.STOCK_COUNT_CANCELLED,
    entityType: 'stockCount',
    entityId: stockCountId,
    newValues: {
      countNumber: stockCount.countNumber,
      status: 'CANCELLED',
    },
    ipAddress,
    userAgent,
  });

  return updated;
}
