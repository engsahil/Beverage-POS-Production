import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { createStockMovement } from './inventoryService.js';
import { MOVEMENT_TYPES } from '../api/validators/schemas.js';
import { logger } from '../lib/logger.js';

export interface CreateTransferInput {
  businessId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  transferDate: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
}

export interface ReceiveTransferInput {
  transferId: string;
  businessId: string;
}

/**
 * Generate next transfer number
 */
async function generateTransferNumber(businessId: string): Promise<string> {
  const latest = await prisma.transfer.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { transferNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.transferNumber.match(/TRF-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `TRF-${String(next).padStart(6, '0')}`;
}

/**
 * Create a transfer (draft)
 */
export async function createTransfer(
  input: CreateTransferInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate source and destination branches
  const sourceBranch = await prisma.branch.findFirst({
    where: { id: input.sourceBranchId, businessId: input.businessId },
  });

  if (!sourceBranch) {
    throw new Error('Source branch not found or does not belong to this business');
  }

  const destinationBranch = await prisma.branch.findFirst({
    where: { id: input.destinationBranchId, businessId: input.businessId },
  });

  if (!destinationBranch) {
    throw new Error('Destination branch not found or does not belong to this business');
  }

  if (input.sourceBranchId === input.destinationBranchId) {
    throw new Error('Source and destination branches must be different');
  }

  // Validate all items have valid products/variants
  for (const item of input.items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, businessId: input.businessId },
    });

    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }

    if (item.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId },
      });

      if (!variant) {
        throw new Error(`Variant ${item.variantId} not found for product ${item.productId}`);
      }
    }

    if (item.quantity <= 0) {
      throw new Error('Transfer quantity must be greater than zero');
    }
  }

  // Generate transfer number
  const transferNumber = await generateTransferNumber(input.businessId);

  // Create transfer with items
  const transfer = await prisma.transfer.create({
    data: {
      businessId: input.businessId,
      transferNumber,
      sourceBranchId: input.sourceBranchId,
      destinationBranchId: input.destinationBranchId,
      transferDate: new Date(input.transferDate),
      status: 'DRAFT',
      notes: input.notes,
      createdBy: userId,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      },
    },
    include: {
      sourceBranch: { select: { id: true, name: true } },
      destinationBranch: { select: { id: true, name: true } },
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
    action: AuditActions.TRANSFER_CREATED,
    entityType: 'transfer',
    entityId: transfer.id,
    newValues: {
      transferNumber: transfer.transferNumber,
      sourceBranchId: input.sourceBranchId,
      destinationBranchId: input.destinationBranchId,
      itemCount: input.items.length,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Transfer created', {
    transferId: transfer.id,
    transferNumber: transfer.transferNumber,
    businessId: input.businessId,
    userId,
  });

  return transfer;
}

/**
 * Approve transfer (mark as in transit)
 */
export async function approveTransfer(
  transferId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, businessId },
    include: { items: true },
  });

  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (transfer.status !== 'DRAFT') {
    throw new Error('Only draft transfers can be approved');
  }

  // Approve in a transaction - deduct from source branch
  const result = await prisma.$transaction(async (tx) => {
    // Claim the draft atomically before deducting source inventory.
    const claim = await tx.transfer.updateMany({
      where: {
        id: transferId,
        businessId,
        status: 'DRAFT',
      },
      data: { status: 'IN_TRANSIT' },
    });

    if (claim.count !== 1) {
      throw new Error('Only draft transfers can be approved');
    }

    const updatedTransfer = await tx.transfer.findUnique({
      where: { id: transferId },
    });

    if (!updatedTransfer) {
      throw new Error('Transfer not found');
    }

    // Create TRANSFER_OUT movements for source branch
    for (const item of transfer.items) {
      const result = await createStockMovement({
        businessId,
        branchId: transfer.sourceBranchId,
        productId: item.productId,
        variantId: item.variantId || undefined,
        movementType: MOVEMENT_TYPES.TRANSFER_OUT,
        quantity: -Number(item.quantity), // Negative for out
        reason: `Transfer ${transfer.transferNumber}`,
        referenceType: 'transfer',
        referenceId: transfer.id,
        performedBy: userId,
      }, { db: tx });

      // Update transfer item with out movement ID
      await tx.transferItem.update({
        where: { id: item.id },
        data: { outMovementId: result.movement.id },
      });
    }

    return updatedTransfer;
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.TRANSFER_APPROVED,
    entityType: 'transfer',
    entityId: transferId,
    newValues: {
      transferNumber: transfer.transferNumber,
      status: 'IN_TRANSIT',
    },
    ipAddress,
    userAgent,
  });

  logger.info('Transfer approved', {
    transferId,
    transferNumber: transfer.transferNumber,
    businessId,
    userId,
  });

  return result;
}

/**
 * Receive transfer (mark as received)
 */
export async function receiveTransfer(
  input: ReceiveTransferInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const transfer = await prisma.transfer.findFirst({
    where: {
      id: input.transferId,
      businessId: input.businessId,
    },
    include: { items: true },
  });

  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (transfer.status !== 'IN_TRANSIT') {
    throw new Error('Only in-transit transfers can be received');
  }

  // Prevent duplicate receiving
  if (transfer.receivedBy) {
    throw new Error('This transfer has already been received');
  }

  // Receive in a transaction - add to destination branch
  const result = await prisma.$transaction(async (tx) => {
    // Claim the in-transit transfer atomically before adding destination
    // inventory. This prevents duplicate receives under concurrent retries.
    const claim = await tx.transfer.updateMany({
      where: {
        id: input.transferId,
        businessId: input.businessId,
        status: 'IN_TRANSIT',
        receivedBy: null,
      },
      data: {
        status: 'RECEIVED',
        receivedBy: userId,
        receivedAt: new Date(),
      },
    });

    if (claim.count !== 1) {
      throw new Error('Only in-transit transfers can be received');
    }

    const updatedTransfer = await tx.transfer.findUnique({
      where: { id: input.transferId },
    });

    if (!updatedTransfer) {
      throw new Error('Transfer not found');
    }

    // Create TRANSFER_IN movements for destination branch
    for (const item of transfer.items) {
      const result = await createStockMovement({
        businessId: input.businessId,
        branchId: transfer.destinationBranchId,
        productId: item.productId,
        variantId: item.variantId || undefined,
        movementType: MOVEMENT_TYPES.TRANSFER_IN,
        quantity: Number(item.quantity), // Positive for in
        reason: `Transfer ${transfer.transferNumber}`,
        referenceType: 'transfer',
        referenceId: transfer.id,
        performedBy: userId,
      }, { db: tx });

      // Update transfer item with in movement ID
      await tx.transferItem.update({
        where: { id: item.id },
        data: { inMovementId: result.movement.id },
      });
    }

    return updatedTransfer;
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.TRANSFER_RECEIVED,
    entityType: 'transfer',
    entityId: input.transferId,
    newValues: {
      transferNumber: transfer.transferNumber,
      status: 'RECEIVED',
    },
    ipAddress,
    userAgent,
  });

  logger.info('Transfer received', {
    transferId: input.transferId,
    transferNumber: transfer.transferNumber,
    businessId: input.businessId,
    userId,
  });

  return result;
}

/**
 * Cancel transfer
 */
export async function cancelTransfer(
  transferId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, businessId },
    include: { items: true },
  });

  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (transfer.status === 'RECEIVED') {
    throw new Error('Received transfers cannot be cancelled');
  }

  if (transfer.status === 'CANCELLED') {
    throw new Error('Transfer is already cancelled');
  }

  // If transfer is IN_TRANSIT, we need to reverse the stock movements
  if (transfer.status === 'IN_TRANSIT') {
    await prisma.$transaction(async (tx) => {
      // Claim the in-transit transfer before reversing stock. A second
      // cancellation therefore cannot create a second reversal movement.
      const claim = await tx.transfer.updateMany({
        where: {
          id: transferId,
          businessId,
          status: 'IN_TRANSIT',
        },
        data: { status: 'CANCELLED' },
      });

      if (claim.count !== 1) {
        throw new Error('Transfer is already cancelled or has changed status');
      }

      // Reverse the TRANSFER_OUT movements
      for (const item of transfer.items) {
        await createStockMovement({
          businessId,
          branchId: transfer.sourceBranchId,
          productId: item.productId,
          variantId: item.variantId || undefined,
          movementType: MOVEMENT_TYPES.ADJUSTMENT_IN,
          quantity: Number(item.quantity), // Return stock to source
          reason: `Transfer ${transfer.transferNumber} cancelled - stock returned`,
          referenceType: 'transfer',
          referenceId: transfer.id,
          performedBy: userId,
        }, { db: tx });
      }

    });
  } else {
    // DRAFT status - claim it atomically.
    const claim = await prisma.transfer.updateMany({
      where: {
        id: transferId,
        businessId,
        status: 'DRAFT',
      },
      data: { status: 'CANCELLED' },
    });

    if (claim.count !== 1) {
      throw new Error('Transfer is already cancelled or has changed status');
    }
  }

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.TRANSFER_CANCELLED,
    entityType: 'transfer',
    entityId: transferId,
    newValues: {
      transferNumber: transfer.transferNumber,
      status: 'CANCELLED',
      reversedMovements: transfer.status === 'IN_TRANSIT',
    },
    ipAddress,
    userAgent,
  });

  logger.info('Transfer cancelled', {
    transferId,
    transferNumber: transfer.transferNumber,
    businessId,
    userId,
    reversedMovements: transfer.status === 'IN_TRANSIT',
  });

  return await prisma.transfer.findUnique({ where: { id: transferId } });
}

/**
 * Get transfer by ID
 */
export async function getTransferById(transferId: string, businessId: string) {
  return prisma.transfer.findFirst({
    where: { id: transferId, businessId },
    include: {
      sourceBranch: { select: { id: true, name: true } },
      destinationBranch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      receiver: { select: { id: true, username: true, fullName: true } },
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
 * Get all transfers for a business
 */
export async function getTransfers(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    sourceBranchId?: string;
    destinationBranchId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    sourceBranchId,
    destinationBranchId,
    status,
    startDate,
    endDate,
  } = params;

  const where: any = { businessId };
  if (sourceBranchId) where.sourceBranchId = sourceBranchId;
  if (destinationBranchId) where.destinationBranchId = destinationBranchId;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.transferDate = {};
    if (startDate) where.transferDate.gte = startDate;
    if (endDate) where.transferDate.lte = endDate;
  }

  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      include: {
        sourceBranch: { select: { id: true, name: true } },
        destinationBranch: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transfer.count({ where }),
  ]);

  return {
    data: transfers,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
