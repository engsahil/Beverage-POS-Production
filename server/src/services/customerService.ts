import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { toDecimal } from './calculationService.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';

export interface CreateCustomerInput {
  businessId: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  creditLimit?: number;
  openingBalance?: number;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  creditLimit?: number;
  status?: string;
}

/**
 * Create a new customer
 */
export async function createCustomer(
  input: CreateCustomerInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate business
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
  });

  if (!business) {
    throw new Error('Business not found');
  }

  // Check for duplicate phone
  if (input.phone) {
    const existing = await prisma.customer.findFirst({
      where: {
        businessId: input.businessId,
        phone: input.phone,
      },
    });

    if (existing) {
      throw new Error('Customer with this phone number already exists');
    }
  }

  // Create customer with optional opening balance
  const customer = await prisma.$transaction(async (tx) => {
    const newCustomer = await tx.customer.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        address: input.address,
        city: input.city,
        notes: input.notes,
        creditLimit: input.creditLimit || 0,
        currentBalance: input.openingBalance || 0,
        status: 'ACTIVE',
        createdBy: userId,
      },
    });

    // Create opening balance ledger entry if provided
    if (input.openingBalance && input.openingBalance !== 0) {
      await tx.customerLedger.create({
        data: {
          businessId: input.businessId,
          customerId: newCustomer.id,
          ledgerDate: new Date(),
          referenceType: 'OPENING_BALANCE',
          description: 'Opening balance',
          debit: input.openingBalance > 0 ? input.openingBalance : 0,
          credit: input.openingBalance < 0 ? Math.abs(input.openingBalance) : 0,
          balance: input.openingBalance,
          userId: userId,
        },
      });
    }

    return newCustomer;
  });

  // Audit log
  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.CUSTOMER_CREATED,
    entityType: 'customer',
    entityId: customer.id,
    newValues: {
      name: customer.name,
      phone: customer.phone,
      creditLimit: customer.creditLimit,
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.CUSTOMER_CREATED,
    input.businessId,
    userId
  );

  eventEmitter.emitToBusiness({
    ...event,
    eventType: RealtimeEvents.CUSTOMER_CREATED,
    data: {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone || undefined,
      creditLimit: String(customer.creditLimit),
    },
  } as any);

  return customer;
}

/**
 * Update customer
 */
export async function updateCustomer(
  customerId: string,
  businessId: string,
  input: UpdateCustomerInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Check for duplicate phone if changing
  if (input.phone && input.phone !== customer.phone) {
    const existing = await prisma.customer.findFirst({
      where: {
        businessId,
        phone: input.phone,
        id: { not: customerId },
      },
    });

    if (existing) {
      throw new Error('Customer with this phone number already exists');
    }
  }

  // Track credit limit changes for audit
  const oldCreditLimit = customer.creditLimit;
  const newCreditLimit = input.creditLimit !== undefined ? input.creditLimit : oldCreditLimit;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: input.name,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      address: input.address,
      city: input.city,
      notes: input.notes,
      creditLimit: input.creditLimit,
      status: input.status,
    },
  });

  // Audit log for credit limit change
  if (newCreditLimit !== oldCreditLimit) {
    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.CUSTOMER_CREDIT_LIMIT_CHANGED,
      entityType: 'customer',
      entityId: customerId,
      oldValues: { creditLimit: Number(oldCreditLimit) },
      newValues: { creditLimit: Number(newCreditLimit) },
      ipAddress,
      userAgent,
    });

    // Emit credit change event
    const creditEvent = eventEmitter.createBaseEvent(
      RealtimeEvents.CUSTOMER_CREDIT_CHANGED,
      businessId,
      userId
    );

    eventEmitter.emitToBusiness({
      ...creditEvent,
      eventType: RealtimeEvents.CUSTOMER_CREDIT_CHANGED,
      data: {
        customerId,
        customerName: customer.name,
        previousBalance: String(customer.currentBalance),
        newBalance: String(customer.currentBalance),
        changeAmount: String(Number(newCreditLimit) - Number(oldCreditLimit)),
        referenceType: 'ADJUSTMENT',
        referenceId: customerId,
      },
    } as any);
  }

  // General update audit
  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.CUSTOMER_UPDATED,
    entityType: 'customer',
    entityId: customerId,
    newValues: input as any,
    ipAddress,
    userAgent,
  });

  // Emit customer updated event
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.CUSTOMER_UPDATED,
    businessId,
    userId
  );

  const changes = Object.keys(input).filter((key) => {
    const k = key as keyof typeof input;
    return input[k] !== undefined;
  });

  eventEmitter.emitToBusiness({
    ...event,
    eventType: RealtimeEvents.CUSTOMER_UPDATED,
    data: {
      customerId,
      name: updated.name,
      changes,
    },
  } as any);

  return updated;
}

/**
 * Get customer by ID
 */
export async function getCustomerById(customerId: string, businessId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: {
      creator: { select: { id: true, username: true, fullName: true } },
      _count: {
        select: {
          sales: true,
          ledgerEntries: true,
          payments: true,
        },
      },
    },
  });
}

/**
 * Search customers
 */
export async function searchCustomers(
  businessId: string,
  params: {
    search?: string;
    status?: string;
    hasBalance?: boolean;
    page?: number;
    limit?: number;
  } = {}
) {
  const { search, status, hasBalance, page = 1, limit = 20 } = params;

  const where: any = { businessId };

  if (status) {
    where.status = status;
  }

  if (hasBalance) {
    where.currentBalance = { gt: 0 };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { whatsapp: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data: customers,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get customer balance
 */
export async function getCustomerBalance(customerId: string, businessId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { currentBalance: true, creditLimit: true },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  return {
    currentBalance: Number(customer.currentBalance),
    creditLimit: Number(customer.creditLimit),
    availableCredit: Number(customer.creditLimit) - Number(customer.currentBalance),
  };
}

/**
 * Check if customer can take credit
 */
export async function canCustomerTakeCredit(
  customerId: string,
  businessId: string,
  creditAmount: number
): Promise<{ allowed: boolean; reason?: string }> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { currentBalance: true, creditLimit: true, status: true },
  });

  if (!customer) {
    return { allowed: false, reason: 'Customer not found' };
  }

  if (customer.status !== 'ACTIVE') {
    return { allowed: false, reason: 'Customer is inactive' };
  }

  const currentBalance = toDecimal(customer.currentBalance);
  const creditLimit = toDecimal(customer.creditLimit);
  const newBalance = currentBalance.plus(toDecimal(creditAmount));

  if (creditLimit.equals(0)) {
    return { allowed: false, reason: 'Customer has no credit limit configured' };
  }

  if (newBalance.greaterThan(creditLimit)) {
    return {
      allowed: false,
      reason: `Credit limit exceeded. Current: Rs. ${currentBalance.toFixed(2)}, Limit: Rs. ${creditLimit.toFixed(2)}, Requested: Rs. ${creditAmount.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

/**
 * Update customer balance (internal use only)
 */
export async function updateCustomerBalance(
  customerId: string,
  businessId: string,
  amountChange: number
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  const currentBalance = toDecimal(customer.currentBalance);
  const newBalance = currentBalance.plus(toDecimal(amountChange));

  await prisma.customer.update({
    where: { id: customerId },
    data: { currentBalance: newBalance },
  });

  return newBalance;
}
