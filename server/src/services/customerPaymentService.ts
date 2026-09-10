import prisma from '../lib/prisma.js';
import { toDecimal } from './calculationService.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';

export interface CreateCustomerPaymentInput {
  businessId: string;
  customerId: string;
  paymentDate: Date;
  paymentMethod: string;
  amount: number;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey?: string;
  userId: string;
}

export async function createCustomerPayment(
  input: CreateCustomerPaymentInput,
  ipAddress?: string,
  userAgent?: string
) {
  if (input.idempotencyKey) {
    const existing = await prisma.customerPayment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      throw new Error('Duplicate payment submission detected');
    }
  }

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId: input.businessId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  if (customer.status !== 'ACTIVE') {
    throw new Error('Cannot record payment for inactive customer');
  }

  if (input.amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const validPaymentMethods = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
  if (!validPaymentMethods.includes(input.paymentMethod)) {
    throw new Error(`Invalid payment method: ${input.paymentMethod}`);
  }

  const previousBalance = toDecimal(customer.currentBalance);
  const newBalance = previousBalance.minus(toDecimal(input.amount));

  const payment = await prisma.$transaction(async (tx) => {
    const newPayment = await tx.customerPayment.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        referenceNumber: input.referenceNumber,
        previousBalance: previousBalance,
        newBalance: newBalance,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
      },
    });

    await tx.customer.update({
      where: { id: input.customerId },
      data: { currentBalance: newBalance },
    });

    await tx.customerLedger.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        ledgerDate: input.paymentDate,
        referenceType: 'PAYMENT',
        referenceId: newPayment.id,
        description: `Payment received via ${input.paymentMethod}`,
        debit: 0,
        credit: input.amount,
        balance: newBalance,
        userId: input.userId,
        notes: input.notes,
      },
    });

    return newPayment;
  });

  await createAuditLog({
    businessId: input.businessId,
    userId: input.userId,
    action: AuditActions.CUSTOMER_PAYMENT_RECORDED,
    entityType: 'customer_payment',
    entityId: payment.id,
    newValues: {
      customerId: input.customerId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      previousBalance: Number(previousBalance),
      newBalance: Number(newBalance),
    },
    ipAddress,
    userAgent,
  });

  // Emit realtime event AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.CUSTOMER_RECOVERY_RECORDED,
    input.businessId,
    input.userId
  );

  eventEmitter.emitToBusiness({
    ...event,
    eventType: RealtimeEvents.CUSTOMER_RECOVERY_RECORDED,
    data: {
      paymentId: payment.id,
      customerId: input.customerId,
      customerName: customer.name,
      amount: String(input.amount),
      paymentMethod: input.paymentMethod,
      previousBalance: String(previousBalance),
      newBalance: String(newBalance),
    },
  } as any);

  return payment;
}

export async function getCustomerPayments(
  customerId: string,
  businessId: string,
  params: {
    page?: number;
    limit?: number;
  } = {}
) {
  const { page = 1, limit = 20 } = params;

  const where = { customerId, businessId };

  const [payments, total] = await Promise.all([
    prisma.customerPayment.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { paymentDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customerPayment.count({ where }),
  ]);

  return {
    data: payments,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * List recent customer payments across all customers (for the
 * Customer Payments admin page).
 */
export async function listCustomerPayments(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
  } = {}
) {
  const { page = 1, limit = 20 } = params;

  const where = { businessId };

  const [payments, total] = await Promise.all([
    prisma.customerPayment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { paymentDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customerPayment.count({ where }),
  ]);

  return {
    data: payments,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
