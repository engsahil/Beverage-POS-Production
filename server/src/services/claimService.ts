import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { createStockMovement } from './inventoryService.js';
import { MOVEMENT_TYPES } from '../api/validators/schemas.js';

export interface CreateClaimInput {
  businessId: string;
  branchId: string;
  claimType: string;
  vendorId?: string;
  purchaseId?: string;
  claimDate: Date;
  reason: string;
  description?: string;
  referenceNumber?: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    batchId?: string;
    quantity: number;
    unitValue: number;
    notes?: string;
  }>;
  idempotencyKey?: string;
}

export interface UpdateClaimInput {
  claimType?: string;
  vendorId?: string;
  purchaseId?: string;
  claimDate?: Date;
  reason?: string;
  description?: string;
  referenceNumber?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    variantId?: string;
    batchId?: string;
    quantity: number;
    unitValue: number;
    notes?: string;
  }>;
}

/**
 * Generate claim number (CLAIM-XXXXXX)
 */
async function generateClaimNumber(businessId: string): Promise<string> {
  const latest = await prisma.claim.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { claimNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.claimNumber.match(/CLAIM-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `CLAIM-${String(next).padStart(6, '0')}`;
}

/**
 * Validate claim type
 */
function validateClaimType(claimType: string): void {
  const validTypes = ['DAMAGE', 'EXPIRED', 'SHORTAGE', 'SUPPLIER', 'PRODUCT', 'OTHER'];
  if (!validTypes.includes(claimType)) {
    throw new Error('Invalid claim type');
  }
}

/**
 * Validate claim status transition
 */
function validateStatusTransition(currentStatus: string, newStatus: string): void {
  const validTransitions: Record<string, string[]> = {
    DRAFT: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['RESOLVED', 'CANCELLED'],
    REJECTED: [],
    RESOLVED: [],
    CANCELLED: [],
  };

  if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }
}

/**
 * Create claim
 */
export async function createClaim(
  input: CreateClaimInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check idempotency
  if (input.idempotencyKey) {
    const existing = await prisma.claim.findFirst({
      where: { idempotencyKey: input.idempotencyKey, businessId: input.businessId },
    });
    if (existing) {
      return existing;
    }
  }

  validateClaimType(input.claimType);

  // Validate branch
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });
  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  // Validate vendor if provided
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, businessId: input.businessId },
    });
    if (!vendor) {
      throw new Error('Vendor not found or does not belong to this business');
    }
  }

  // Validate purchase if provided
  if (input.purchaseId) {
    const purchase = await prisma.purchase.findFirst({
      where: { id: input.purchaseId, businessId: input.businessId },
    });
    if (!purchase) {
      throw new Error('Purchase not found or does not belong to this business');
    }
  }

  // Validate items
  if (!input.items || input.items.length === 0) {
    throw new Error('At least one item is required');
  }

  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new Error('Item quantity must be greater than zero');
    }
    if (item.unitValue < 0) {
      throw new Error('Item unit value cannot be negative');
    }

    // Validate product
    const product = await prisma.product.findFirst({
      where: { id: item.productId, businessId: input.businessId },
    });
    if (!product) {
      throw new Error('Product not found or does not belong to this business');
    }

    // Validate variant if provided
    if (item.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId },
      });
      if (!variant) {
        throw new Error('Variant not found for this product');
      }
    }

    // Validate batch if provided
    if (item.batchId) {
      const batch = await prisma.stockBatch.findFirst({
        where: { id: item.batchId, businessId: input.businessId, branchId: input.branchId },
      });
      if (!batch) {
        throw new Error('Batch not found or does not belong to this branch');
      }
    }
  }

  const claimNumber = await generateClaimNumber(input.businessId);

  // Calculate total amount
  let totalAmount = new Decimal(0);
  for (const item of input.items) {
    const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitValue));
    totalAmount = totalAmount.plus(lineTotal);
  }

  const claim = await prisma.$transaction(async (tx) => {
    const newClaim = await tx.claim.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        claimNumber,
        claimType: input.claimType,
        vendorId: input.vendorId,
        purchaseId: input.purchaseId,
        claimDate: input.claimDate,
        reason: input.reason,
        description: input.description,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        totalAmount,
        status: 'DRAFT',
        idempotencyKey: input.idempotencyKey,
        createdBy: userId,
      },
    });

    // Create claim items
    for (const item of input.items) {
      const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitValue));
      await tx.claimItem.create({
        data: {
          claimId: newClaim.id,
          productId: item.productId,
          variantId: item.variantId,
          batchId: item.batchId,
          quantity: new Decimal(item.quantity),
          unitValue: new Decimal(item.unitValue),
          lineTotal,
          notes: item.notes,
        },
      });
    }

    return newClaim;
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.CLAIM_CREATED,
    entityType: 'claim',
    entityId: claim.id,
    newValues: {
      claimNumber,
      claimType: input.claimType,
      totalAmount: totalAmount.toString(),
      itemCount: input.items.length,
    },
    ipAddress,
    userAgent,
  });

  return getClaimById(claim.id, input.businessId);
}

/**
 * Update claim (only DRAFT claims can be updated)
 */
export async function updateClaim(
  claimId: string,
  businessId: string,
  input: UpdateClaimInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  if (claim.status !== 'DRAFT') {
    throw new Error('Only draft claims can be updated');
  }

  if (input.claimType) {
    validateClaimType(input.claimType);
  }

  // Validate items if provided
  if (input.items) {
    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error('Item quantity must be greater than zero');
      }
      if (item.unitValue < 0) {
        throw new Error('Item unit value cannot be negative');
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Update claim
    const updatedClaim = await tx.claim.update({
      where: { id: claimId },
      data: {
        ...(input.claimType !== undefined && { claimType: input.claimType }),
        ...(input.vendorId !== undefined && { vendorId: input.vendorId }),
        ...(input.purchaseId !== undefined && { purchaseId: input.purchaseId }),
        ...(input.claimDate !== undefined && { claimDate: input.claimDate }),
        ...(input.reason !== undefined && { reason: input.reason }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.referenceNumber !== undefined && { referenceNumber: input.referenceNumber }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    // Update items if provided
    if (input.items) {
      // Delete existing items
      await tx.claimItem.deleteMany({
        where: { claimId },
      });

      // Create new items
      let totalAmount = new Decimal(0);
      for (const item of input.items) {
        const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitValue));
        totalAmount = totalAmount.plus(lineTotal);
        await tx.claimItem.create({
          data: {
            claimId,
            productId: item.productId,
            variantId: item.variantId,
            batchId: item.batchId,
            quantity: new Decimal(item.quantity),
            unitValue: new Decimal(item.unitValue),
            lineTotal,
            notes: item.notes,
          },
        });
      }

      // Update total amount
      await tx.claim.update({
        where: { id: claimId },
        data: { totalAmount },
      });
    }

    return updatedClaim;
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_UPDATED,
    entityType: 'claim',
    entityId: claimId,
    newValues: input as any,
    ipAddress,
    userAgent,
  });

  return getClaimById(updated.id, businessId);
}

/**
 * Submit claim
 */
export async function submitClaim(
  claimId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'SUBMITTED');

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'SUBMITTED',
      submittedBy: userId,
      submittedAt: new Date(),
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_SUBMITTED,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'SUBMITTED' },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Review claim
 */
export async function reviewClaim(
  claimId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'UNDER_REVIEW');

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'UNDER_REVIEW',
      reviewedBy: userId,
      reviewedAt: new Date(),
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_UNDER_REVIEW,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'UNDER_REVIEW' },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Approve claim
 */
export async function approveClaim(
  claimId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'APPROVED');

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_APPROVED,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'APPROVED' },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Reject claim
 */
export async function rejectClaim(
  claimId: string,
  businessId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'REJECTED');

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'REJECTED',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_REJECTED,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'REJECTED', reason },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Resolve claim (with optional inventory action)
 */
export async function resolveClaim(
  claimId: string,
  businessId: string,
  resolutionNotes: string,
  applyInventoryAction: boolean,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
    include: { items: true },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'RESOLVED');

  await prisma.$transaction(async (tx) => {
    // Apply inventory action if requested
    if (applyInventoryAction) {
      for (const item of claim.items) {
        const movementType =
          claim.claimType === 'DAMAGE'
            ? MOVEMENT_TYPES.DAMAGE
            : claim.claimType === 'EXPIRED'
            ? MOVEMENT_TYPES.EXPIRED
            : MOVEMENT_TYPES.ADJUSTMENT_OUT;

        // Create stock movement
        const result = await createStockMovement({
          businessId,
          branchId: claim.branchId,
          productId: item.productId,
          variantId: item.variantId || undefined,
          movementType,
          quantity: -Number(item.quantity), // negative = stock out
          reason: `Claim ${claim.claimNumber}: ${claim.reason}`,
          notes: resolutionNotes,
          referenceType: 'CLAIM',
          referenceId: claim.id,
          performedBy: userId,
        });

        // Link movement to claim item
        await tx.claimItem.update({
          where: { id: item.id },
          data: { movementId: result.movement.id },
        });
      }
    }

    // Update claim status
    await tx.claim.update({
      where: { id: claimId },
      data: {
        status: 'RESOLVED',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes,
      },
    });
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_RESOLVED,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'RESOLVED', resolutionNotes, applyInventoryAction },
    ipAddress,
    userAgent,
  });

  return getClaimById(claimId, businessId);
}

/**
 * Cancel claim
 */
export async function cancelClaim(
  claimId: string,
  businessId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, businessId },
  });

  if (!claim) {
    throw new Error('Claim not found');
  }

  validateStatusTransition(claim.status, 'CANCELLED');

  const updated = await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'CANCELLED',
      cancelledBy: userId,
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CLAIM_CANCELLED,
    entityType: 'claim',
    entityId: claimId,
    oldValues: { status: claim.status },
    newValues: { status: 'CANCELLED', reason },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get claims with filtering
 */
export async function getClaims(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    claimType?: string;
    branchId?: string;
    vendorId?: string;
    purchaseId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    createdBy?: string;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    search,
    claimType,
    branchId,
    vendorId,
    purchaseId,
    status,
    startDate,
    endDate,
    createdBy,
  } = params;

  const where: Prisma.ClaimWhereInput = { businessId };

  if (claimType) where.claimType = claimType;
  if (branchId) where.branchId = branchId;
  if (vendorId) where.vendorId = vendorId;
  if (purchaseId) where.purchaseId = purchaseId;
  if (status) where.status = status;
  if (createdBy) where.createdBy = createdBy;

  if (startDate || endDate) {
    where.claimDate = {};
    if (startDate) (where.claimDate as any).gte = startDate;
    if (endDate) (where.claimDate as any).lte = endDate;
  }

  if (search) {
    where.OR = [
      { claimNumber: { contains: search, mode: 'insensitive' } },
      { reason: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        vendor: { select: { id: true, name: true, companyName: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.claim.count({ where }),
  ]);

  return {
    data: claims,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get claim by ID
 */
export async function getClaimById(claimId: string, businessId: string) {
  return prisma.claim.findFirst({
    where: { id: claimId, businessId },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      vendor: { select: { id: true, name: true, companyName: true, phone: true } },
      purchase: { select: { id: true, purchaseNumber: true, purchaseDate: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      submitter: { select: { id: true, username: true, fullName: true } },
      reviewer: { select: { id: true, username: true, fullName: true } },
      approver: { select: { id: true, username: true, fullName: true } },
      rejector: { select: { id: true, username: true, fullName: true } },
      resolver: { select: { id: true, username: true, fullName: true } },
      canceller: { select: { id: true, username: true, fullName: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: { select: { name: true, shortCode: true } },
            },
          },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
          movement: { select: { id: true, movementType: true, quantity: true } },
        },
      },
    },
  });
}
