import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreatePermissionInput {
  businessId: string;
  name: string;
  module: string;
  action: string;
  description?: string;
}

/**
 * Create a permission
 */
export async function createPermission(
  input: CreatePermissionInput,
  adminId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const permission = await prisma.permission.create({
    data: input,
  });

  await createAuditLog({
    businessId: input.businessId,
    userId: adminId,
    action: AuditActions.PERMISSION_CREATED,
    entityType: 'permission',
    entityId: permission.id,
    newValues: { name: permission.name, module: permission.module, action: permission.action },
    ipAddress,
    userAgent,
  });

  return permission;
}

/**
 * Get all permissions for a business
 */
export async function getPermissions(businessId: string) {
  return prisma.permission.findMany({
    where: { businessId },
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });
}

/**
 * Get permissions grouped by module
 */
export async function getPermissionsByModule(businessId: string) {
  const permissions = await prisma.permission.findMany({
    where: { businessId },
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });

  const grouped: Record<string, typeof permissions> = {};
  for (const perm of permissions) {
    if (!grouped[perm.module]) {
      grouped[perm.module] = [];
    }
    grouped[perm.module].push(perm);
  }

  return grouped;
}

/**
 * Seed default permissions for a business
 */
export async function seedDefaultPermissions(businessId: string) {
  const defaultPermissions = [
    // Sales
    { name: 'sales.view', module: 'sales', action: 'view', description: 'View sales' },
    { name: 'sales.create', module: 'sales', action: 'create', description: 'Create sales' },
    { name: 'sales.edit', module: 'sales', action: 'edit', description: 'Edit sales' },
    { name: 'sales.refund', module: 'sales', action: 'refund', description: 'Process refunds' },
    { name: 'sales.void', module: 'sales', action: 'void', description: 'Void sales' },
    { name: 'sales.override_price', module: 'sales', action: 'override_price', description: 'Override product prices' },
    { name: 'sales.apply_discount', module: 'sales', action: 'apply_discount', description: 'Apply discounts' },

    // Products
    { name: 'products.view', module: 'products', action: 'view', description: 'View products' },
    { name: 'products.create', module: 'products', action: 'create', description: 'Create products' },
    { name: 'products.edit', module: 'products', action: 'edit', description: 'Edit products' },
    { name: 'products.delete', module: 'products', action: 'delete', description: 'Delete products' },
    { name: 'products.import', module: 'products', action: 'import', description: 'Import products' },
    { name: 'products.export', module: 'products', action: 'export', description: 'Export products' },

    // Inventory
    { name: 'inventory.view', module: 'inventory', action: 'view', description: 'View inventory' },
    { name: 'inventory.adjust', module: 'inventory', action: 'adjust', description: 'Adjust stock levels' },
    { name: 'inventory.transfer', module: 'inventory', action: 'transfer', description: 'Transfer stock between branches' },

    // Customers
    { name: 'customers.view', module: 'customers', action: 'view', description: 'View customers' },
    { name: 'customers.create', module: 'customers', action: 'create', description: 'Create customers' },
    { name: 'customers.edit', module: 'customers', action: 'edit', description: 'Edit customers' },
    { name: 'customers.delete', module: 'customers', action: 'delete', description: 'Delete customers' },
    { name: 'customers.view_ledger', module: 'customers', action: 'view_ledger', description: 'View customer ledger' },
    { name: 'customers.add_payment', module: 'customers', action: 'add_payment', description: 'Add customer payments' },

    // Purchases
    { name: 'purchases.view', module: 'purchases', action: 'view', description: 'View purchases' },
    { name: 'purchases.create', module: 'purchases', action: 'create', description: 'Create purchase orders' },
    { name: 'purchases.edit', module: 'purchases', action: 'edit', description: 'Edit purchases' },
    { name: 'purchases.delete', module: 'purchases', action: 'delete', description: 'Delete purchases' },
    { name: 'purchases.approve', module: 'purchases', action: 'approve', description: 'Approve purchases' },

    // Vendors
    { name: 'vendors.view', module: 'vendors', action: 'view', description: 'View vendors' },
    { name: 'vendors.manage', module: 'vendors', action: 'manage', description: 'Manage vendors' },

    // Expenses
    { name: 'expenses.view', module: 'expenses', action: 'view', description: 'View expenses' },
    { name: 'expenses.create', module: 'expenses', action: 'create', description: 'Create expenses' },
    { name: 'expenses.edit', module: 'expenses', action: 'edit', description: 'Edit expenses' },
    { name: 'expenses.approve', module: 'expenses', action: 'approve', description: 'Approve expenses' },

    // Claims
    { name: 'claims.view', module: 'claims', action: 'view', description: 'View claims' },
    { name: 'claims.manage', module: 'claims', action: 'manage', description: 'Manage claims' },

    // Reports
    { name: 'reports.view', module: 'reports', action: 'view', description: 'View reports' },
    { name: 'reports.financial', module: 'reports', action: 'financial', description: 'View financial reports' },
    { name: 'reports.export', module: 'reports', action: 'export', description: 'Export reports' },

    // Commission
    { name: 'commission.view', module: 'commission', action: 'view', description: 'View commission' },
    { name: 'commission.manage', module: 'commission', action: 'manage', description: 'Manage commission rules' },

    // Cashier management
    { name: 'cashier.view', module: 'cashier', action: 'view', description: 'View cashiers' },
    { name: 'cashier.manage', module: 'cashier', action: 'manage', description: 'Manage cashiers' },

    // Settings
    { name: 'settings.view', module: 'settings', action: 'view', description: 'View settings' },
    { name: 'settings.manage', module: 'settings', action: 'manage', description: 'Manage settings' },

    // Backup
    { name: 'backup.view', module: 'backup', action: 'view', description: 'View backups' },
    { name: 'backup.manage', module: 'backup', action: 'manage', description: 'Manage backups' },

    // WhatsApp
    { name: 'whatsapp.view', module: 'whatsapp', action: 'view', description: 'View WhatsApp messages and configuration' },
    { name: 'whatsapp.manage', module: 'whatsapp', action: 'manage', description: 'Configure WhatsApp and send messages' },

    // Data
    { name: 'data.export', module: 'data', action: 'export', description: 'Export data' },
    { name: 'data.import', module: 'data', action: 'import', description: 'Import data' },

    // Roles & permissions
    { name: 'roles.view', module: 'roles', action: 'view', description: 'View roles' },
    { name: 'roles.manage', module: 'roles', action: 'manage', description: 'Manage roles' },

    // Audit
    { name: 'audit.view', module: 'audit', action: 'view', description: 'View audit logs' },
  ];

  const existingCount = await prisma.permission.count({ where: { businessId } });
  
  if (existingCount > 0) {
    logger.info('Permissions already seeded', { businessId, existingCount });
    return;
  }

  await prisma.permission.createMany({
    data: defaultPermissions.map(p => ({
      ...p,
      businessId,
    })),
  });

  logger.info('Default permissions seeded', { businessId, count: defaultPermissions.length });
}
