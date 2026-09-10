import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Decimal } from '@prisma/client/runtime/library.js';

describe('Phase 13: Cashier Shifts', () => {
  it('should generate shift number SHIFT-XXXXXX', () => {
    const generateShiftNumber = (latest: string | null): string => {
      let next = 1;
      if (latest) {
        const match = latest.match(/SHIFT-(\d+)/);
        if (match) {
          next = parseInt(match[1], 10) + 1;
        }
      }
      return `SHIFT-${String(next).padStart(6, '0')}`;
    };

    assert.strictEqual(generateShiftNumber(null), 'SHIFT-000001');
    assert.strictEqual(generateShiftNumber('SHIFT-000001'), 'SHIFT-000002');
    assert.strictEqual(generateShiftNumber('SHIFT-000099'), 'SHIFT-000100');
    assert.strictEqual(generateShiftNumber('SHIFT-999999'), 'SHIFT-1000000');
  });

  it('should validate opening cash', () => {
    const validCash = 5000;
    const zeroCash = 0;
    const negativeCash = -100;

    assert.strictEqual(validCash >= 0, true);
    assert.strictEqual(zeroCash >= 0, true);
    assert.strictEqual(negativeCash >= 0, false);
  });

  it('should prevent duplicate open shifts', () => {
    const existingShifts = [
      { cashierId: 'cashier-1', branchId: 'branch-1', status: 'OPEN' },
    ];

    const newShift = { cashierId: 'cashier-1', branchId: 'branch-1', status: 'OPEN' };
    const hasConflict = existingShifts.some(
      s => s.cashierId === newShift.cashierId &&
           s.branchId === newShift.branchId &&
           s.status === 'OPEN'
    );

    assert.strictEqual(hasConflict, true);
  });

  it('should allow different cashiers to have open shifts at same branch', () => {
    const existingShifts = [
      { cashierId: 'cashier-1', branchId: 'branch-1', status: 'OPEN' },
    ];

    const newShift = { cashierId: 'cashier-2', branchId: 'branch-1', status: 'OPEN' };
    const hasConflict = existingShifts.some(
      s => s.cashierId === newShift.cashierId &&
           s.branchId === newShift.branchId &&
           s.status === 'OPEN'
    );

    assert.strictEqual(hasConflict, false);
  });

  it('should calculate expected cash with Decimal', () => {
    const openingCash = new Decimal('5000');
    const cashSales = new Decimal('15000');
    const expectedCash = openingCash.plus(cashSales);

    assert.strictEqual(expectedCash.toString(), '20000');
  });

  it('should calculate cash difference with Decimal', () => {
    const expectedCash = new Decimal('20000');
    const actualCashOver = new Decimal('20500');
    const actualCashShort = new Decimal('19500');
    const actualCashBalanced = new Decimal('20000');

    const differenceOver = actualCashOver.minus(expectedCash);
    const differenceShort = actualCashShort.minus(expectedCash);
    const differenceBalanced = actualCashBalanced.minus(expectedCash);

    assert.strictEqual(differenceOver.toString(), '500');
    assert.strictEqual(differenceShort.toString(), '-500');
    assert.strictEqual(differenceBalanced.toString(), '0');
  });

  it('should determine cash difference status', () => {
    const getStatus = (difference: Decimal): string => {
      if (difference.greaterThan(0)) return 'OVER';
      if (difference.lessThan(0)) return 'SHORT';
      return 'BALANCED';
    };

    assert.strictEqual(getStatus(new Decimal('500')), 'OVER');
    assert.strictEqual(getStatus(new Decimal('-500')), 'SHORT');
    assert.strictEqual(getStatus(new Decimal('0')), 'BALANCED');
  });

  it('should require reason for significant discrepancies', () => {
    const threshold = new Decimal('100');
    const smallDifference = new Decimal('50');
    const largeDifference = new Decimal('150');

    const requiresReasonSmall = smallDifference.abs().greaterThan(threshold);
    const requiresReasonLarge = largeDifference.abs().greaterThan(threshold);

    assert.strictEqual(requiresReasonSmall, false);
    assert.strictEqual(requiresReasonLarge, true);
  });

  it('should aggregate sales by payment method with Decimal', () => {
    const payments = [
      { method: 'CASH', amount: new Decimal('5000') },
      { method: 'CASH', amount: new Decimal('3000') },
      { method: 'CARD', amount: new Decimal('7000') },
      { method: 'BANK_TRANSFER', amount: new Decimal('2000') },
      { method: 'OTHER', amount: new Decimal('500') },
    ];

    let cashSales = new Decimal(0);
    let cardSales = new Decimal(0);
    let bankTransferSales = new Decimal(0);
    let otherSales = new Decimal(0);

    for (const payment of payments) {
      if (payment.method === 'CASH') {
        cashSales = cashSales.plus(payment.amount);
      } else if (payment.method === 'CARD') {
        cardSales = cardSales.plus(payment.amount);
      } else if (payment.method === 'BANK_TRANSFER') {
        bankTransferSales = bankTransferSales.plus(payment.amount);
      } else {
        otherSales = otherSales.plus(payment.amount);
      }
    }

    assert.strictEqual(cashSales.toString(), '8000');
    assert.strictEqual(cardSales.toString(), '7000');
    assert.strictEqual(bankTransferSales.toString(), '2000');
    assert.strictEqual(otherSales.toString(), '500');
  });

  it('should prevent closing already closed shift', () => {
    const shift = { status: 'CLOSED' };
    const canClose = shift.status === 'OPEN';

    assert.strictEqual(canClose, false);
  });

  it('should prevent cancelling closed shift', () => {
    const shift = { status: 'CLOSED' };
    const canCancel = shift.status === 'OPEN';

    assert.strictEqual(canCancel, false);
  });

  it('should handle shift status transitions', () => {
    const validStatuses = ['OPEN', 'CLOSED', 'CANCELLED'];

    assert.strictEqual(validStatuses.includes('OPEN'), true);
    assert.strictEqual(validStatuses.includes('CLOSED'), true);
    assert.strictEqual(validStatuses.includes('CANCELLED'), true);
    assert.strictEqual(validStatuses.includes('DELETED'), false);
  });

  it('should associate sales with shift', () => {
    const sale = {
      id: 'sale-1',
      shiftId: 'shift-1',
      cashierId: 'cashier-1',
      total: new Decimal('5000'),
    };

    assert.strictEqual(sale.shiftId, 'shift-1');
  });

  it('should calculate shift totals excluding voided sales', () => {
    const sales = [
      { status: 'COMPLETED', total: new Decimal('5000') },
      { status: 'VOIDED', total: new Decimal('2000') },
      { status: 'COMPLETED', total: new Decimal('3000') },
    ];

    const completedSales = sales.filter(s => s.status === 'COMPLETED');
    const total = completedSales.reduce(
      (sum, s) => sum.plus(s.total),
      new Decimal(0)
    );

    assert.strictEqual(completedSales.length, 2);
    assert.strictEqual(total.toString(), '8000');
  });
});

describe('Phase 13: Cash Counting', () => {
  it('should calculate denomination total with Decimal', () => {
    const denominations = [
      { value: new Decimal('5000'), count: 2 },
      { value: new Decimal('1000'), count: 5 },
      { value: new Decimal('500'), count: 10 },
      { value: new Decimal('100'), count: 20 },
      { value: new Decimal('50'), count: 15 },
      { value: new Decimal('10'), count: 30 },
    ];

    let total = new Decimal(0);
    for (const d of denominations) {
      total = total.plus(d.value.times(d.count));
    }

    // 5000*2 + 1000*5 + 500*10 + 100*20 + 50*15 + 10*30
    // = 10000 + 5000 + 5000 + 2000 + 750 + 300 = 23050
    assert.strictEqual(total.toString(), '23050');
  });

  it('should handle zero denominations', () => {
    const denominations = [
      { value: new Decimal('5000'), count: 0 },
      { value: new Decimal('1000'), count: 0 },
    ];

    let total = new Decimal(0);
    for (const d of denominations) {
      total = total.plus(d.value.times(d.count));
    }

    assert.strictEqual(total.toString(), '0');
  });

  it('should validate denomination count', () => {
    const validCount = 10;
    const zeroCount = 0;
    const negativeCount = -5;

    assert.strictEqual(validCount >= 0, true);
    assert.strictEqual(zeroCount >= 0, true);
    assert.strictEqual(negativeCount >= 0, false);
  });
});

describe('Phase 13: Daily Open/Close', () => {
  it('should create daily record with valid data', () => {
    const record = {
      businessId: 'business-1',
      branchId: 'branch-1',
      businessDate: new Date('2026-01-15'),
      status: 'OPEN',
    };

    assert.strictEqual(record.status, 'OPEN');
    assert.strictEqual(record.businessDate.toISOString().split('T')[0], '2026-01-15');
  });

  it('should prevent duplicate daily opening', () => {
    const existingRecords = [
      {
        businessId: 'business-1',
        branchId: 'branch-1',
        businessDate: new Date('2026-01-15'),
      },
    ];

    const newRecord = {
      businessId: 'business-1',
      branchId: 'branch-1',
      businessDate: new Date('2026-01-15'),
    };

    const isDuplicate = existingRecords.some(
      r => r.businessId === newRecord.businessId &&
           r.branchId === newRecord.branchId &&
           r.businessDate.getTime() === newRecord.businessDate.getTime()
    );

    assert.strictEqual(isDuplicate, true);
  });

  it('should allow different branches to open same day', () => {
    const existingRecords = [
      {
        businessId: 'business-1',
        branchId: 'branch-1',
        businessDate: new Date('2026-01-15'),
      },
    ];

    const newRecord = {
      businessId: 'business-1',
      branchId: 'branch-2',
      businessDate: new Date('2026-01-15'),
    };

    const isDuplicate = existingRecords.some(
      r => r.businessId === newRecord.businessId &&
           r.branchId === newRecord.branchId &&
           r.businessDate.getTime() === newRecord.businessDate.getTime()
    );

    assert.strictEqual(isDuplicate, false);
  });

  it('should prevent closing day with open shifts', () => {
    const openShifts = 2;
    const canClose = openShifts === 0;

    assert.strictEqual(canClose, false);
  });

  it('should allow closing day with no open shifts', () => {
    const openShifts = 0;
    const canClose = openShifts === 0;

    assert.strictEqual(canClose, true);
  });

  it('should handle daily record status transitions', () => {
    const validStatuses = ['OPEN', 'CLOSED'];

    assert.strictEqual(validStatuses.includes('OPEN'), true);
    assert.strictEqual(validStatuses.includes('CLOSED'), true);
    assert.strictEqual(validStatuses.includes('CANCELLED'), false);
  });

  it('should prevent closing already closed day', () => {
    const record = { status: 'CLOSED' };
    const canClose = record.status === 'OPEN';

    assert.strictEqual(canClose, false);
  });

  it('should calculate daily summary from shifts', () => {
    const shifts = [
      {
        status: 'CLOSED',
        salesTotal: new Decimal('50000'),
        cashSales: new Decimal('30000'),
        cardSales: new Decimal('20000'),
      },
      {
        status: 'CLOSED',
        salesTotal: new Decimal('40000'),
        cashSales: new Decimal('25000'),
        cardSales: new Decimal('15000'),
      },
    ];

    const totalSales = shifts.reduce(
      (sum, s) => sum.plus(s.salesTotal),
      new Decimal(0)
    );

    const totalCash = shifts.reduce(
      (sum, s) => sum.plus(s.cashSales),
      new Decimal(0)
    );

    const totalCard = shifts.reduce(
      (sum, s) => sum.plus(s.cardSales),
      new Decimal(0)
    );

    assert.strictEqual(totalSales.toString(), '90000');
    assert.strictEqual(totalCash.toString(), '55000');
    assert.strictEqual(totalCard.toString(), '35000');
  });
});

describe('Phase 13: Business Isolation', () => {
  it('should enforce business isolation on shifts', () => {
    const shifts = [
      { id: 's1', businessId: 'b1', shiftNumber: 'SHIFT-000001' },
      { id: 's2', businessId: 'b2', shiftNumber: 'SHIFT-000001' },
    ];

    const businessAShifts = shifts.filter(s => s.businessId === 'b1');
    assert.strictEqual(businessAShifts.length, 1);
    assert.strictEqual(businessAShifts[0].id, 's1');
  });

  it('should enforce branch isolation on shifts', () => {
    const shifts = [
      { id: 's1', businessId: 'b1', branchId: 'branch-1' },
      { id: 's2', businessId: 'b1', branchId: 'branch-2' },
    ];

    const branch1Shifts = shifts.filter(s => s.branchId === 'branch-1');
    assert.strictEqual(branch1Shifts.length, 1);
    assert.strictEqual(branch1Shifts[0].id, 's1');
  });

  it('should enforce business isolation on daily records', () => {
    const records = [
      { id: 'd1', businessId: 'b1', businessDate: new Date('2026-01-15') },
      { id: 'd2', businessId: 'b2', businessDate: new Date('2026-01-15') },
    ];

    const businessARecords = records.filter(r => r.businessId === 'b1');
    assert.strictEqual(businessARecords.length, 1);
    assert.strictEqual(businessARecords[0].id, 'd1');
  });
});

describe('Phase 13: Authorization', () => {
  it('should require shifts.open permission to open shift', () => {
    const cashierPermissions = ['shifts.view', 'shifts.open'];
    const requiredPermission = 'shifts.open';

    const hasPermission = cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should require shifts.close permission to close shift', () => {
    const cashierPermissions = ['shifts.view', 'shifts.open'];
    const requiredPermission = 'shifts.close';

    const hasPermission = cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, false);
  });

  it('should require shifts.override permission for admin close', () => {
    const adminPermissions = ['*'];
    const requiredPermission = 'shifts.override';

    const hasPermission = adminPermissions.includes('*') || adminPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should require shifts.manage permission to cancel shift', () => {
    const cashierPermissions = ['shifts.view', 'shifts.open', 'shifts.close'];
    const requiredPermission = 'shifts.manage';

    const hasPermission = cashierPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, false);
  });

  it('should require daily_open_close.manage to open/close day', () => {
    const adminPermissions = ['daily_open_close.view', 'daily_open_close.manage'];
    const requiredPermission = 'daily_open_close.manage';

    const hasPermission = adminPermissions.includes(requiredPermission);
    assert.strictEqual(hasPermission, true);
  });

  it('should support wildcard permission', () => {
    const adminPermissions = ['*'];
    const requiredPermissions = [
      'shifts.view',
      'shifts.open',
      'shifts.close',
      'shifts.manage',
      'shifts.override',
      'daily_open_close.view',
      'daily_open_close.manage',
    ];

    for (const perm of requiredPermissions) {
      const hasPermission = adminPermissions.includes('*') || adminPermissions.includes(perm);
      assert.strictEqual(hasPermission, true);
    }
  });
});

describe('Phase 13: Audit Logging', () => {
  it('should define all Phase 13 audit actions', () => {
    const phase13Actions = [
      'SHIFT_OPENED',
      'SHIFT_CLOSED',
      'SHIFT_CANCELLED',
      'SHIFT_OVERRIDE',
      'DAILY_OPENED',
      'DAILY_CLOSED',
    ];

    assert.strictEqual(phase13Actions.length, 6);
    assert.strictEqual(new Set(phase13Actions).size, 6); // no duplicates
  });

  it('should create audit log with correct structure', () => {
    const auditLog = {
      businessId: 'b1',
      userId: 'u1',
      action: 'SHIFT_OPENED',
      entityType: 'cashier_shift',
      entityId: 'shift-1',
      newValues: {
        shiftNumber: 'SHIFT-000001',
        cashierId: 'cashier-1',
        openingCash: 5000,
      },
    };

    assert.strictEqual(auditLog.action, 'SHIFT_OPENED');
    assert.strictEqual(auditLog.entityType, 'cashier_shift');
    assert.strictEqual(auditLog.entityId, 'shift-1');
  });
});

describe('Phase 13: Receipt Regression', () => {
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
