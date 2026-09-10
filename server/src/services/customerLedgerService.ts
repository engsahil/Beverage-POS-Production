import prisma from '../lib/prisma.js';
import { toDecimal } from './calculationService.js';

export interface CreateLedgerEntryInput {
  businessId: string;
  customerId: string;
  ledgerDate: Date;
  referenceType: string;
  referenceId?: string;
  description: string;
  debit?: number;
  credit?: number;
  userId: string;
  notes?: string;
}

export async function createLedgerEntry(input: CreateLedgerEntryInput) {
  const { businessId, customerId, debit = 0, credit = 0 } = input;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  const lastEntry = await prisma.customerLedger.findFirst({
    where: { customerId },
    orderBy: { ledgerDate: 'desc' },
    select: { balance: true },
  });

  const previousBalance = lastEntry ? toDecimal(lastEntry.balance) : toDecimal(0);
  const newBalance = previousBalance.plus(toDecimal(debit)).minus(toDecimal(credit));

  const entry = await prisma.customerLedger.create({
    data: {
      businessId,
      customerId,
      ledgerDate: input.ledgerDate,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      debit,
      credit,
      balance: newBalance,
      userId: input.userId,
      notes: input.notes,
    },
  });

  await prisma.customer.update({
    where: { id: customerId },
    data: { currentBalance: newBalance },
  });

  return {
    entry,
    previousBalance: Number(previousBalance),
    newBalance: Number(newBalance),
  };
}

export async function getCustomerLedger(
  customerId: string,
  businessId: string,
  params: {
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  } = {}
) {
  const { startDate, endDate, page = 1, limit = 50 } = params;

  const where: any = { customerId, businessId };

  if (startDate || endDate) {
    where.ledgerDate = {};
    if (startDate) where.ledgerDate.gte = startDate;
    if (endDate) where.ledgerDate.lte = endDate;
  }

  const [entries, total] = await Promise.all([
    prisma.customerLedger.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { ledgerDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customerLedger.count({ where }),
  ]);

  return {
    data: entries,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCustomerStatement(
  customerId: string,
  businessId: string,
  params: {
    startDate: Date;
    endDate: Date;
  }
) {
  const { startDate, endDate } = params;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: {
      business: { select: { name: true, address: true, phone: true } },
    },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  const openingEntry = await prisma.customerLedger.findFirst({
    where: {
      customerId,
      ledgerDate: { lt: startDate },
    },
    orderBy: { ledgerDate: 'desc' },
    select: { balance: true },
  });

  const openingBalance = openingEntry ? Number(openingEntry.balance) : 0;

  const transactions = await prisma.customerLedger.findMany({
    where: {
      customerId,
      ledgerDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      user: { select: { fullName: true } },
    },
    orderBy: { ledgerDate: 'asc' },
  });

  const totalDebit = transactions.reduce((sum, t) => sum + Number(t.debit), 0);
  const totalCredit = transactions.reduce((sum, t) => sum + Number(t.credit), 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
      address: customer.address,
      creditLimit: Number(customer.creditLimit),
    },
    business: customer.business,
    period: {
      startDate,
      endDate,
    },
    openingBalance,
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.ledgerDate,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      description: t.description,
      debit: Number(t.debit),
      credit: Number(t.credit),
      balance: Number(t.balance),
      user: t.user.fullName,
      notes: t.notes,
    })),
    summary: {
      totalDebit,
      totalCredit,
      closingBalance,
    },
  };
}
