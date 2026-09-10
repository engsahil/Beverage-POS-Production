import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';

export interface OpenDayInput {
  businessId: string;
  branchId: string;
  businessDate: Date;
  notes?: string;
}

export interface CloseDayInput {
  notes?: string;
}

/**
 * Open a business day
 */
export async function openDay(
  input: OpenDayInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check if day is already open
  const existing = await prisma.dailyRecord.findFirst({
    where: {
      businessId: input.businessId,
      branchId: input.branchId,
      businessDate: input.businessDate,
    },
  });

  if (existing) {
    throw new Error('Business day already exists for this date');
  }

  // Validate branch belongs to business
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  const record = await prisma.dailyRecord.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      businessDate: input.businessDate,
      status: 'OPEN',
      openedAt: new Date(),
      openedBy: userId,
      notes: input.notes,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      opener: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.DAILY_OPENED,
    entityType: 'daily_record',
    entityId: record.id,
    newValues: {
      branchId: input.branchId,
      businessDate: input.businessDate.toISOString(),
    },
    ipAddress,
    userAgent,
  });

  return record;
}

/**
 * Close a business day
 */
export async function closeDay(
  recordId: string,
  businessId: string,
  input: CloseDayInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const record = await prisma.dailyRecord.findFirst({
    where: { id: recordId, businessId },
  });

  if (!record) {
    throw new Error('Daily record not found');
  }

  if (record.status !== 'OPEN') {
    throw new Error('Only open days can be closed');
  }

  // Check for open shifts
  const openShifts = await prisma.cashierShift.count({
    where: {
      businessId,
      branchId: record.branchId,
      status: 'OPEN',
      openingDate: {
        gte: record.businessDate,
        lt: new Date(record.businessDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
  });

  if (openShifts > 0) {
    throw new Error(`Cannot close day: ${openShifts} shift(s) still open`);
  }

  const updated = await prisma.dailyRecord.update({
    where: { id: recordId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedBy: userId,
      notes: input.notes ? `${record.notes || ''}\nClosing: ${input.notes}`.trim() : record.notes,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      opener: { select: { id: true, username: true, fullName: true } },
      closer: { select: { id: true, username: true, fullName: true } },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.DAILY_CLOSED,
    entityType: 'daily_record',
    entityId: recordId,
    oldValues: { status: record.status },
    newValues: { status: 'CLOSED' },
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Get daily records with filtering
 */
export async function getDailyRecords(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    branchId,
    status,
    startDate,
    endDate,
  } = params;

  const where: Prisma.DailyRecordWhereInput = { businessId };

  if (branchId) where.branchId = branchId;
  if (status) where.status = status;

  if (startDate || endDate) {
    where.businessDate = {};
    if (startDate) (where.businessDate as any).gte = startDate;
    if (endDate) (where.businessDate as any).lte = endDate;
  }

  const [records, total] = await Promise.all([
    prisma.dailyRecord.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        opener: { select: { id: true, username: true, fullName: true } },
        closer: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { businessDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dailyRecord.count({ where }),
  ]);

  return {
    data: records,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get daily record by ID
 */
export async function getDailyRecordById(recordId: string, businessId: string) {
  return prisma.dailyRecord.findFirst({
    where: { id: recordId, businessId },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      opener: { select: { id: true, username: true, fullName: true } },
      closer: { select: { id: true, username: true, fullName: true } },
    },
  });
}

/**
 * Get current day status for a branch
 */
export async function getCurrentDayStatus(businessId: string, branchId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const record = await prisma.dailyRecord.findFirst({
    where: {
      businessId,
      branchId,
      businessDate: today,
    },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      opener: { select: { id: true, username: true, fullName: true } },
      closer: { select: { id: true, username: true, fullName: true } },
    },
  });

  if (!record) {
    return {
      isOpen: false,
      record: null,
    };
  }

  return {
    isOpen: record.status === 'OPEN',
    record,
  };
}

/**
 * Get daily summary (shifts and totals for a day)
 */
export async function getDailySummary(recordId: string, businessId: string) {
  const record = await prisma.dailyRecord.findFirst({
    where: { id: recordId, businessId },
  });

  if (!record) {
    throw new Error('Daily record not found');
  }

  // Get all shifts for this day
  const shifts = await prisma.cashierShift.findMany({
    where: {
      businessId,
      branchId: record.branchId,
      openingDate: {
        gte: record.businessDate,
        lt: new Date(record.businessDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    include: {
      cashier: { select: { id: true, username: true, fullName: true } },
    },
    orderBy: { openingDate: 'asc' },
  });

  // Calculate totals
  const totalSales = shifts.reduce(
    (sum, s) => sum.plus(s.salesTotal),
    new (await import('@prisma/client/runtime/library.js')).Decimal(0)
  );

  const totalCash = shifts.reduce(
    (sum, s) => sum.plus(s.cashSales),
    new (await import('@prisma/client/runtime/library.js')).Decimal(0)
  );

  const totalCard = shifts.reduce(
    (sum, s) => sum.plus(s.cardSales),
    new (await import('@prisma/client/runtime/library.js')).Decimal(0)
  );

  return {
    record,
    shifts,
    summary: {
      totalShifts: shifts.length,
      openShifts: shifts.filter(s => s.status === 'OPEN').length,
      closedShifts: shifts.filter(s => s.status === 'CLOSED').length,
      totalSales,
      totalCash,
      totalCard,
    },
  };
}
