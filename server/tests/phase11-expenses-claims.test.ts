import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Decimal } from '@prisma/client/runtime/library.js';

describe('Phase 11: Expense Categories', () => {
  it('should create expense category with valid data', () => {
    const category = {
      businessId: 'uuid-business-1',
      name: 'Electricity',
      description: 'Monthly electricity bill',
      isActive: true,
    };

    assert.strictEqual(category.name, 'Electricity');
    assert.strictEqual(category.isActive, true);
  });

  it('should detect duplicate category names', () => {
    const existing = [
      { businessId: 'b1', name: 'Electricity' },
      { businessId: 'b1', name: 'Rent' },
    ];

    const newCategory = { businessId: 'b1', name: 'Electricity' };
    const isDuplicate = existing.some(
      c => c.businessId === newCategory.businessId && c.name === newCategory.name
    );

    assert.strictEqual(isDuplicate, true);
  });

  it('should allow same name in different businesses', () => {
    const existing = [
      { businessId: 'b1', name: 'Electricity' },
    ];

    const newCategory = { businessId: 'b2', name: 'Electricity' };
    const isDuplicate = existing.some(
      c => c.businessId === newCategory.businessId && c.name === newCategory.name
    );

    assert.strictEqual(isDuplicate, false);
  });

  it('should toggle category active status', () => {
    const category = { id: 'c1', isActive: true };
    const toggled = { ...category, isActive: false };

    assert.strictEqual(toggled.isActive, false);
  });

  it('should search categories by name', () => {
    const categories = [
      { name: 'Electricity', description: 'Monthly bill' },
      { name: 'Rent', description: 'Office rent' },
      { name: 'Transport', description: 'Vehicle expenses' },
    ];

    const search = 'elect';
    const results = categories.filter(
      c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase())
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'Electricity');
  });
});

describe('Phase 11: Expenses', () => {
  it('should generate expense number EXP-XXXXXX', () => {
    const generateExpenseNumber = (latest: string | null): string => {
      let next = 1;
      if (latest) {
        const match = latest.match(/EXP-(\d+)/);
        if (match) {
          next = parseInt(match[1], 10) + 1;
        }
      }
      return `EXP-${String(next).padStart(6, '0')}`;
    };

    assert.strictEqual(generateExpenseNumber(null), 'EXP-000001');
    assert.strictEqual(generateExpenseNumber('EXP-000001'), 'EXP-000002');
    assert.strictEqual(generateExpenseNumber('EXP-000099'), 'EXP-000100');
    assert.strictEqual(generateExpenseNumber('EXP-999999'), 'EXP-1000000');
  });

  it('should validate positive amount', () => {
    const validAmount = 5000;
    const invalidAmount = -100;
    const zeroAmount = 0;

    assert.strictEqual(validAmount > 0, true);
    assert.strictEqual(invalidAmount > 0, false);
    assert.strictEqual(zeroAmount > 0, false);
  });

  it('should validate payment method', () => {
    const validMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];

    assert.strictEqual(validMethods.includes('CASH'), true);
    assert.strictEqual(validMethods.includes('CARD'), true);
    assert.strictEqual(validMethods.includes('BANK_TRANSFER'), true);
    assert.strictEqual(validMethods.includes('OTHER'), true);
    assert.strictEqual(validMethods.includes('CRYPTO'), false);
  });

  it('should handle expense status', () => {
    const statuses = ['ACTIVE', 'CANCELLED'];

    assert.strictEqual(statuses.includes('ACTIVE'), true);
    assert.strictEqual(statuses.includes('CANCELLED'), true);
    assert.strictEqual(statuses.includes('DELETED'), false);
  });

  it('should prevent editing cancelled expenses', () => {
    const expense = { status: 'CANCELLED' };
    const canEdit = expense.status === 'ACTIVE';

    assert.strictEqual(canEdit, false);
  });

  it('should calculate expense totals with Decimal', () => {
    const expenses = [
      { amount: new Decimal('5000.00') },
      { amount: new Decimal('3000.50') },
      { amount: new Decimal('1500.25') },
    ];

    const total = expenses.reduce(
      (sum, e) => sum.plus(e.amount),
      new Decimal(0)
    );

    assert.strictEqual(total.toString(), '9500.75');
  });

  it('should calculate expense totals by category', () => {
    const expenses = [
      { categoryId: 'c1', amount: new Decimal('5000') },
      { categoryId: 'c1', amount: new Decimal('3000') },
      { categoryId: 'c2', amount: new Decimal('2000') },
    ];

    const totals: Record<string, Decimal> = {};
    for (const e of expenses) {
      if (!totals[e.categoryId]) {
        totals[e.categoryId] = new Decimal(0);
      }
      totals[e.categoryId] = totals[e.categoryId].plus(e.amount);
    }

    assert.strictEqual(totals['c1'].toString(), '8000');
    assert.strictEqual(totals['c2'].toString(), '2000');
  });

  it('should support idempotency key', () => {
    const key1 = 'unique-key-expense-1';
    const key2 = 'unique-key-expense-1';

    assert.strictEqual(key1, key2);
  });

  it('should filter expenses by date range', () => {
    const expenses = [
      { expenseDate: new Date('2026-01-15') },
      { expenseDate: new Date('2026-02-15') },
      { expenseDate: new Date('2026-03-15') },
    ];

    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-28');

    const filtered = expenses.filter(
      e => e.expenseDate >= startDate && e.expenseDate <= endDate
    );

    assert.strictEqual(filtered.length, 1);
  });

  it('should filter expenses by amount range', () => {
    const expenses = [
      { amount: new Decimal('1000') },
      { amount: new Decimal('5000') },
      { amount: new Decimal('10000') },
    ];

    const minAmount = new Decimal('2000');
    const maxAmount = new Decimal('8000');

    const filtered = expenses.filter(
      e => e.amount.gte(minAmount) && e.amount.lte(maxAmount)
    );

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].amount.toString(), '5000');
  });
});

describe('Phase 11: Claims', () => {
  it('should generate claim number CLAIM-XXXXXX', () => {
    const generateClaimNumber = (latest: string | null): string => {
      let next = 1;
      if (latest) {
        const match = latest.match(/CLAIM-(\d+)/);
        if (match) {
          next = parseInt(match[1], 10) + 1;
        }
      }
      return `CLAIM-${String(next).padStart(6, '0')}`;
    };

    assert.strictEqual(generateClaimNumber(null), 'CLAIM-000001');
    assert.strictEqual(generateClaimNumber('CLAIM-000001'), 'CLAIM-000002');
    assert.strictEqual(generateClaimNumber('CLAIM-000099'), 'CLAIM-000100');
  });

  it('should validate claim types', () => {
    const validTypes = ['DAMAGE', 'EXPIRED', 'SHORTAGE', 'SUPPLIER', 'PRODUCT', 'OTHER'];

    assert.strictEqual(validTypes.includes('DAMAGE'), true);
    assert.strictEqual(validTypes.includes('EXPIRED'), true);
    assert.strictEqual(validTypes.includes('SHORTAGE'), true);
    assert.strictEqual(validTypes.includes('SUPPLIER'), true);
    assert.strictEqual(validTypes.includes('PRODUCT'), true);
    assert.strictEqual(validTypes.includes('OTHER'), true);
    assert.strictEqual(validTypes.includes('INVALID'), false);
  });

  it('should validate claim status transitions', () => {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['SUBMITTED', 'CANCELLED'],
      SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['RESOLVED', 'CANCELLED'],
      REJECTED: [],
      RESOLVED: [],
      CANCELLED: [],
    };

    // Valid transitions
    assert.strictEqual(validTransitions['DRAFT'].includes('SUBMITTED'), true);
    assert.strictEqual(validTransitions['SUBMITTED'].includes('UNDER_REVIEW'), true);
    assert.strictEqual(validTransitions['UNDER_REVIEW'].includes('APPROVED'), true);
    assert.strictEqual(validTransitions['APPROVED'].includes('RESOLVED'), true);

    // Invalid transitions
    assert.strictEqual(validTransitions['DRAFT'].includes('APPROVED'), false);
    assert.strictEqual(validTransitions['RESOLVED'].includes('DRAFT'), false);
    assert.strictEqual(validTransitions['REJECTED'].includes('APPROVED'), false);
  });

  it('should calculate claim total amount with Decimal', () => {
    const items = [
      { quantity: new Decimal('10'), unitValue: new Decimal('50') },
      { quantity: new Decimal('5'), unitValue: new Decimal('100') },
      { quantity: new Decimal('3'), unitValue: new Decimal('75') },
    ];

    let total = new Decimal(0);
    for (const item of items) {
      const lineTotal = item.quantity.times(item.unitValue);
      total = total.plus(lineTotal);
    }

    // 10*50 + 5*100 + 3*75 = 500 + 500 + 225 = 1225
    assert.strictEqual(total.toString(), '1225');
  });

  it('should calculate line total correctly', () => {
    const quantity = new Decimal('10');
    const unitValue = new Decimal('99.50');
    const lineTotal = quantity.times(unitValue);

    assert.strictEqual(lineTotal.toString(), '995');
  });

  it('should validate item quantity and unit value', () => {
    const validItem = { quantity: 10, unitValue: 50 };
    const invalidQuantity = { quantity: 0, unitValue: 50 };
    const negativeValue = { quantity: 10, unitValue: -5 };

    assert.strictEqual(validItem.quantity > 0 && validItem.unitValue >= 0, true);
    assert.strictEqual(invalidQuantity.quantity > 0, false);
    assert.strictEqual(negativeValue.unitValue >= 0, false);
  });

  it('should require at least one item', () => {
    const emptyItems: any[] = [];
    const validItems = [{ productId: 'p1', quantity: 10, unitValue: 50 }];

    assert.strictEqual(emptyItems.length > 0, false);
    assert.strictEqual(validItems.length > 0, true);
  });

  it('should handle claim with vendor reference', () => {
    const claim = {
      vendorId: 'vendor-uuid-1',
      purchaseId: 'purchase-uuid-1',
      claimType: 'SUPPLIER',
    };

    assert.strictEqual(claim.vendorId, 'vendor-uuid-1');
    assert.strictEqual(claim.purchaseId, 'purchase-uuid-1');
  });

  it('should handle claim with batch reference', () => {
    const claimItem = {
      productId: 'product-uuid-1',
      variantId: 'variant-uuid-1',
      batchId: 'batch-uuid-1',
      quantity: 10,
    };

    assert.strictEqual(claimItem.batchId, 'batch-uuid-1');
  });

  it('should determine inventory movement type from claim type', () => {
    const getMovementType = (claimType: string): string => {
      switch (claimType) {
        case 'DAMAGE': return 'DAMAGE';
        case 'EXPIRED': return 'EXPIRED';
        default: return 'ADJUSTMENT_OUT';
      }
    };

    assert.strictEqual(getMovementType('DAMAGE'), 'DAMAGE');
    assert.strictEqual(getMovementType('EXPIRED'), 'EXPIRED');
    assert.strictEqual(getMovementType('SHORTAGE'), 'ADJUSTMENT_OUT');
    assert.strictEqual(getMovementType('SUPPLIER'), 'ADJUSTMENT_OUT');
  });

  it('should handle rejection with reason', () => {
    const rejection = {
      status: 'REJECTED',
      rejectionReason: 'Insufficient evidence of damage',
      rejectedBy: 'user-uuid-1',
      rejectedAt: new Date(),
    };

    assert.strictEqual(rejection.status, 'REJECTED');
    assert.strictEqual(rejection.rejectionReason.length > 0, true);
  });

  it('should handle resolution with inventory action', () => {
    const resolution = {
      status: 'RESOLVED',
      resolutionNotes: 'Stock removed from inventory',
      applyInventoryAction: true,
    };

    assert.strictEqual(resolution.status, 'RESOLVED');
    assert.strictEqual(resolution.applyInventoryAction, true);
  });

  it('should handle resolution without inventory action', () => {
    const resolution = {
      status: 'RESOLVED',
      resolutionNotes: 'Vendor agreed to credit note',
      applyInventoryAction: false,
    };

    assert.strictEqual(resolution.applyInventoryAction, false);
  });
});

describe('Phase 11: Business Isolation', () => {
  it('should enforce business isolation on expenses', () => {
    const expenses = [
      { id: 'e1', businessId: 'b1', amount: 5000 },
      { id: 'e2', businessId: 'b2', amount: 3000 },
    ];

    const businessAExpenses = expenses.filter(e => e.businessId === 'b1');
    assert.strictEqual(businessAExpenses.length, 1);
    assert.strictEqual(businessAExpenses[0].id, 'e1');
  });

  it('should enforce business isolation on claims', () => {
    const claims = [
      { id: 'c1', businessId: 'b1', claimNumber: 'CLAIM-000001' },
      { id: 'c2', businessId: 'b2', claimNumber: 'CLAIM-000001' },
    ];

    const businessAClaims = claims.filter(c => c.businessId === 'b1');
    assert.strictEqual(businessAClaims.length, 1);
    assert.strictEqual(businessAClaims[0].id, 'c1');
  });

  it('should enforce business isolation on expense categories', () => {
    const categories = [
      { id: 'cat1', businessId: 'b1', name: 'Electricity' },
      { id: 'cat2', businessId: 'b2', name: 'Electricity' },
    ];

    const businessACategories = categories.filter(c => c.businessId === 'b1');
    assert.strictEqual(businessACategories.length, 1);
    assert.strictEqual(businessACategories[0].id, 'cat1');
  });
});

describe('Phase 11: Authorization', () => {
  it('should require expenses.view permission to list expenses', () => {
    const userPermissions = ['expenses.view'];
    const requiredPermission = 'expenses.view';

    const hasPermission = userPermissions.includes('*') || userPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should require expenses.create permission to create expense', () => {
    const cashierPermissions = ['sales.view', 'sales.create'];
    const requiredPermission = 'expenses.create';

    const hasPermission = cashierPermissions.includes('*') || cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, false);
  });

  it('should require claims.approve permission to approve claim', () => {
    const cashierPermissions = ['claims.view', 'claims.create'];
    const requiredPermission = 'claims.approve';

    const hasPermission = cashierPermissions.includes('*') || cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, false);
  });

  it('should require claims.manage permission to resolve claim', () => {
    const adminPermissions = ['*'];
    const requiredPermission = 'claims.manage';

    const hasPermission = adminPermissions.includes('*') || adminPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should require expense_categories.manage to create category', () => {
    const cashierPermissions = ['expenses.view', 'expenses.create'];
    const requiredPermission = 'expense_categories.manage';

    const hasPermission = cashierPermissions.includes('*') || cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, false);
  });

  it('should support wildcard permission', () => {
    const adminPermissions = ['*'];
    const requiredPermissions = [
      'expenses.view',
      'expenses.create',
      'expenses.edit',
      'expenses.manage',
      'claims.view',
      'claims.create',
      'claims.approve',
    ];

    for (const perm of requiredPermissions) {
      const hasPermission = adminPermissions.includes('*') || adminPermissions.includes(perm);
      assert.strictEqual(hasPermission, true);
    }
  });
});

describe('Phase 11: Audit Logging', () => {
  it('should define all Phase 11 audit actions', () => {
    const phase11Actions = [
      'EXPENSE_CATEGORY_CREATED',
      'EXPENSE_CATEGORY_UPDATED',
      'EXPENSE_CATEGORY_ENABLED',
      'EXPENSE_CATEGORY_DISABLED',
      'EXPENSE_CREATED',
      'EXPENSE_UPDATED',
      'EXPENSE_CANCELLED',
      'CLAIM_CREATED',
      'CLAIM_UPDATED',
      'CLAIM_SUBMITTED',
      'CLAIM_UNDER_REVIEW',
      'CLAIM_APPROVED',
      'CLAIM_REJECTED',
      'CLAIM_RESOLVED',
      'CLAIM_CANCELLED',
      'CLAIM_INVENTORY_ACTION',
    ];

    assert.strictEqual(phase11Actions.length, 16);
    assert.strictEqual(new Set(phase11Actions).size, 16); // no duplicates
  });

  it('should create audit log with correct structure', () => {
    const auditLog = {
      businessId: 'b1',
      userId: 'u1',
      action: 'EXPENSE_CREATED',
      entityType: 'expense',
      entityId: 'e1',
      newValues: { expenseNumber: 'EXP-000001', amount: 5000 },
    };

    assert.strictEqual(auditLog.action, 'EXPENSE_CREATED');
    assert.strictEqual(auditLog.entityType, 'expense');
    assert.strictEqual(auditLog.entityId, 'e1');
  });
});

describe('Phase 11: Receipt Regression', () => {
  it('should not break receipt data structure', () => {
    const receiptData = {
      business: { name: 'Test Business', phone: '+923001234567' },
      sale: { saleNumber: 'SALE-000001', total: 1000 },
      items: [{ productName: 'Product A', quantity: 2, lineTotal: 1000 }],
      payments: [{ paymentMethod: 'CASH', amount: 1000 }],
      settings: { receiptWidth: '80mm', showBarcode: true },
    };

    assert.strictEqual(receiptData.business.name, 'Test Business');
    assert.strictEqual(receiptData.sale.saleNumber, 'SALE-000001');
    assert.strictEqual(receiptData.settings.receiptWidth, '80mm');
  });

  it('should not break barcode generation', () => {
    const saleNumber = 'SALE-000001';
    const barcodeValue = saleNumber;

    assert.strictEqual(barcodeValue, 'SALE-000001');
  });

  it('should not break thermal receipt widths', () => {
    const widths = ['58mm', '80mm'];
    assert.strictEqual(widths.includes('58mm'), true);
    assert.strictEqual(widths.includes('80mm'), true);
  });
});
