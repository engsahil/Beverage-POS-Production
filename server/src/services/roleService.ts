import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateRoleInput {
  businessId: string;
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissionIds?: string[];
}

/**
 * Create a new role
 */
export async function createRole(
  input: CreateRoleInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check if role name already exists in this business
  const existing = await prisma.role.findFirst({
    where: {
      businessId: input.businessId,
      name: input.name,
    },
  });

  if (existing) {
    throw new Error('Role name already exists');
  }

  const role = await prisma.role.create({
    data: {
      businessId: input.businessId,
      name: input.name,
      description: input.description,
      permissions: input.permissionIds
        ? {
            create: input.permissionIds.map(pid => ({
              permissionId: pid,
            })),
          }
        : undefined,
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId: adminId,
    action: AuditActions.ROLE_CREATED,
    entityType: 'role',
    entityId: role.id,
    newValues: { name: role.name, description: role.description },
    ipAddress,
    userAgent,
  });

  logger.info('Role created', { roleId: role.id, businessId: input.businessId });

  return role;
}

/**
 * Get role by ID
 */
export async function getRoleById(roleId: string, businessId: string) {
  return prisma.role.findFirst({
    where: { id: roleId, businessId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: { users: true },
      },
    },
  });
}

/**
 * Get all roles for a business
 */
export async function getRoles(businessId: string) {
  return prisma.role.findMany({
    where: { businessId },
    include: {
      permissions: {
        include: {
          permission: {
            select: { id: true, name: true, module: true, action: true },
          },
        },
      },
      _count: {
        select: { users: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Update role
 */
export async function updateRole(
  roleId: string,
  businessId: string,
  input: UpdateRoleInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentRole = await prisma.role.findFirst({
    where: { id: roleId, businessId },
  });

  if (!currentRole) {
    throw new Error('Role not found');
  }

  // Cannot modify system roles' names
  if (currentRole.isSystem && input.name && input.name !== currentRole.name) {
    throw new Error('Cannot rename system roles');
  }

  const { permissionIds, ...roleData } = input;

  // Update role
  const role = await prisma.role.update({
    where: { id: roleId },
    data: roleData,
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });

  // Update permissions if provided
  if (permissionIds !== undefined) {
    // Delete existing permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Create new permissions
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map(pid => ({
          roleId,
          permissionId: pid,
        })),
      });
    }

    await createAuditLog({
      businessId,
      userId: adminId,
      action: AuditActions.ROLE_PERMISSIONS_UPDATED,
      entityType: 'role',
      entityId: roleId,
      newValues: { permissionIds },
      ipAddress,
      userAgent,
    });
  }

  // Fetch updated role with permissions
  const updatedRole = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: {
        include: { permission: true },
      },
      _count: { select: { users: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId: adminId,
    action: AuditActions.ROLE_UPDATED,
    entityType: 'role',
    entityId: roleId,
    oldValues: { name: currentRole.name },
    newValues: { name: role.name, description: role.description },
    ipAddress,
    userAgent,
  });

  return updatedRole;
}

/**
 * Delete role (only non-system roles)
 */
export async function deleteRole(
  roleId: string,
  businessId: string,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, businessId },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('Cannot delete system roles');
  }

  if (role._count.users > 0) {
    throw new Error('Cannot delete role with assigned users');
  }

  await prisma.role.delete({ where: { id: roleId } });

  await createAuditLog({
    businessId,
    userId: adminId,
    action: AuditActions.ROLE_DELETED,
    entityType: 'role',
    entityId: roleId,
    oldValues: { name: role.name },
    ipAddress,
    userAgent,
  });

  return { success: true };
}
