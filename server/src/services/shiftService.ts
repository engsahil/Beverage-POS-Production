import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';
import { sendShiftClosingReport } from './whatsapp/whatsappService.js';
import { logger } from '../lib/logger.js';

export interface OpenShiftInput {
  businessId: string;
  branchId: string;
  cashierId: string;
  openingCash: number;
  openingNotes?: string;
}

export interface CloseShiftInput {
  actualCash: number;
  closingNotes?: string;
  differenceReason?: string;
}

/**
 * Generate shift number (SHIFT-XXXXXX)
 */
async function generateShiftNumber(businessId: string): Promise<string> {
  const latest = await prisma.cashierShift.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { shiftNumber: true },
  });

  let next = 1;
  if (latest) {
    const match = latest.shiftNumber.match(/SHIFT-(\d+)/);
    if (match) {
      next = parseInt(match[1], 10) + 1;
    }
  }

  return `SHIFT-${String(next).padStart(6, '0')}`;
}

/**
 * Open a new shift
 */
export async function openShift(
  input: OpenShiftInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate opening cash
  if (input.openingCash < 0) {
    throw new Error('Opening cash cannot be negative');
  }

  // Check for existing open shift for this cashier at this branch
  const existingShift = await prisma.cashierShift.findFirst({
    where: {
      businessId: input.businessId,
      branchId: input.branchId,
      cashierId: input.cashierId,
      status: 'OPEN',
    },
  });

  if (existingShift) {
    throw new Error('Cashier already has an open shift at this branch');
  }

  // Validate cashier belongs to business
  const cashier = await prisma.user.findFirst({
    where: { id: input.cashierId, businessId: input.businessId, isActive: true },
  });

  if (!cashier) {
    throw new Error('Cashier not found or inactive');
  }

  // Validate branch belongs to business
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  const shiftNumber = await generateShiftNumber(input.businessId);

  const shift = await prisma.cashierShift.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      cashierId: input.cashierId,
      shiftNumber,
      openingDate: new Date(),
      openingCash: new Decimal(input.openingCash),
      status: 'OPEN',
      openingNotes: input.openingNotes,
      openedBy: userId,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      cashier: { select: { id: true, username: true, fullName: true } },
      opener: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.SHIFT_OPENED,
    entityType: 'cashier_shift',
    entityId: shift.id,
    newValues: {
      shiftNumber,
      cashierId: input.cashierId,
      branchId: input.branchId,
      openingCash: input.openingCash,
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.SHIFT_OPENED,
    input.businessId,
    userId,
    input.branchId
  );

  eventEmitter.emitToBranch({
    ...event,
    eventType: RealtimeEvents.SHIFT_OPENED,
    data: {
      shiftId: shift.id,
      shiftNumber,
      cashierId: input.cashierId,
      cashierName: shift.cashier.fullName,
      openingCash: String(input.openingCash),
      openedAt: shift.openingDate.toISOString(),
    },
  } as any);

  return shift;
}

/**
 * Get active shift for a cashier at a branch
 */
export async function getActiveShift(
  businessId: string,
  cashierId: string,
  branchId: string
) {
  const shift = await prisma.cashierShift.findFirst({
    where: {
      businessId,
      cashierId,
      branchId,
      status: 'OPEN',
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      cashier: { select: { id: true, username: true, fullName: true } },
      opener: { select: { id: true, username: true, fullName: true } },
    },
  });

  if (!shift) {
    return null;
  }

  // Calculate current shift totals
  const totals = await calculateShiftTotals(shift.id, businessId);

  return {
    ...shift,
    ...totals,
  };
}

/**
 * Calculate shift totals from sales
 */
async function calculateShiftTotals(shiftId: string, businessId: string) {
  const sales = await prisma.sale.findMany({
    where: {
      shiftId,
      businessId,
      status: 'COMPLETED',
    },
    include: {
      payments: true,
    },
  });

  let salesTotal = new Decimal(0);
  let cashSales = new Decimal(0);
  let cardSales = new Decimal(0);
  let bankTransferSales = new Decimal(0);
  let otherSales = new Decimal(0);

  for (const sale of sales) {
    salesTotal = salesTotal.plus(sale.total);

    for (const payment of sale.payments) {
      if (payment.paymentMethod === 'CASH') {
        cashSales = cashSales.plus(payment.amount);
      } else if (payment.paymentMethod === 'CARD') {
        cardSales = cardSales.plus(payment.amount);
      } else if (payment.paymentMethod === 'BANK_TRANSFER') {
        bankTransferSales = bankTransferSales.plus(payment.amount);
      } else {
        otherSales = otherSales.plus(payment.amount);
      }
    }
  }

  // Calculate voided and refunded totals
  const voidedSales = await prisma.sale.aggregate({
    where: {
      shiftId,
      businessId,
      status: 'VOIDED',
    },
    _sum: { total: true },
  });

  const refundedSales = await prisma.sale.aggregate({
    where: {
      shiftId,
      businessId,
      status: 'REFUNDED',
    },
    _sum: { total: true },
  });

  const voidTotal = voidedSales._sum.total || new Decimal(0);
  const refundTotal = refundedSales._sum.total || new Decimal(0);

  // Expected cash = opening cash + cash sales
  const shift = await prisma.cashierShift.findUnique({
    where: { id: shiftId },
  });

  const expectedCash = shift ? shift.openingCash.plus(cashSales) : cashSales;

  return {
    salesTotal,
    cashSales,
    cardSales,
    bankTransferSales,
    otherSales,
    voidTotal,
    refundTotal,
    expectedCash,
    saleCount: sales.length,
  };
}

/**
 * Close a shift
 */
export async function closeShift(
  shiftId: string,
  businessId: string,
  input: CloseShiftInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: shiftId, businessId },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.status !== 'OPEN') {
    throw new Error('Only open shifts can be closed');
  }

  if (input.actualCash < 0) {
    throw new Error('Actual cash cannot be negative');
  }

  // Calculate shift totals
  const totals = await calculateShiftTotals(shiftId, businessId);

  const actualCash = new Decimal(input.actualCash);
  const cashDifference = actualCash.minus(totals.expectedCash);

  // Require reason for significant discrepancies (more than Rs. 100)
  if (cashDifference.abs().greaterThan(100) && !input.differenceReason) {
    throw new Error('Reason required for cash difference greater than Rs. 100');
  }

  const updated = await prisma.cashierShift.update({
    where: { id: shiftId },
    data: {
      status: 'CLOSED',
      closingDate: new Date(),
      expectedCash: totals.expectedCash,
      actualCash,
      cashDifference,
      salesTotal: totals.salesTotal,
      cashSales: totals.cashSales,
      cardSales: totals.cardSales,
      bankTransferSales: totals.bankTransferSales,
      otherSales: totals.otherSales,
      refundTotal: totals.refundTotal,
      voidTotal: totals.voidTotal,
      closingNotes: input.closingNotes,
      differenceReason: input.differenceReason,
      closedBy: userId,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      cashier: { select: { id: true, username: true, fullName: true } },
      opener: { select: { id: true, username: true, fullName: true } },
      closer: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.SHIFT_CLOSED,
    entityType: 'cashier_shift',
    entityId: shiftId,
    oldValues: { status: shift.status },
    newValues: {
      status: 'CLOSED',
      expectedCash: totals.expectedCash.toString(),
      actualCash: input.actualCash,
      cashDifference: cashDifference.toString(),
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.SHIFT_CLOSED,
    businessId,
    userId,
    shift.branchId
  );

  eventEmitter.emitToBranch({
    ...event,
    eventType: RealtimeEvents.SHIFT_CLOSED,
    data: {
      shiftId,
      shiftNumber: shift.shiftNumber,
      cashierId: shift.cashierId,
      cashierName: updated.cashier.fullName,
      salesTotal: String(totals.salesTotal),
      cashDifference: String(cashDifference),
      closedAt: updated.closingDate?.toISOString() || new Date().toISOString(),
    },
  } as any);

  // Send WhatsApp closing report (non-blocking, fire and forget)
  sendShiftClosingReport({
    businessId,
    shiftId,
    userId,
  }).catch((error) => {
    logger.error('Failed to send WhatsApp shift closing report', {
      shiftId,
      businessId,
      error: String(error),
    });
  });

  return updated;
}

/**
 * Get shifts with filtering
 */
export async function getShifts(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    cashierId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    branchId,
    cashierId,
    status,
    startDate,
    endDate,
  } = params;

  const where: Prisma.CashierShiftWhereInput = { businessId };

  if (branchId) where.branchId = branchId;
  if (cashierId) where.cashierId = cashierId;
  if (status) where.status = status;

  if (startDate || endDate) {
    where.openingDate = {};
    if (startDate) (where.openingDate as any).gte = startDate;
    if (endDate) (where.openingDate as any).lte = endDate;
  }

  const [shifts, total] = await Promise.all([
    prisma.cashierShift.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, username: true, fullName: true } },
        opener: { select: { id: true, username: true, fullName: true } },
        closer: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { openingDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cashierShift.count({ where }),
  ]);

  return {
    data: shifts,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get shift by ID
 */
export async function getShiftById(shiftId: string, businessId: string) {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: shiftId, businessId },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      cashier: { select: { id: true, username: true, fullName: true } },
      opener: { select: { id: true, username: true, fullName: true } },
      closer: { select: { id: true, username: true, fullName: true } },
    },
  });

  if (!shift) {
    return null;
  }

  // If shift is open, calculate current totals
  if (shift.status === 'OPEN') {
    const totals = await calculateShiftTotals(shiftId, businessId);
    return {
      ...shift,
      ...totals,
    };
  }

  return shift;
}

/**
 * Admin override: close shift on behalf of cashier
 */
export async function adminCloseShift(
  shiftId: string,
  businessId: string,
  input: CloseShiftInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: shiftId, businessId },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.status !== 'OPEN') {
    throw new Error('Only open shifts can be closed');
  }

  // Close the shift
  const result = await closeShift(shiftId, businessId, input, userId, ipAddress, userAgent);

  // Log override
  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.SHIFT_OVERRIDE,
    entityType: 'cashier_shift',
    entityId: shiftId,
    newValues: {
      overrideReason: 'Admin override close',
      originalCashier: shift.cashierId,
    },
    ipAddress,
    userAgent,
  });

  return result;
}

/**
 * Cancel a shift (admin only)
 */
export async function cancelShift(
  shiftId: string,
  businessId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const shift = await prisma.cashierShift.findFirst({
    where: { id: shiftId, businessId },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.status !== 'OPEN') {
    throw new Error('Only open shifts can be cancelled');
  }

  const updated = await prisma.cashierShift.update({
    where: { id: shiftId },
    data: {
      status: 'CANCELLED',
      closingDate: new Date(),
      closingNotes: `Cancelled: ${reason}`,
      closedBy: userId,
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.SHIFT_CANCELLED,
    entityType: 'cashier_shift',
    entityId: shiftId,
    oldValues: { status: shift.status },
    newValues: { status: 'CANCELLED', reason },
    ipAddress,
    userAgent,
  });

  return updated;
}
