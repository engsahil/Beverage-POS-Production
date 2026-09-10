import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';

export interface CreateExpenseCategoryInput {
  businessId: string;
  name: string;
  description?: string;
}

export interface UpdateExpenseCategoryInput {
  name?: string;
  description?: string;
}

/**
 * Create expense category
 */
export async function createExpenseCategory(
  input: CreateExpenseCategoryInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check for duplicate name
  const existing = await prisma.expenseCategory.findFirst({
    where: {
      businessId: input.businessId,
      name: input.name,
    },
  });

  if (existing) {
    throw new Error('Expense category with this name already exists');
  }

  const category = await prisma.expenseCategory.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      description: input.description,
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.EXPENSE_CATEGORY_CREATED,
    entityType: 'expense_category',
    entityId: category.id,
    newValues: input as any,
    ipAddress,
    userAgent,
  });

  return category;
}

/**
 * Update expense category
 */
export async function updateExpenseCategory(
  categoryId: string,
  businessId: string,
  input: UpdateExpenseCategoryInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, businessId },
  });

  if (!category) {
    throw new Error('Expense category not found');
  }

  // Check for duplicate name if changing
  if (input.name && input.name !== category.name) {
    const existing = await prisma.expenseCategory.findFirst({
      where: {
        businessId,
        name: input.name,
        id: { not: categoryId },
      },
    });

    if (existing) {
      throw new Error('Expense category with this name already exists');
    }
  }

  const oldValues = { name: category.name, description: category.description };

  const updated = await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.EXPENSE_CATEGORY_UPDATED,
    entityType: 'expense_category',
    entityId: categoryId,
    oldValues,
    newValues: input as any,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Enable/disable expense category
 */
export async function toggleExpenseCategory(
  categoryId: string,
  businessId: string,
  isActive: boolean,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, businessId },
  });

  if (!category) {
    throw new Error('Expense category not found');
  }

  const updated = await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { isActive },
  });

  await createAuditLog({
    businessId,
    userId,
    action: isActive ? AuditActions.EXPENSE_CATEGORY_ENABLED : AuditActions.EXPENSE_CATEGORY_DISABLED,
    entityType: 'expense_category',
    entityId: categoryId,
    oldValues: { isActive: category.isActive },
    newValues: { isActive },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get expense categories
 */
export async function getExpenseCategories(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  } = {}
) {
  const { page = 1, limit = 50, search, isActive } = params;

  const where: any = { businessId };
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [categories, total] = await Promise.all([
    prisma.expenseCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: {
          select: { expenses: true },
        },
      },
    }),
    prisma.expenseCategory.count({ where }),
  ]);

  return {
    data: categories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get expense category by ID
 */
export async function getExpenseCategoryById(categoryId: string, businessId: string) {
  return prisma.expenseCategory.findFirst({
    where: { id: categoryId, businessId },
    include: {
      _count: {
        select: { expenses: true },
      },
    },
  });
}
