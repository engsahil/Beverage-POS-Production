import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';

export interface CreateCommissionRuleInput {
  businessId: string;
  name: string;
  commissionType: string;
  percentage?: number;
  fixedAmount?: number;
  minimumAchievement?: number;
  maximumCommission?: number;
  targetBasedOnAmount?: boolean;
  productId?: string;
  categoryId?: string;
  assignedUserId?: string;
  assignedBranchId?: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}

export interface UpdateCommissionRuleInput {
  name?: string;
  percentage?: number;
  fixedAmount?: number;
  minimumAchievement?: number;
  maximumCommission?: number;
  notes?: string;
}

/**
 * Validate commission type
 */
function validateCommissionType(commissionType: string): void {
  const validTypes = ['PERCENTAGE', 'FIXED', 'TARGET_BASED', 'TIERED'];
  if (!validTypes.includes(commissionType)) {
    throw new Error('Invalid commission type');
  }
}

/**
 * Create commission rule
 */
export async function createCommissionRule(
  input: CreateCommissionRuleInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  validateCommissionType(input.commissionType);

  // Validate percentage
  if (input.commissionType === 'PERCENTAGE' || input.commissionType === 'TARGET_BASED') {
    if (!input.percentage || input.percentage <= 0 || input.percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
  }

  // Validate fixed amount
  if (input.commissionType === 'FIXED') {
    if (!input.fixedAmount || input.fixedAmount <= 0) {
      throw new Error('Fixed amount must be greater than zero');
    }
  }

  // Validate date range
  if (input.endDate && input.startDate >= input.endDate) {
    throw new Error('Start date must be before end date');
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

  const rule = await prisma.commissionRule.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      commissionType: input.commissionType,
      percentage: input.percentage !== undefined ? new Decimal(input.percentage) : null,
      fixedAmount: input.fixedAmount !== undefined ? new Decimal(input.fixedAmount) : null,
      minimumAchievement: input.minimumAchievement !== undefined ? new Decimal(input.minimumAchievement) : null,
      maximumCommission: input.maximumCommission !== undefined ? new Decimal(input.maximumCommission) : null,
      targetBasedOnAmount: input.targetBasedOnAmount || false,
      productId: input.productId,
      categoryId: input.categoryId,
      assignedUserId: input.assignedUserId,
      assignedBranchId: input.assignedBranchId,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      isActive: true,
      createdBy: userId,
    },
    include: {
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.COMMISSION_RULE_CREATED,
    entityType: 'commission_rule',
    entityId: rule.id,
    newValues: {
      name: input.name,
      commissionType: input.commissionType,
      percentage: input.percentage,
      fixedAmount: input.fixedAmount,
    },
    ipAddress,
    userAgent,
  });

  return rule;
}

/**
 * Update commission rule
 */
export async function updateCommissionRule(
  ruleId: string,
  businessId: string,
  input: UpdateCommissionRuleInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const rule = await prisma.commissionRule.findFirst({
    where: { id: ruleId, businessId },
  });

  if (!rule) {
    throw new Error('Commission rule not found');
  }

  if (input.percentage !== undefined && (input.percentage <= 0 || input.percentage > 100)) {
    throw new Error('Percentage must be between 0 and 100');
  }

  if (input.fixedAmount !== undefined && input.fixedAmount <= 0) {
    throw new Error('Fixed amount must be greater than zero');
  }

  const oldValues: any = {};
  const newValues: any = {};

  if (input.name !== undefined) {
    oldValues.name = rule.name;
    newValues.name = input.name;
  }
  if (input.percentage !== undefined) {
    oldValues.percentage = rule.percentage?.toString();
    newValues.percentage = input.percentage;
  }

  const updated = await prisma.commissionRule.update({
    where: { id: ruleId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.percentage !== undefined && { percentage: new Decimal(input.percentage) }),
      ...(input.fixedAmount !== undefined && { fixedAmount: new Decimal(input.fixedAmount) }),
      ...(input.minimumAchievement !== undefined && { minimumAchievement: new Decimal(input.minimumAchievement) }),
      ...(input.maximumCommission !== undefined && { maximumCommission: new Decimal(input.maximumCommission) }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.COMMISSION_RULE_UPDATED,
    entityType: 'commission_rule',
    entityId: ruleId,
    oldValues,
    newValues,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Toggle commission rule active status
 */
export async function toggleCommissionRule(
  ruleId: string,
  businessId: string,
  isActive: boolean,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const rule = await prisma.commissionRule.findFirst({
    where: { id: ruleId, businessId },
  });

  if (!rule) {
    throw new Error('Commission rule not found');
  }

  const updated = await prisma.commissionRule.update({
    where: { id: ruleId },
    data: { isActive },
  });

  await createAuditLog({
    businessId,
    userId,
    action: isActive ? AuditActions.COMMISSION_RULE_ENABLED : AuditActions.COMMISSION_RULE_DISABLED,
    entityType: 'commission_rule',
    entityId: ruleId,
    oldValues: { isActive: rule.isActive },
    newValues: { isActive },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get commission rules
 */
export async function getCommissionRules(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    commissionType?: string;
    isActive?: boolean;
    assignedUserId?: string;
    assignedBranchId?: string;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    search,
    commissionType,
    isActive,
    assignedUserId,
    assignedBranchId,
  } = params;

  const where: Prisma.CommissionRuleWhereInput = { businessId };

  if (commissionType) where.commissionType = commissionType;
  if (isActive !== undefined) where.isActive = isActive;
  if (assignedUserId) where.assignedUserId = assignedUserId;
  if (assignedBranchId) where.assignedBranchId = assignedBranchId;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rules, total] = await Promise.all([
    prisma.commissionRule.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, username: true, fullName: true } },
        assignedBranch: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.commissionRule.count({ where }),
  ]);

  return {
    data: rules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get commission rule by ID
 */
export async function getCommissionRuleById(ruleId: string, businessId: string) {
  return prisma.commissionRule.findFirst({
    where: { id: ruleId, businessId },
    include: {
      product: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, username: true, fullName: true } },
      assignedBranch: { select: { id: true, name: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });
}

/**
 * Calculate commission for a user and period
 */
export async function calculateCommission(
  businessId: string,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  calculatedBy: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Find active commission rules for this user
  const rules = await prisma.commissionRule.findMany({
    where: {
      businessId,
      isActive: true,
      startDate: { lte: periodEnd },
      AND: [
        {
          OR: [
            { endDate: null },
            { endDate: { gte: periodStart } },
          ],
        },
        {
          OR: [
            { assignedUserId: userId },
            { assignedUserId: null },
          ],
        },
      ],
    },
  });

  if (rules.length === 0) {
    throw new Error('No active commission rules found for this user');
  }

  // Get user's sales in the period
  const sales = await prisma.sale.findMany({
    where: {
      businessId,
      cashierId: userId,
      status: 'COMPLETED',
      saleDate: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      items: {
        include: {
          product: { select: { categoryId: true } },
        },
      },
    },
  });

  let totalCommission = new Decimal(0);
  const commissionRecords: any[] = [];

  for (const rule of rules) {
    // Filter sales based on rule criteria
    let eligibleSales = sales;

    if (rule.assignedBranchId) {
      eligibleSales = eligibleSales.filter(s => s.branchId === rule.assignedBranchId);
    }

    if (rule.productId) {
      eligibleSales = eligibleSales.filter(s =>
        s.items.some(item => item.productId === rule.productId)
      );
    }

    if (rule.categoryId) {
      eligibleSales = eligibleSales.filter(s =>
        s.items.some(item => item.product.categoryId === rule.categoryId)
      );
    }

    // Calculate eligible sales amount
    const eligibleSalesAmount = eligibleSales.reduce(
      (sum, sale) => sum.plus(sale.total),
      new Decimal(0)
    );

    // Check minimum achievement
    if (rule.minimumAchievement && eligibleSalesAmount.lessThan(rule.minimumAchievement)) {
      continue;
    }

    // Calculate commission based on type
    let commissionAmount = new Decimal(0);
    let commissionRate = new Decimal(0);

    if (rule.commissionType === 'PERCENTAGE' && rule.percentage) {
      commissionRate = rule.percentage;
      commissionAmount = eligibleSalesAmount.times(rule.percentage).dividedBy(100);
    } else if (rule.commissionType === 'FIXED' && rule.fixedAmount) {
      commissionAmount = rule.fixedAmount;
      commissionRate = new Decimal(0);
    } else if (rule.commissionType === 'TARGET_BASED' && rule.percentage) {
      // Find target for this user
      const target = await prisma.salesTarget.findFirst({
        where: {
          businessId,
          assignedUserId: userId,
          status: 'ACTIVE',
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
      });

      if (target && eligibleSalesAmount.greaterThanOrEqualTo(target.targetValue)) {
        commissionRate = rule.percentage;
        commissionAmount = eligibleSalesAmount.times(rule.percentage).dividedBy(100);
      }
    }

    // Apply maximum commission cap
    if (rule.maximumCommission && commissionAmount.greaterThan(rule.maximumCommission)) {
      commissionAmount = rule.maximumCommission;
    }

    if (commissionAmount.greaterThan(0)) {
      const record = await prisma.commissionRecord.create({
        data: {
          businessId,
          branchId: rule.assignedBranchId,
          userId,
          commissionRuleId: rule.id,
          periodStart,
          periodEnd,
          eligibleSalesAmount,
          achievementValue: eligibleSalesAmount,
          commissionRate,
          commissionAmount,
          status: 'CALCULATED',
          calculatedBy,
          calculatedAt: new Date(),
        },
      });

      totalCommission = totalCommission.plus(commissionAmount);
      commissionRecords.push(record);

      await createAuditLog({
        businessId,
        userId: calculatedBy,
        action: AuditActions.COMMISSION_CALCULATED,
        entityType: 'commission_record',
        entityId: record.id,
        newValues: {
          userId,
          commissionRuleId: rule.id,
          eligibleSalesAmount: eligibleSalesAmount.toString(),
          commissionAmount: commissionAmount.toString(),
        },
        ipAddress,
        userAgent,
      });
    }
  }

  return {
    totalCommission,
    records: commissionRecords,
  };
}

/**
 * Approve commission
 */
export async function approveCommission(
  recordId: string,
  businessId: string,
  approvedBy: string,
  ipAddress?: string,
  userAgent?: string
) {
  const record = await prisma.commissionRecord.findFirst({
    where: { id: recordId, businessId },
  });

  if (!record) {
    throw new Error('Commission record not found');
  }

  if (record.status !== 'CALCULATED' && record.status !== 'PENDING_APPROVAL') {
    throw new Error('Commission cannot be approved in current status');
  }

  const updated = await prisma.commissionRecord.update({
    where: { id: recordId },
    data: {
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date(),
    },
  });

  await createAuditLog({
    businessId,
    userId: approvedBy,
    action: AuditActions.COMMISSION_APPROVED,
    entityType: 'commission_record',
    entityId: recordId,
    oldValues: { status: record.status },
    newValues: { status: 'APPROVED' },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Reject commission
 */
export async function rejectCommission(
  recordId: string,
  businessId: string,
  reason: string,
  rejectedBy: string,
  ipAddress?: string,
  userAgent?: string
) {
  const record = await prisma.commissionRecord.findFirst({
    where: { id: recordId, businessId },
  });

  if (!record) {
    throw new Error('Commission record not found');
  }

  if (record.status !== 'CALCULATED' && record.status !== 'PENDING_APPROVAL') {
    throw new Error('Commission cannot be rejected in current status');
  }

  const updated = await prisma.commissionRecord.update({
    where: { id: recordId },
    data: {
      status: 'REJECTED',
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  await createAuditLog({
    businessId,
    userId: rejectedBy,
    action: AuditActions.COMMISSION_REJECTED,
    entityType: 'commission_record',
    entityId: recordId,
    oldValues: { status: record.status },
    newValues: { status: 'REJECTED', reason },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Mark commission as paid
 */
export async function markCommissionPaid(
  recordId: string,
  businessId: string,
  paymentReference: string,
  paidBy: string,
  ipAddress?: string,
  userAgent?: string
) {
  const record = await prisma.commissionRecord.findFirst({
    where: { id: recordId, businessId },
  });

  if (!record) {
    throw new Error('Commission record not found');
  }

  if (record.status !== 'APPROVED') {
    throw new Error('Only approved commissions can be marked as paid');
  }

  const updated = await prisma.commissionRecord.update({
    where: { id: recordId },
    data: {
      status: 'PAID',
      paidBy,
      paidAt: new Date(),
      paymentReference,
    },
  });

  await createAuditLog({
    businessId,
    userId: paidBy,
    action: AuditActions.COMMISSION_PAID,
    entityType: 'commission_record',
    entityId: recordId,
    oldValues: { status: record.status },
    newValues: { status: 'PAID', paymentReference },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get commission records
 */
export async function getCommissionRecords(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    userId?: string;
    status?: string;
    periodStart?: Date;
    periodEnd?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    userId,
    status,
    periodStart,
    periodEnd,
  } = params;

  const where: Prisma.CommissionRecordWhereInput = { businessId };

  if (userId) where.userId = userId;
  if (status) where.status = status;

  if (periodStart || periodEnd) {
    where.periodStart = {};
    if (periodStart) (where.periodStart as any).gte = periodStart;
    if (periodEnd) (where.periodStart as any).lte = periodEnd;
  }

  const [records, total] = await Promise.all([
    prisma.commissionRecord.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
        commissionRule: { select: { id: true, name: true, commissionType: true } },
        salesTarget: { select: { id: true, name: true } },
        calculator: { select: { id: true, username: true, fullName: true } },
        approver: { select: { id: true, username: true, fullName: true } },
        rejector: { select: { id: true, username: true, fullName: true } },
        payer: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.commissionRecord.count({ where }),
  ]);

  return {
    data: records,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get commission record by ID
 */
export async function getCommissionRecordById(recordId: string, businessId: string) {
  return prisma.commissionRecord.findFirst({
    where: { id: recordId, businessId },
    include: {
      user: { select: { id: true, username: true, fullName: true } },
      commissionRule: { select: { id: true, name: true, commissionType: true } },
      salesTarget: { select: { id: true, name: true } },
      calculator: { select: { id: true, username: true, fullName: true } },
      approver: { select: { id: true, username: true, fullName: true } },
      rejector: { select: { id: true, username: true, fullName: true } },
      payer: { select: { id: true, username: true, fullName: true } },
      canceller: { select: { id: true, username: true, fullName: true } },
    },
  });
}
