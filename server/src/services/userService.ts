import prisma from '../lib/prisma.js';
import { hashPassword } from '../utils/hashing.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateUserInput {
  businessId: string;
  username: string;
  email?: string;
  phone?: string;
  password: string;
  fullName: string;
  roleId: string;
  branchId?: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  phone?: string | null;
  fullName?: string;
  roleId?: string;
  branchId?: string | null;
  isActive?: boolean;
}

// Sanitize user data for API responses (NEVER include password hash)
function sanitizeUser(user: Record<string, unknown>) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Create a new user
 */
export async function createUser(
  input: CreateUserInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const { password, ...userData } = input;

  // Check if username already exists in this business
  const existing = await prisma.user.findFirst({
    where: {
      businessId: input.businessId,
      username: input.username,
    },
  });

  if (existing) {
    throw new Error('Username already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      ...userData,
      passwordHash,
      isActive: input.isActive ?? true,
    },
    include: {
      business: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      role: {
        select: {
          id: true,
          name: true,
          permissions: {
            include: {
              permission: {
                select: { id: true, name: true, module: true, action: true },
              },
            },
          },
        },
      },
    },
  });

  // Audit log
  await createAuditLog({
    businessId: input.businessId,
    userId: adminId,
    action: AuditActions.USER_CREATED,
    entityType: 'user',
    entityId: user.id,
    newValues: { username: user.username, fullName: user.fullName, roleId: user.roleId },
    ipAddress,
    userAgent,
  });

  logger.info('User created', { userId: user.id, businessId: input.businessId, adminId });

  return sanitizeUser(user);
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string, businessId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, businessId },
    include: {
      business: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          permissions: {
            include: {
              permission: {
                select: { id: true, name: true, module: true, action: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  return sanitizeUser(user);
}

/**
 * Get all users for a business
 */
export async function getUsers(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    roleId?: string;
    isActive?: boolean;
    branchId?: string;
  } = {}
) {
  const { page = 1, limit = 20, search, roleId, isActive, branchId } = params;

  const where: Record<string, unknown> = { businessId };
  if (roleId) where.roleId = roleId;
  if (isActive !== undefined) where.isActive = isActive;
  if (branchId) where.branchId = branchId;
  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        role: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users.map(u => sanitizeUser(u)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update user
 */
export async function updateUser(
  userId: string,
  businessId: string,
  input: UpdateUserInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Get current user for audit log
  const currentUser = await prisma.user.findFirst({
    where: { id: userId, businessId },
  });

  if (!currentUser) {
    throw new Error('User not found');
  }

  // Track changes for audit
  const changes: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentUser as Record<string, unknown>)[key] !== value) {
      changes[key] = value;
      oldValues[key] = (currentUser as Record<string, unknown>)[key];
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
    include: {
      branch: { select: { id: true, name: true } },
      role: {
        select: {
          id: true,
          name: true,
          permissions: {
            include: {
              permission: {
                select: { id: true, name: true, module: true, action: true },
              },
            },
          },
        },
      },
    },
  });

  // Audit log
  if (Object.keys(changes).length > 0) {
    await createAuditLog({
      businessId,
      userId: adminId,
      action: AuditActions.USER_UPDATED,
      entityType: 'user',
      entityId: userId,
      oldValues,
      newValues: changes,
      ipAddress,
      userAgent,
    });
  }

  return sanitizeUser(user);
}

/**
 * Disable a user (soft delete)
 */
export async function disableUser(
  userId: string,
  businessId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  // Invalidate all sessions
  await prisma.session.deleteMany({ where: { userId } });

  await createAuditLog({
    businessId,
    userId: adminId,
    action: AuditActions.USER_DISABLED,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  });

  return sanitizeUser(user);
}

/**
 * Enable a user
 */
export async function enableUser(
  userId: string,
  businessId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      loginAttempts: 0,
      lockedUntil: null,
    },
  });

  await createAuditLog({
    businessId,
    userId: adminId,
    action: AuditActions.USER_ENABLED,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  });

  return sanitizeUser(user);
}
