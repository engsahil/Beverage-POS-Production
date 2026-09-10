import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/lib/config.js';

const prisma = new PrismaClient();

async function main() {
  console.log(' Starting database seed...\n');

  // 1. Create business
  let business = await prisma.business.findFirst();
  
  if (!business) {
    business = await prisma.business.create({
      data: {
        name: config.SEED_BUSINESS_NAME,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        phone: '+923001234567',
        address: 'Lahore, Punjab, Pakistan',
      },
    });
    console.log(`[SEED] Business created:`, business.name);
  } else {
    console.log('ℹ  Business already exists:', business.name);
  }

  // 2. Create default branch
  let branch = await prisma.branch.findFirst({
    where: { businessId: business.id },
  });

  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        businessId: business.id,
        name: 'Main Branch',
        code: 'MAIN',
        address: business.address,
        phone: business.phone,
      },
    });
    console.log(`[SEED] Branch created:`, branch.name);
  } else {
    console.log('ℹ  Branch already exists:', branch.name);
  }

  // 3. Seed permissions
  const defaultPermissions = [
    // Sales
    { name: 'sales.view', module: 'sales', action: 'view', description: 'View sales' },
    { name: 'sales.create', module: 'sales', action: 'create', description: 'Create sales' },
    { name: 'sales.edit', module: 'sales', action: 'edit', description: 'Edit sales' },
    { name: 'sales.refund', module: 'sales', action: 'refund', description: 'Process refunds' },
    { name: 'sales.void', module: 'sales', action: 'void', description: 'Void sales' },
    { name: 'sales.override_price', module: 'sales', action: 'override_price', description: 'Override product prices' },
    { name: 'sales.apply_discount', module: 'sales', action: 'apply_discount', description: 'Apply discounts' },

    // Products (Phase 3)
    { name: 'products.view', module: 'products', action: 'view', description: 'View products' },
    { name: 'products.create', module: 'products', action: 'create', description: 'Create products' },
    { name: 'products.edit', module: 'products', action: 'edit', description: 'Edit products' },
    { name: 'products.delete', module: 'products', action: 'delete', description: 'Delete products' },
    { name: 'products.import', module: 'products', action: 'import', description: 'Import products' },
    { name: 'products.export', module: 'products', action: 'export', description: 'Export products' },

    // Categories (Phase 3)
    { name: 'categories.view', module: 'categories', action: 'view', description: 'View categories' },
    { name: 'categories.create', module: 'categories', action: 'create', description: 'Create categories' },
    { name: 'categories.edit', module: 'categories', action: 'edit', description: 'Edit categories' },
    { name: 'categories.delete', module: 'categories', action: 'delete', description: 'Delete categories' },

    // Units (Phase 3)
    { name: 'units.view', module: 'units', action: 'view', description: 'View units' },
    { name: 'units.manage', module: 'units', action: 'manage', description: 'Manage units' },

    // Inventory
    { name: 'inventory.view', module: 'inventory', action: 'view', description: 'View inventory' },
    { name: 'inventory.adjust', module: 'inventory', action: 'adjust', description: 'Adjust stock levels' },
    { name: 'inventory.opening_stock', module: 'inventory', action: 'opening_stock', description: 'Create opening stock' },
    { name: 'inventory.movements.view', module: 'inventory', action: 'movements.view', description: 'View stock movements' },
    { name: 'inventory.transfer', module: 'inventory', action: 'transfer', description: 'Transfer stock between branches' },
    { name: 'inventory.count', module: 'inventory', action: 'count', description: 'Create and manage stock counts' },
    { name: 'inventory.transfer.view', module: 'inventory', action: 'transfer.view', description: 'View transfers' },
    { name: 'inventory.transfer.create', module: 'inventory', action: 'transfer.create', description: 'Create transfers' },
    { name: 'inventory.transfer.approve', module: 'inventory', action: 'transfer.approve', description: 'Approve and cancel transfers' },
    { name: 'inventory.transfer.receive', module: 'inventory', action: 'transfer.receive', description: 'Receive transfers' },
    { name: 'inventory.expiry.view', module: 'inventory', action: 'expiry.view', description: 'View expiry information' },
    { name: 'inventory.expiry.manage', module: 'inventory', action: 'expiry.manage', description: 'Manage batches and expiry' },

    // Vendors (Phase 5)
    { name: 'vendors.view', module: 'vendors', action: 'view', description: 'View vendors' },
    { name: 'vendors.create', module: 'vendors', action: 'create', description: 'Create vendors' },
    { name: 'vendors.edit', module: 'vendors', action: 'edit', description: 'Edit vendors' },
    { name: 'vendors.manage', module: 'vendors', action: 'manage', description: 'Manage vendors (enable/disable)' },

    // Purchases (Phase 5)
    { name: 'purchases.view', module: 'purchases', action: 'view', description: 'View purchases' },
    { name: 'purchases.create', module: 'purchases', action: 'create', description: 'Create purchases' },
    { name: 'purchases.edit', module: 'purchases', action: 'edit', description: 'Edit draft purchases' },
    { name: 'purchases.receive', module: 'purchases', action: 'receive', description: 'Receive purchases (update inventory)' },
    { name: 'purchases.cancel', module: 'purchases', action: 'cancel', description: 'Cancel draft purchases' },

    // Customers
    { name: 'customers.view', module: 'customers', action: 'view', description: 'View customers' },
    { name: 'customers.create', module: 'customers', action: 'create', description: 'Create customers' },
    { name: 'customers.edit', module: 'customers', action: 'edit', description: 'Edit customers' },
    { name: 'customers.delete', module: 'customers', action: 'delete', description: 'Delete customers' },
    { name: 'customers.view_ledger', module: 'customers', action: 'view_ledger', description: 'View customer ledger' },
    { name: 'customers.add_payment', module: 'customers', action: 'add_payment', description: 'Add customer payments' },

  
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

    // Data
    { name: 'data.export', module: 'data', action: 'export', description: 'Export data' },
    { name: 'data.import', module: 'data', action: 'import', description: 'Import data' },

    // Roles & permissions
    { name: 'roles.view', module: 'roles', action: 'view', description: 'View roles' },
    { name: 'roles.manage', module: 'roles', action: 'manage', description: 'Manage roles' },

    // Audit
    { name: 'audit.view', module: 'audit', action: 'view', description: 'View audit logs' },

    // POS (Phase 7)
    { name: 'pos.access', module: 'pos', action: 'access', description: 'Access POS interface' },
    { name: 'pos.products.search', module: 'pos', action: 'products.search', description: 'Search products in POS' },
    { name: 'pos.cart.manage', module: 'pos', action: 'cart.manage', description: 'Manage POS cart' },

    // Discounts & Price Control (Phase 8)
    { name: 'discounts.view', module: 'discounts', action: 'view', description: 'View discount rules' },
    { name: 'discounts.apply', module: 'discounts', action: 'apply', description: 'Apply discounts' },
    { name: 'discounts.override', module: 'discounts', action: 'override', description: 'Override discount limits' },
    { name: 'discounts.manage', module: 'discounts', action: 'manage', description: 'Manage discount configuration' },
    { name: 'price_limits.view', module: 'price_limits', action: 'view', description: 'View price limits' },
    { name: 'price_limits.override', module: 'price_limits', action: 'override', description: 'Override price limits' },
    { name: 'price_limits.manage', module: 'price_limits', action: 'manage', description: 'Manage price limit configuration' },
    // Receipts & Printing (Phase 9)
    { name: 'receipts.view', module: 'receipts', action: 'view', description: 'View and print receipts' },
    { name: 'receipts.reprint', module: 'receipts', action: 'reprint', description: 'Reprint existing receipts' },
    { name: 'receipts.configure', module: 'receipts', action: 'configure', description: 'Configure receipt settings' },

    // Shifts (cashier shift management)
    { name: 'shifts.view', module: 'shifts', action: 'view', description: 'View cashier shifts' },
    { name: 'shifts.open', module: 'shifts', action: 'open', description: 'Open a cashier shift' },
    { name: 'shifts.close', module: 'shifts', action: 'close', description: 'Close own cashier shift' },
    { name: 'shifts.override', module: 'shifts', action: 'override', description: 'Admin-close any cashier shift' },
    { name: 'shifts.manage', module: 'shifts', action: 'manage', description: 'Manage (cancel) cashier shifts' },

    // Branches (reference data for transfers, stock counts, filters)
    { name: 'branches.view', module: 'branches', action: 'view', description: 'View branches' },

    // Claims workflow
    { name: 'claims.create', module: 'claims', action: 'create', description: 'Create claims' },
    { name: 'claims.edit', module: 'claims', action: 'edit', description: 'Edit claims' },
    { name: 'claims.review', module: 'claims', action: 'review', description: 'Review claims' },
    { name: 'claims.approve', module: 'claims', action: 'approve', description: 'Approve or reject claims' },

    // Commissions workflow
    { name: 'commission.create', module: 'commission', action: 'create', description: 'Create commission records' },
    { name: 'commission.edit', module: 'commission', action: 'edit', description: 'Edit commission records' },
    { name: 'commission.approve', module: 'commission', action: 'approve', description: 'Approve or reject commissions' },

    // Daily open/close records
    { name: 'daily_open_close.view', module: 'daily_open_close', action: 'view', description: 'View daily records' },
    { name: 'daily_open_close.manage', module: 'daily_open_close', action: 'manage', description: 'Open and close daily records' },

    // Expense categories & management
    { name: 'expense_categories.view', module: 'expense_categories', action: 'view', description: 'View expense categories' },
    { name: 'expense_categories.manage', module: 'expense_categories', action: 'manage', description: 'Manage expense categories' },
    { name: 'expenses.manage', module: 'expenses', action: 'manage', description: 'Cancel and manage expenses' },

    // POS offline sync
    { name: 'pos.offline.sync', module: 'pos', action: 'offline.sync', description: 'Sync offline POS queue' },

    // Granular reports
    { name: 'reports.sales.view', module: 'reports', action: 'sales.view', description: 'View sales reports' },
    { name: 'reports.inventory.view', module: 'reports', action: 'inventory.view', description: 'View inventory reports' },
    { name: 'reports.purchases.view', module: 'reports', action: 'purchases.view', description: 'View purchase reports' },
    { name: 'reports.expenses.view', module: 'reports', action: 'expenses.view', description: 'View expense reports' },
    { name: 'reports.customers.view', module: 'reports', action: 'customers.view', description: 'View customer reports' },
    { name: 'reports.shifts.view', module: 'reports', action: 'shifts.view', description: 'View shift reports' },
    { name: 'reports.targets.view', module: 'reports', action: 'targets.view', description: 'View target reports' },

    // Targets
    { name: 'targets.view', module: 'targets', action: 'view', description: 'View sales targets' },
    { name: 'targets.create', module: 'targets', action: 'create', description: 'Create sales targets' },
    { name: 'targets.edit', module: 'targets', action: 'edit', description: 'Edit sales targets' },
    { name: 'targets.manage', module: 'targets', action: 'manage', description: 'Manage sales targets' },

    // WhatsApp
    { name: 'whatsapp.view', module: 'whatsapp', action: 'view', description: 'View WhatsApp messages' },
    { name: 'whatsapp.manage', module: 'whatsapp', action: 'manage', description: 'Manage WhatsApp configuration' },

    // System / performance monitoring
    { name: 'system.view', module: 'system', action: 'view', description: 'View system health and metrics' },
  ];

  // Idempotent permission seeding: create only permissions missing for this business,
  // so re-running the seed repairs databases created before newer permissions existed.
  const existingPerms = await prisma.permission.findMany({
    where: { businessId: business.id },
    select: { name: true },
  });
  const existingPermNames = new Set(existingPerms.map(p => p.name));
  const missingPermissions = defaultPermissions.filter(p => !existingPermNames.has(p.name));

  if (missingPermissions.length > 0) {
    await prisma.permission.createMany({
      data: missingPermissions.map(p => ({
        ...p,
        businessId: business.id,
      })),
    });
    console.log(`[SEED] ${missingPermissions.length} permission(s) created`);
  } else {
    console.log(`ℹ  ${existingPerms.length} permissions already exist`);
  }

  // 4. Create Admin role (with all permissions)
  let adminRole = await prisma.role.findFirst({
    where: { businessId: business.id, name: 'Admin' },
  });

  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        businessId: business.id,
        name: 'Admin',
        description: 'Full system access',
        isSystem: true,
      },
    });

    // Assign all permissions to admin
    const allPermissions = await prisma.permission.findMany({
      where: { businessId: business.id },
    });

    await prisma.rolePermission.createMany({
      data: allPermissions.map(p => ({
        roleId: adminRole.id,
        permissionId: p.id,
      })),
    });

    console.log(`[SEED] Admin role created with all permissions`);
  } else {
    // Backfill: grant the Admin role any permissions it is missing
    // (e.g. shifts.* on databases seeded before those permissions existed).
    const allPermissions = await prisma.permission.findMany({
      where: { businessId: business.id },
      select: { id: true },
    });
    const assigned = await prisma.rolePermission.findMany({
      where: { roleId: adminRole.id },
      select: { permissionId: true },
    });
    const assignedIds = new Set(assigned.map(a => a.permissionId));
    const missing = allPermissions.filter(p => !assignedIds.has(p.id));

    if (missing.length > 0) {
      await prisma.rolePermission.createMany({
        data: missing.map(p => ({
          roleId: adminRole.id,
          permissionId: p.id,
        })),
      });
      console.log(`[SEED] Admin role granted ${missing.length} missing permission(s)`);
    } else {
      console.log('ℹ  Admin role already exists');
    }
  }

  // 5. Create Cashier role (with limited permissions)
  let cashierRole = await prisma.role.findFirst({
    where: { businessId: business.id, name: 'Cashier' },
  });

  if (!cashierRole) {
    cashierRole = await prisma.role.create({
      data: {
        businessId: business.id,
        name: 'Cashier',
        description: 'POS cashier with limited access',
        isSystem: true,
      },
    });

    // Assign cashier-specific permissions
    const cashierPermissions = await prisma.permission.findMany({
      where: {
        businessId: business.id,
        name: {
          in: [
            'sales.view',
            'sales.create',
            'products.view',
            'inventory.view',
            'customers.view',
            'customers.create',
            'pos.access',
            'pos.products.search',
            'pos.cart.manage',
            'receipts.view',
            'shifts.view',
            'shifts.open',
            'shifts.close',
            'pos.offline.sync',
          ],
        },
      },
    });

    await prisma.rolePermission.createMany({
      data: cashierPermissions.map(p => ({
        roleId: cashierRole.id,
        permissionId: p.id,
      })),
    });

    console.log(`[SEED] Cashier role created with limited permissions`);
  } else {
    console.log('ℹ  Cashier role already exists');
  }

  // 6. Create Admin user
  let adminUser = await prisma.user.findFirst({
    where: { businessId: business.id, username: config.SEED_ADMIN_USERNAME },
  });

  if (!adminUser) {
    const passwordHash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, config.BCRYPT_SALT_ROUNDS);

    adminUser = await prisma.user.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        username: config.SEED_ADMIN_USERNAME,
        email: config.SEED_ADMIN_EMAIL,
        fullName: 'System Administrator',
        passwordHash,
        roleId: adminRole.id,
        isActive: true,
      },
    });

    console.log(`[SEED] Admin user created:`, adminUser.username);
    console.log('   Username:', config.SEED_ADMIN_USERNAME);
    console.log('   Password:', config.SEED_ADMIN_PASSWORD);
    console.log('     CHANGE THIS PASSWORD IN PRODUCTION!\n');
  } else {
    console.log('ℹ  Admin user already exists:', adminUser.username);
  }

  // 7. Create default settings
  const defaultSettings = [
    {
      key: 'invoice_number_prefix',
      value: 'INV-',
    },
    {
      key: 'invoice_number_sequence',
      value: 1,
    },
    {
      key: 'receipt_show_logo',
      value: true,
    },
    {
      key: 'receipt_show_address',
      value: true,
    },
    {
      key: 'receipt_show_phone',
      value: true,
    },
    {
      key: 'currency_symbol',
      value: 'Rs.',
    },
    {
      key: 'date_format',
      value: 'DD/MM/YYYY',
    },
    {
      key: 'time_format',
      value: 'HH:mm',
    },
  ];

  for (const setting of defaultSettings) {
    const existing = await prisma.setting.findFirst({
      where: {
        businessId: business.id,
        key: setting.key,
      },
    });

    if (!existing) {
      await prisma.setting.create({
        data: {
          businessId: business.id,
          key: setting.key,
          value: setting.value as unknown as object,
        },
      });
    }
  }

  console.log(`[SEED] Default settings created`);

  console.log('\n Database seed completed successfully!');
  console.log('\n Summary:');
  console.log('   - Business:', business.name);
  console.log('   - Branch:', branch.name);
  console.log('   - Permissions:', defaultPermissions.length);
  console.log('   - Roles: Admin, Cashier');
  console.log('   - Admin User:', adminUser.username);
  console.log('\n You can now start the server with: npm run dev:server\n');
}

main()
  .catch((e) => {
    console.error(`[SEED ERROR] Seed failed:`, e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
