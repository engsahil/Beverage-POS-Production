import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateCategoryInput {
  businessId: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Create a new category
 */
export async function createCategory(
  input: CreateCategoryInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check if category name already exists in this business
  const existing = await prisma.category.findFirst({
    where: {
      businessId: input.businessId,
      name: input.name,
    },
  });

  if (existing) {
    throw new Error('Category name already exists');
  }

  const category = await prisma.category.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      description: input.description,
      isActive: input.isActive ?? true,
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.CATEGORY_CREATED,
    entityType: 'category',
    entityId: category.id,
    newValues: { name: category.name, description: category.description },
    ipAddress,
    userAgent,
  });

  logger.info('Category created', { categoryId: category.id, businessId: input.businessId });

  return category;
}

/**
 * Get category by ID
 */
export async function getCategoryById(categoryId: string, businessId: string) {
  return prisma.category.findFirst({
    where: { id: categoryId, businessId },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });
}

/**
 * Get all categories for a business
 */
export async function getCategories(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  } = {}
) {
  const { page = 1, limit = 50, search, isActive } = params;

  const where: Record<string, unknown> = { businessId };
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.category.count({ where }),
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
 * Update category
 */
export async function updateCategory(
  categoryId: string,
  businessId: string,
  input: UpdateCategoryInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentCategory = await prisma.category.findFirst({
    where: { id: categoryId, businessId },
  });

  if (!currentCategory) {
    throw new Error('Category not found');
  }

  // Check if new name already exists
  if (input.name && input.name !== currentCategory.name) {
    const existing = await prisma.category.findFirst({
      where: {
        businessId,
        name: input.name,
        id: { not: categoryId },
      },
    });

    if (existing) {
      throw new Error('Category name already exists');
    }
  }

  // Track changes for audit
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentCategory as Record<string, unknown>)[key] !== value) {
      oldValues[key] = (currentCategory as Record<string, unknown>)[key];
      newValues[key] = value;
    }
  }

  const category = await prisma.category.update({
    where: { id: categoryId },
    data: input,
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (Object.keys(newValues).length > 0) {
    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.CATEGORY_UPDATED,
      entityType: 'category',
      entityId: categoryId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  return category;
}

/**
 * Disable category (soft delete)
 */
export async function disableCategory(
  categoryId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, businessId },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  if (category._count.products > 0) {
    throw new Error('Cannot disable category with active products');
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: false },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CATEGORY_DISABLED,
    entityType: 'category',
    entityId: categoryId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Enable category
 */
export async function enableCategory(
  categoryId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, businessId },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CATEGORY_ENABLED,
    entityType: 'category',
    entityId: categoryId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Delete category (only if no products reference it)
 */
export async function deleteCategory(
  categoryId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, businessId },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  if (category._count.products > 0) {
    throw new Error('Cannot delete category with products');
  }

  await prisma.category.delete({ where: { id: categoryId } });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CATEGORY_DELETED,
    entityType: 'category',
    entityId: categoryId,
    oldValues: { name: category.name },
    ipAddress,
    userAgent,
  });

  return { success: true };
}
