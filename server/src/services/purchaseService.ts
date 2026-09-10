import prisma from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { createStockMovement } from './inventoryService.js';
import { MOVEMENT_TYPES, PURCHASE_STATUS, PAYMENT_STATUS } from '../api/validators/schemas.js';
import { logger } from '../lib/logger.js';

export interface CreatePurchaseInput {
  businessId: string;
  branchId: string;
  vendorId: string;
  purchaseDate: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    purchasePrice: number;
    discount?: number;
    tax?: number;
  }>;
  discount?: number;
  tax?: number;
  amountPaid?: number;
  notes?: string;
}

export interface UpdatePurchaseInput {
  vendorId?: string;
  purchaseDate?: string;
  items?: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    purchasePrice: number;
    discount?: number;
    tax?: number;
  }>;
  discount?: number;
  tax?: number;
  amountPaid?: number;
  notes?: string | null;
}

/**
 * Generate next purchase number
 */
async function generatePurchaseNumber(businessId: string): Promise<string> {
  // Get the latest purchase for this business
  const latestPurchase = await prisma.purchase.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { purchaseNumber: true },
  });

  let nextNumber = 1;
  if (latestPurchase) {
    const match = latestPurchase.purchaseNumber.match(/PUR-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `PUR-${String(nextNumber).padStart(6, '0')}`;
}

/**
 * Calculate purchase totals
 */
function calculateTotals(
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    purchasePrice: number;
    discount?: number;
    tax?: number;
  }>,
  discount: number = 0,
  tax: number = 0,
  amountPaid: number = 0
) {
  let subtotal = new Decimal(0);

  const calculatedItems = items.map(item => {
    const quantity = new Decimal(item.quantity);
    const price = new Decimal(item.purchasePrice);
    const itemDiscount = new Decimal(item.discount || 0);
    const itemTax = new Decimal(item.tax || 0);
    
    const lineTotal = quantity.mul(price).sub(itemDiscount).add(itemTax);
    subtotal = subtotal.add(lineTotal);

    return {
      ...item,
      lineTotal: lineTotal.toNumber(),
    };
  });

  const totalDiscount = new Decimal(discount);
  const totalTax = new Decimal(tax);
  const total = subtotal.sub(totalDiscount).add(totalTax);
  const amountPaidDecimal = new Decimal(amountPaid);
  const amountDue = total.sub(amountPaidDecimal);

  // Determine payment status
  let paymentStatus: string = PAYMENT_STATUS.UNPAID;
  if (amountPaidDecimal.gte(total)) {
    paymentStatus = PAYMENT_STATUS.PAID;
  } else if (amountPaidDecimal.gt(0)) {
    paymentStatus = PAYMENT_STATUS.PARTIALLY_PAID;
  }

  return {
    items: calculatedItems,
    subtotal: subtotal.toNumber(),
    discount: totalDiscount.toNumber(),
    tax: totalTax.toNumber(),
    total: total.toNumber(),
    amountPaid: amountPaidDecimal.toNumber(),
    amountDue: amountDue.toNumber(),
    paymentStatus,
  };
}

/**
 * Create a new purchase (draft)
 */
export async function createPurchase(
  input: CreatePurchaseInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate vendor
  const vendor = await prisma.vendor.findFirst({
    where: { id: input.vendorId, businessId: input.businessId, isActive: true },
  });

  if (!vendor) {
    throw new Error('Vendor not found or inactive');
  }

  // Validate branch
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, businessId: input.businessId, isActive: true },
  });

  if (!branch) {
    throw new Error('Branch not found or inactive');
  }

  // Validate all products and variants
  for (const item of input.items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, businessId: input.businessId, isActive: true },
    });

    if (!product) {
      throw new Error(`Product ${item.productId} not found or inactive`);
    }

    if (item.variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId, isActive: true },
      });

      if (!variant) {
        throw new Error(`Variant ${item.variantId} not found or inactive`);
      }
    }
  }

  // Calculate totals
  const totals = calculateTotals(
    input.items,
    input.discount,
    input.tax,
    input.amountPaid
  );

  // Generate purchase number
  const purchaseNumber = await generatePurchaseNumber(input.businessId);

  // Create purchase with items in a transaction
  const purchase = await prisma.$transaction(async (tx) => {
    const newPurchase = await tx.purchase.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        vendorId: input.vendorId,
        purchaseNumber,
        purchaseDate: new Date(input.purchaseDate),
        status: PURCHASE_STATUS.DRAFT,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        amountPaid: totals.amountPaid,
        amountDue: totals.amountDue,
        paymentStatus: totals.paymentStatus,
        notes: input.notes,
        createdBy: userId,
        items: {
          create: totals.items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            discount: item.discount || 0,
            tax: item.tax || 0,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: {
        vendor: { select: { id: true, name: true, companyName: true } },
        branch: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return newPurchase;
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.PURCHASE_CREATED,
    entityType: 'purchase',
    entityId: purchase.id,
    newValues: {
      purchaseNumber: purchase.purchaseNumber,
      vendorId: purchase.vendorId,
      total: purchase.total,
      status: purchase.status,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Purchase created', {
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    businessId: input.businessId,
    userId,
  });

  return purchase;
}

/**
 * Get purchase by ID
 */
export async function getPurchaseById(purchaseId: string, businessId: string) {
  return prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    include: {
      vendor: { select: { id: true, name: true, companyName: true, phone: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, username: true, fullName: true } },
      receiver: { select: { id: true, username: true, fullName: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true } },
          variant: { select: { id: true, name: true, sku: true, barcode: true } },
        },
      },
    },
  });
}

/**
 * Get all purchases for a business with search and filtering
 */
export async function getPurchases(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    vendorId?: string;
    branchId?: string;
    status?: string;
    paymentStatus?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    search,
    vendorId,
    branchId,
    status,
    paymentStatus,
    startDate,
    endDate,
  } = params;

  const where: Record<string, unknown> = { businessId };
  if (vendorId) where.vendorId = vendorId;
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  if (startDate || endDate) {
    where.purchaseDate = {};
    if (startDate) (where.purchaseDate as Record<string, Date>).gte = startDate;
    if (endDate) (where.purchaseDate as Record<string, Date>).lte = endDate;
  }

  if (search) {
    where.OR = [
      { purchaseNumber: { contains: search, mode: 'insensitive' } },
      { vendor: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true, companyName: true } },
        branch: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchase.count({ where }),
  ]);

  return {
    data: purchases,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update purchase (only DRAFT purchases can be updated)
 */
export async function updatePurchase(
  purchaseId: string,
  businessId: string,
  input: UpdatePurchaseInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentPurchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
  });

  if (!currentPurchase) {
    throw new Error('Purchase not found');
  }

  if (currentPurchase.status !== PURCHASE_STATUS.DRAFT) {
    throw new Error('Only draft purchases can be updated');
  }

  // Validate vendor if changing
  if (input.vendorId && input.vendorId !== currentPurchase.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, businessId, isActive: true },
    });

    if (!vendor) {
      throw new Error('Vendor not found or inactive');
    }
  }

  // Validate items if provided
  if (input.items) {
    for (const item of input.items) {
      const product = await prisma.product.findFirst({
        where: { id: item.productId, businessId, isActive: true },
      });

      if (!product) {
        throw new Error(`Product ${item.productId} not found or inactive`);
      }

      if (item.variantId) {
        const variant = await prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: item.productId, isActive: true },
        });

        if (!variant) {
          throw new Error(`Variant ${item.variantId} not found or inactive`);
        }
      }
    }
  }

  // Recalculate totals
  const items = input.items || (await prisma.purchaseItem.findMany({
    where: { purchaseId },
    select: {
      productId: true,
      variantId: true,
      quantity: true,
      purchasePrice: true,
      discount: true,
      tax: true,
    },
  })).map(item => ({
    productId: item.productId,
    variantId: item.variantId || undefined,
    quantity: Number(item.quantity),
    purchasePrice: Number(item.purchasePrice),
    discount: Number(item.discount),
    tax: Number(item.tax),
  }));

  const totals = calculateTotals(
    items,
    input.discount ?? Number(currentPurchase.discount),
    input.tax ?? Number(currentPurchase.tax),
    input.amountPaid ?? Number(currentPurchase.amountPaid)
  );

  // Update purchase in transaction
  const purchase = await prisma.$transaction(async (tx) => {
    // Delete existing items if new items provided
    if (input.items) {
      await tx.purchaseItem.deleteMany({ where: { purchaseId } });
    }

    const updated = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        vendorId: input.vendorId,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        amountPaid: totals.amountPaid,
        amountDue: totals.amountDue,
        paymentStatus: totals.paymentStatus,
        notes: input.notes ?? undefined,
        ...(input.items && {
          items: {
            create: totals.items.map(item => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              purchasePrice: item.purchasePrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              lineTotal: item.lineTotal,
            })),
          },
        }),
      },
      include: {
        vendor: { select: { id: true, name: true, companyName: true } },
        branch: { select: { id: true, name: true, code: true } },
        creator: { select: { id: true, username: true, fullName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return updated;
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PURCHASE_UPDATED,
    entityType: 'purchase',
    entityId: purchaseId,
    newValues: {
      purchaseNumber: purchase.purchaseNumber,
      total: purchase.total,
    },
    ipAddress,
    userAgent,
  });

  return purchase;
}

/**
 * Receive purchase (update inventory)
 */
export async function receivePurchase(
  purchaseId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    include: {
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  if (purchase.status !== PURCHASE_STATUS.DRAFT) {
    throw new Error('Only draft purchases can be received');
  }

  // Update purchase and inventory in a single transaction
  const result = await prisma.$transaction(async (tx) => {
    // Mark purchase as received
    const updatedPurchase = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: PURCHASE_STATUS.RECEIVED,
        receivedAt: new Date(),
        receivedBy: userId,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Create stock movements for each item
    for (const item of purchase.items) {
      await createStockMovement({
        businessId,
        branchId: purchase.branchId,
        productId: item.productId,
        variantId: item.variantId || undefined,
        movementType: MOVEMENT_TYPES.PURCHASE,
        quantity: Number(item.quantity),
        reason: `Purchase ${purchase.purchaseNumber}`,
        referenceType: 'purchase',
        referenceId: purchase.id,
        performedBy: userId,
      });
    }

    return updatedPurchase;
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PURCHASE_RECEIVED,
    entityType: 'purchase',
    entityId: purchaseId,
    newValues: {
      purchaseNumber: purchase.purchaseNumber,
      status: PURCHASE_STATUS.RECEIVED,
      total: purchase.total,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Purchase received', {
    purchaseId,
    purchaseNumber: purchase.purchaseNumber,
    businessId,
    userId,
  });

  return result;
}

/**
 * Cancel purchase
 */
export async function cancelPurchase(
  purchaseId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
  });

  if (!purchase) {
    throw new Error('Purchase not found');
  }

  if (purchase.status === PURCHASE_STATUS.CANCELLED) {
    throw new Error('Purchase is already cancelled');
  }

  if (purchase.status === PURCHASE_STATUS.RECEIVED) {
    throw new Error('Cannot cancel received purchase');
  }

  const updated = await prisma.purchase.update({
    where: { id: purchaseId },
    data: { status: PURCHASE_STATUS.CANCELLED },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PURCHASE_CANCELLED,
    entityType: 'purchase',
    entityId: purchaseId,
    newValues: {
      purchaseNumber: purchase.purchaseNumber,
      status: PURCHASE_STATUS.CANCELLED,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Purchase cancelled', {
    purchaseId,
    purchaseNumber: purchase.purchaseNumber,
    businessId,
    userId,
  });

  return updated;
}
