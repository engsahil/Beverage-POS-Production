import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateVendorInput {
  businessId: string;
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  openingBalance?: number;
  paymentTerms?: number;
}

export interface UpdateVendorInput {
  name?: string;
  companyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  openingBalance?: number;
  paymentTerms?: number | null;
  isActive?: boolean;
}

/**
 * Create a new vendor
 */
export async function createVendor(
  input: CreateVendorInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const vendor = await prisma.vendor.create({
    data: {
      ...input,
      createdBy: userId,
    },
    include: {
      creator: {
        select: { id: true, username: true, fullName: true },
      },
      _count: {
        select: { purchases: true },
      },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.VENDOR_CREATED,
    entityType: 'vendor',
    entityId: vendor.id,
    newValues: {
      name: vendor.name,
      companyName: vendor.companyName,
      phone: vendor.phone,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Vendor created', {
    vendorId: vendor.id,
    businessId: input.businessId,
    userId,
  });

  return vendor;
}

/**
 * Get vendor by ID
 */
export async function getVendorById(vendorId: string, businessId: string) {
  return prisma.vendor.findFirst({
    where: { id: vendorId, businessId },
    include: {
      creator: {
        select: { id: true, username: true, fullName: true },
      },
      _count: {
        select: { purchases: true },
      },
    },
  });
}

/**
 * Get all vendors for a business with search and filtering
 */
export async function getVendors(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  } = {}
) {
  const { page = 1, limit = 20, search, isActive } = params;

  const where: Record<string, unknown> = { businessId };
  if (isActive !== undefined) where.isActive = isActive;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { whatsapp: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        creator: {
          select: { id: true, username: true, fullName: true },
        },
        _count: {
          select: { purchases: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vendor.count({ where }),
  ]);

  return {
    data: vendors,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update vendor
 */
export async function updateVendor(
  vendorId: string,
  businessId: string,
  input: UpdateVendorInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentVendor = await prisma.vendor.findFirst({
    where: { id: vendorId, businessId },
  });

  if (!currentVendor) {
    throw new Error('Vendor not found');
  }

  // Track changes for audit
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentVendor as Record<string, unknown>)[key] !== value) {
      oldValues[key] = (currentVendor as Record<string, unknown>)[key];
      newValues[key] = value;
    }
  }

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: input,
    include: {
      creator: {
        select: { id: true, username: true, fullName: true },
      },
      _count: {
        select: { purchases: true },
      },
    },
  });

  if (Object.keys(newValues).length > 0) {
    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.VENDOR_UPDATED,
      entityType: 'vendor',
      entityId: vendorId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  return vendor;
}

/**
 * Disable vendor (soft delete)
 */
export async function disableVendor(
  vendorId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, businessId },
    include: {
      _count: {
        select: { purchases: true },
      },
    },
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Check if vendor has purchases
  if (vendor._count.purchases > 0) {
    throw new Error('Cannot disable vendor with existing purchases');
  }

  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: { isActive: false },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.VENDOR_DISABLED,
    entityType: 'vendor',
    entityId: vendorId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Enable vendor
 */
export async function enableVendor(
  vendorId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, businessId },
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: { isActive: true },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.VENDOR_ENABLED,
    entityType: 'vendor',
    entityId: vendorId,
    ipAddress,
    userAgent,
  });

  return updated;
}
