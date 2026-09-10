import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';

export interface CreateExpenseInput {
  businessId: string;
  branchId: string;
  categoryId: string;
  description: string;
  amount: number;
  paymentMethod: string;
  expenseDate: Date;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface UpdateExpenseInput {
  categoryId?: string;
  description?: string;
  amount?: number;
  paymentMethod?: string;
  expenseDate?: Date;
  referenceNumber?: string;
  notes?: string;
}

/**
 * Generate expense number (EXP-XXXXXX)
 */
async function generateExpenseNumber(businessId: string): Promise<string> {
  const latest = await prisma.expense.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { expenseNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.expenseNumber.match(/EXP-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `EXP-${String(next).padStart(6, '0')}`;
}

/**
 * Create expense
 */
export async function createExpense(
  input: CreateExpenseInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check idempotency
  if (input.idempotencyKey) {
    const existing = await prisma.expense.findFirst({
      where: { idempotencyKey: input.idempotencyKey, businessId: input.businessId },
    });
    if (existing) {
      return existing;
    }
  }

  // Validate category belongs to business
  const category = await prisma.expenseCategory.findFirst({
    where: { id: input.categoryId, businessId: input.businessId, isActive: true },
  });

  if (!category) {
    throw new Error('Expense category not found or inactive');
  }

  // Validate branch belongs to business
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  // Validate amount
  if (input.amount <= 0) {
    throw new Error('Expense amount must be greater than zero');
  }

  // Validate payment method
  const validMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
  if (!validMethods.includes(input.paymentMethod)) {
    throw new Error('Invalid payment method');
  }

  const expenseNumber = await generateExpenseNumber(input.businessId);

  const expense = await prisma.expense.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      expenseNumber,
      categoryId: input.categoryId,
      description: input.description,
      amount: new Decimal(input.amount),
      paymentMethod: input.paymentMethod,
      expenseDate: input.expenseDate,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      createdBy: userId,
      status: 'ACTIVE',
    },
    include: {
      category: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.EXPENSE_CREATED,
    entityType: 'expense',
    entityId: expense.id,
    newValues: {
      expenseNumber,
      categoryId: input.categoryId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      expenseDate: input.expenseDate.toISOString(),
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.EXPENSE_CREATED,
    input.businessId,
    userId,
    input.branchId
  );

  eventEmitter.emitToBranch({
    ...event,
    eventType: RealtimeEvents.EXPENSE_CREATED,
    data: {
      expenseId: expense.id,
      expenseNumber,
      amount: String(input.amount),
      categoryId: input.categoryId,
      categoryName: expense.category.name,
      description: input.description,
    },
  } as any);

  return expense;
}

/**
 * Update expense (only ACTIVE expenses can be updated)
 */
export async function updateExpense(
  expenseId: string,
  businessId: string,
  input: UpdateExpenseInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
  });

  if (!expense) {
    throw new Error('Expense not found');
  }

  if (expense.status !== 'ACTIVE') {
    throw new Error('Only active expenses can be updated');
  }

  // Validate category if changing
  if (input.categoryId) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, businessId, isActive: true },
    });
    if (!category) {
      throw new Error('Expense category not found or inactive');
    }
  }

  // Validate amount if changing
  if (input.amount !== undefined && input.amount <= 0) {
    throw new Error('Expense amount must be greater than zero');
  }

  // Validate payment method if changing
  if (input.paymentMethod) {
    const validMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
    if (!validMethods.includes(input.paymentMethod)) {
      throw new Error('Invalid payment method');
    }
  }

  const oldValues: any = {};
  const newValues: any = {};

  if (input.categoryId !== undefined) {
    oldValues.categoryId = expense.categoryId;
    newValues.categoryId = input.categoryId;
  }
  if (input.description !== undefined) {
    oldValues.description = expense.description;
    newValues.description = input.description;
  }
  if (input.amount !== undefined) {
    oldValues.amount = expense.amount.toString();
    newValues.amount = input.amount;
  }
  if (input.paymentMethod !== undefined) {
    oldValues.paymentMethod = expense.paymentMethod;
    newValues.paymentMethod = input.paymentMethod;
  }

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.amount !== undefined && { amount: new Decimal(input.amount) }),
      ...(input.paymentMethod !== undefined && { paymentMethod: input.paymentMethod }),
      ...(input.expenseDate !== undefined && { expenseDate: input.expenseDate }),
      ...(input.referenceNumber !== undefined && { referenceNumber: input.referenceNumber }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      category: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.EXPENSE_UPDATED,
    entityType: 'expense',
    entityId: expenseId,
    oldValues,
    newValues,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Cancel expense
 */
export async function cancelExpense(
  expenseId: string,
  businessId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
  });

  if (!expense) {
    throw new Error('Expense not found');
  }

  if (expense.status === 'CANCELLED') {
    throw new Error('Expense is already cancelled');
  }

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason: reason,
    },
    include: {
      category: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.EXPENSE_CANCELLED,
    entityType: 'expense',
    entityId: expenseId,
    oldValues: { status: expense.status },
    newValues: { status: 'CANCELLED', reason },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.EXPENSE_CANCELLED,
    businessId,
    userId,
    expense.branchId
  );

  eventEmitter.emitToBranch({
    ...event,
    eventType: RealtimeEvents.EXPENSE_CANCELLED,
    data: {
      expenseId,
      expenseNumber: expense.expenseNumber,
      amount: String(expense.amount),
      reason,
    },
  } as any);

  return updated;
}

/**
 * Get expenses with filtering
 */
export async function getExpenses(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    branchId?: string;
    paymentMethod?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    minAmount?: number;
    maxAmount?: number;
    createdBy?: string;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    search,
    categoryId,
    branchId,
    paymentMethod,
    status,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    createdBy,
  } = params;

  const where: Prisma.ExpenseWhereInput = { businessId };

  if (categoryId) where.categoryId = categoryId;
  if (branchId) where.branchId = branchId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (status) where.status = status;
  if (createdBy) where.createdBy = createdBy;

  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) (where.expenseDate as any).gte = startDate;
    if (endDate) (where.expenseDate as any).lte = endDate;
  }

  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {};
    if (minAmount !== undefined) (where.amount as any).gte = new Decimal(minAmount);
    if (maxAmount !== undefined) (where.amount as any).lte = new Decimal(maxAmount);
  }

  if (search) {
    where.OR = [
      { expenseNumber: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        canceller: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    data: expenses,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get expense by ID
 */
export async function getExpenseById(expenseId: string, businessId: string) {
  return prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    include: {
      category: { select: { id: true, name: true, description: true } },
      branch: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      canceller: { select: { id: true, username: true, fullName: true } },
    },
  });
}

/**
 * Get expense totals (summary)
 */
export async function getExpenseTotals(
  businessId: string,
  params: {
    branchId?: string;
    categoryId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { branchId, categoryId, startDate, endDate } = params;

  const where: Prisma.ExpenseWhereInput = {
    businessId,
    status: 'ACTIVE',
  };

  if (branchId) where.branchId = branchId;
  if (categoryId) where.categoryId = categoryId;

  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) (where.expenseDate as any).gte = startDate;
    if (endDate) (where.expenseDate as any).lte = endDate;
  }

  const result = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
    _count: true,
  });

  return {
    totalAmount: result._sum.amount || new Decimal(0),
    totalCount: result._count,
  };
}

/**
 * Get expense totals by category
 */
export async function getExpenseTotalsByCategory(
  businessId: string,
  params: {
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { branchId, startDate, endDate } = params;

  const where: Prisma.ExpenseWhereInput = {
    businessId,
    status: 'ACTIVE',
  };

  if (branchId) where.branchId = branchId;

  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) (where.expenseDate as any).gte = startDate;
    if (endDate) (where.expenseDate as any).lte = endDate;
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  const categoryTotals: Record<string, { categoryId: string; categoryName: string; total: Decimal; count: number }> = {};

  for (const expense of expenses) {
    const key = expense.categoryId;
    if (!categoryTotals[key]) {
      categoryTotals[key] = {
        categoryId: expense.categoryId,
        categoryName: expense.category.name,
        total: new Decimal(0),
        count: 0,
      };
    }
    categoryTotals[key].total = categoryTotals[key].total.plus(expense.amount);
    categoryTotals[key].count++;
  }

  return Object.values(categoryTotals).sort((a, b) => b.total.minus(a.total).toNumber());
}
