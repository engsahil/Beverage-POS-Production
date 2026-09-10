import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateUnitInput {
  businessId: string;
  name: string;
  shortCode: string;
  isActive?: boolean;
}

export interface UpdateUnitInput {
  name?: string;
  shortCode?: string;
  isActive?: boolean;
}

/**
 * Create a new unit
 */
export async function createUnit(
  input: CreateUnitInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check if unit name already exists in this business
  const existingName = await prisma.unit.findFirst({
    where: {
      businessId: input.businessId,
      name: input.name,
    },
  });

  if (existingName) {
    throw new Error('Unit name already exists');
  }

  // Check if short code already exists in this business
  const existingCode = await prisma.unit.findFirst({
    where: {
      businessId: input.businessId,
      shortCode: input.shortCode,
    },
  });

  if (existingCode) {
    throw new Error('Unit short code already exists');
  }

  const unit = await prisma.unit.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      shortCode: input.shortCode,
      isActive: input.isActive ?? true,
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.UNIT_CREATED,
    entityType: 'unit',
    entityId: unit.id,
    newValues: { name: unit.name, shortCode: unit.shortCode },
    ipAddress,
    userAgent,
  });

  logger.info('Unit created', { unitId: unit.id, businessId: input.businessId });

  return unit;
}

/**
 * Get unit by ID
 */
export async function getUnitById(unitId: string, businessId: string) {
  return prisma.unit.findFirst({
    where: { id: unitId, businessId },
    include: {
      _count: {
        select: { productVariants: true },
      },
    },
  });
}

/**
 * Get all units for a business
 */
export async function getUnits(
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
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { shortCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [units, total] = await Promise.all([
    prisma.unit.findMany({
      where,
      include: {
        _count: {
          select: { productVariants: true },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    data: units,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update unit
 */
export async function updateUnit(
  unitId: string,
  businessId: string,
  input: UpdateUnitInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentUnit = await prisma.unit.findFirst({
    where: { id: unitId, businessId },
  });

  if (!currentUnit) {
    throw new Error('Unit not found');
  }

  // Check if new name already exists
  if (input.name && input.name !== currentUnit.name) {
    const existing = await prisma.unit.findFirst({
      where: {
        businessId,
        name: input.name,
        id: { not: unitId },
      },
    });

    if (existing) {
      throw new Error('Unit name already exists');
    }
  }

  // Check if new short code already exists
  if (input.shortCode && input.shortCode !== currentUnit.shortCode) {
    const existing = await prisma.unit.findFirst({
      where: {
        businessId,
        shortCode: input.shortCode,
        id: { not: unitId },
      },
    });

    if (existing) {
      throw new Error('Unit short code already exists');
    }
  }

  // Track changes for audit
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentUnit as Record<string, unknown>)[key] !== value) {
      oldValues[key] = (currentUnit as Record<string, unknown>)[key];
      newValues[key] = value;
    }
  }

  const unit = await prisma.unit.update({
    where: { id: unitId },
    data: input,
    include: {
      _count: {
        select: { productVariants: true },
      },
    },
  });

  if (Object.keys(newValues).length > 0) {
    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.UNIT_UPDATED,
      entityType: 'unit',
      entityId: unitId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  return unit;
}

/**
 * Disable unit (soft delete)
 */
export async function disableUnit(
  unitId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, businessId },
    include: {
      _count: {
        select: { productVariants: true },
      },
    },
  });

  if (!unit) {
    throw new Error('Unit not found');
  }

  if (unit._count.productVariants > 0) {
    throw new Error('Cannot disable unit with active product variants');
  }

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: { isActive: false },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.UNIT_DISABLED,
    entityType: 'unit',
    entityId: unitId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Enable unit
 */
export async function enableUnit(
  unitId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, businessId },
  });

  if (!unit) {
    throw new Error('Unit not found');
  }

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: { isActive: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.UNIT_ENABLED,
    entityType: 'unit',
    entityId: unitId,
    ipAddress,
    userAgent,
  });

  return updated;
}
