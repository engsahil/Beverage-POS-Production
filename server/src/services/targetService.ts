import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';

export interface CreateTargetInput {
  businessId: string;
  branchId?: string;
  name: string;
  targetType: string;
  periodType: string;
  startDate: Date;
  endDate: Date;
  targetValue: number;
  targetQuantity?: number;
  assignedUserId?: string;
  assignedBranchId?: string;
  productId?: string;
  categoryId?: string;
  notes?: string;
}

export interface UpdateTargetInput {
  name?: string;
  targetValue?: number;
  targetQuantity?: number;
  assignedUserId?: string;
  assignedBranchId?: string;
  notes?: string;
}

/**
 * Validate target type
 */
function validateTargetType(targetType: string): void {
  const validTypes = ['SALES_AMOUNT', 'SALES_QUANTITY', 'PRODUCT', 'CATEGORY', 'CASHIER', 'BRANCH'];
  if (!validTypes.includes(targetType)) {
    throw new Error('Invalid target type');
  }
}

/**
 * Validate period type
 */
function validatePeriodType(periodType: string): void {
  const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'];
  if (!validTypes.includes(periodType)) {
    throw new Error('Invalid period type');
  }
}

/**
 * Create sales target
 */
export async function createTarget(
  input: CreateTargetInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  validateTargetType(input.targetType);
  validatePeriodType(input.periodType);

  // Validate date range
  if (input.startDate >= input.endDate) {
    throw new Error('Start date must be before end date');
  }

  // Validate target value
  if (input.targetValue <= 0) {
    throw new Error('Target value must be greater than zero');
  }

  // Validate branch
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, businessId: input.businessId },
    });
    if (!branch) {
      throw new Error('Branch not found');
    }
  }

  // Validate assigned user
  if (input.assignedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: input.assignedUserId, businessId: input.businessId, isActive: true },
    });
    if (!user) {
      throw new Error('Assigned user not found or inactive');
    }
  }

  // Validate assigned branch
  if (input.assignedBranchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.assignedBranchId, businessId: input.businessId },
    });
    if (!branch) {
      throw new Error('Assigned branch not found');
    }
  }

  // Validate product
  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, businessId: input.businessId },
    });
    if (!product) {
      throw new Error('Product not found');
    }
  }

  // Validate category
  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, businessId: input.businessId },
    });
    if (!category) {
      throw new Error('Category not found');
    }
  }

  const target = await prisma.salesTarget.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      name: input.name,
      targetType: input.targetType,
      periodType: input.periodType,
      startDate: input.startDate,
      endDate: input.endDate,
      targetValue: new Decimal(input.targetValue),
      targetQuantity: input.targetQuantity,
      assignedUserId: input.assignedUserId,
      assignedBranchId: input.assignedBranchId,
      productId: input.productId,
      categoryId: input.categoryId,
      notes: input.notes,
      status: 'ACTIVE',
      createdBy: userId,
    },
    include: {
      branch: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.TARGET_CREATED,
    entityType: 'sales_target',
    entityId: target.id,
    newValues: {
      name: input.name,
      targetType: input.targetType,
      targetValue: input.targetValue,
      startDate: input.startDate.toISOString(),
      endDate: input.endDate.toISOString(),
    },
    ipAddress,
    userAgent,
  });

  return target;
}

/**
 * Update target (only ACTIVE targets can be updated)
 */
export async function updateTarget(
  targetId: string,
  businessId: string,
  input: UpdateTargetInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const target = await prisma.salesTarget.findFirst({
    where: { id: targetId, businessId },
  });

  if (!target) {
    throw new Error('Target not found');
  }

  if (target.status !== 'ACTIVE') {
    throw new Error('Only active targets can be updated');
  }

  if (input.targetValue !== undefined && input.targetValue <= 0) {
    throw new Error('Target value must be greater than zero');
  }

  const oldValues: any = {};
  const newValues: any = {};

  if (input.name !== undefined) {
    oldValues.name = target.name;
    newValues.name = input.name;
  }
  if (input.targetValue !== undefined) {
    oldValues.targetValue = target.targetValue.toString();
    newValues.targetValue = input.targetValue;
  }

  const updated = await prisma.salesTarget.update({
    where: { id: targetId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.targetValue !== undefined && { targetValue: new Decimal(input.targetValue) }),
      ...(input.targetQuantity !== undefined && { targetQuantity: input.targetQuantity }),
      ...(input.assignedUserId !== undefined && { assignedUserId: input.assignedUserId }),
      ...(input.assignedBranchId !== undefined && { assignedBranchId: input.assignedBranchId }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      branch: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.TARGET_UPDATED,
    entityType: 'sales_target',
    entityId: targetId,
    oldValues,
    newValues,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Cancel target
 */
export async function cancelTarget(
  targetId: string,
  businessId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const target = await prisma.salesTarget.findFirst({
    where: { id: targetId, businessId },
  });

  if (!target) {
    throw new Error('Target not found');
  }

  if (target.status === 'CANCELLED') {
    throw new Error('Target is already cancelled');
  }

  const updated = await prisma.salesTarget.update({
    where: { id: targetId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason: reason,
    },
    include: {
      branch: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.TARGET_CANCELLED,
    entityType: 'sales_target',
    entityId: targetId,
    oldValues: { status: target.status },
    newValues: { status: 'CANCELLED', reason },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get targets with filtering
 */
export async function getTargets(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    targetType?: string;
    periodType?: string;
    status?: string;
    assignedUserId?: string;
    assignedBranchId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    search,
    targetType,
    periodType,
    status,
    assignedUserId,
    assignedBranchId,
    startDate,
    endDate,
  } = params;

  const where: Prisma.SalesTargetWhereInput = { businessId };

  if (targetType) where.targetType = targetType;
  if (periodType) where.periodType = periodType;
  if (status) where.status = status;
  if (assignedUserId) where.assignedUserId = assignedUserId;
  if (assignedBranchId) where.assignedBranchId = assignedBranchId;

  if (startDate || endDate) {
    where.startDate = {};
    if (startDate) (where.startDate as any).gte = startDate;
    if (endDate) (where.startDate as any).lte = endDate;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [targets, total] = await Promise.all([
    prisma.salesTarget.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, username: true, fullName: true } },
        assignedBranch: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.salesTarget.count({ where }),
  ]);

  return {
    data: targets,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get target by ID
 */
export async function getTargetById(targetId: string, businessId: string) {
  return prisma.salesTarget.findFirst({
    where: { id: targetId, businessId },
    include: {
      branch: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      canceller: { select: { id: true, username: true, fullName: true } },
    },
  });
}

/**
 * Calculate target progress
 */
export async function calculateTargetProgress(targetId: string, businessId: string) {
  const target = await prisma.salesTarget.findFirst({
    where: { id: targetId, businessId },
    include: {
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  });

  if (!target) {
    throw new Error('Target not found');
  }

  // Build sales query based on target type
  const saleWhere: Prisma.SaleWhereInput = {
    businessId,
    status: 'COMPLETED',
    saleDate: {
      gte: target.startDate,
      lte: target.endDate,
    },
  };

  // Filter by assigned user if applicable
  if (target.assignedUserId) {
    saleWhere.cashierId = target.assignedUserId;
  }

  // Filter by assigned branch if applicable
  if (target.assignedBranchId) {
    saleWhere.branchId = target.assignedBranchId;
  }

  // Filter by product if applicable
  if (target.productId) {
    saleWhere.items = {
      some: { productId: target.productId },
    };
  }

  // Filter by category if applicable
  if (target.categoryId) {
    saleWhere.items = {
      some: {
        product: { categoryId: target.categoryId },
      },
    };
  }

  // Calculate achieved value
  let achievedValue = new Decimal(0);
  let achievedQuantity = 0;

  if (target.targetType === 'SALES_AMOUNT') {
    const result = await prisma.sale.aggregate({
      where: saleWhere,
      _sum: { total: true },
    });
    achievedValue = result._sum.total || new Decimal(0);
  } else if (target.targetType === 'SALES_QUANTITY' || target.targetType === 'PRODUCT') {
    const sales = await prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: {
          select: { quantity: true },
        },
      },
    });

    for (const sale of sales) {
      for (const item of sale.items) {
        achievedQuantity += Number(item.quantity);
      }
    }
    achievedValue = new Decimal(achievedQuantity);
  }

  // Calculate progress
  const targetValue = target.targetType === 'SALES_QUANTITY' || target.targetType === 'PRODUCT'
    ? new Decimal(target.targetQuantity || 0)
    : target.targetValue;

  const remaining = targetValue.minus(achievedValue);
  const percentage = targetValue.greaterThan(0)
    ? achievedValue.dividedBy(targetValue).times(100)
    : new Decimal(0);

  // Determine status
  let status = 'IN_PROGRESS';
  if (percentage.greaterThanOrEqualTo(100)) {
    status = 'ACHIEVED';
  } else if (new Date() > target.endDate) {
    status = 'EXPIRED';
  } else if (achievedValue.equals(0)) {
    status = 'NOT_STARTED';
  }

  return {
    target,
    progress: {
      targetValue,
      achievedValue,
      remaining: remaining.greaterThan(0) ? remaining : new Decimal(0),
      percentage: percentage.toNumber(),
      status,
      achievedQuantity: target.targetType === 'SALES_QUANTITY' || target.targetType === 'PRODUCT' ? achievedQuantity : undefined,
    },
  };
}
