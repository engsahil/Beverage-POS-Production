import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { MOVEMENT_TYPES, STOCK_STATUS } from '../api/validators/schemas.js';
import { logger } from '../lib/logger.js';
import { eventEmitter } from '../realtime/eventEmitter.js';
import { RealtimeEvents } from '../realtime/types.js';

// ==========================================
// Types
// ==========================================

export interface OpeningStockInput {
  businessId: string;
  branchId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  reason: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface StockAdjustmentInput {
  businessId: string;
  branchId: string;
  productId: string;
  variantId?: string;
  quantity: number; // positive = increase, negative = decrease
  reason: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface StockMovementInput {
  businessId: string;
  branchId: string;
  productId: string;
  variantId?: string;
  movementType: string;
  quantity: number; // positive = stock in, negative = stock out
  reason?: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
  performedBy: string;
}

export type StockStatusType = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL' | 'OVERSTOCKED';

// ==========================================
// Stock Status Calculation
// ==========================================

/**
 * Calculate stock status based on quantity and thresholds
 */
export function calculateStockStatus(
  quantity: number | Decimal,
  minThreshold: number | null,
  maxThreshold: number | null
): StockStatusType {
  const qty = typeof quantity === 'number' ? quantity : Number(quantity);

  if (qty <= 0) {
    return STOCK_STATUS.OUT_OF_STOCK;
  }

  if (minThreshold !== null && qty <= minThreshold) {
    return STOCK_STATUS.LOW_STOCK;
  }

  if (maxThreshold !== null && qty > maxThreshold) {
    return STOCK_STATUS.OVERSTOCKED;
  }

  return STOCK_STATUS.NORMAL;
}

// ==========================================
// Negative Stock Configuration
// ==========================================

/**
 * Get negative stock configuration for a business
 */
type InventoryDb = typeof prisma | Prisma.TransactionClient;

async function getNegativeStockConfig(businessId: string, db: InventoryDb = prisma): Promise<boolean> {
  const setting = await db.setting.findFirst({
    where: {
      businessId,
      key: 'allow_negative_stock',
    },
  });

  // Default: negative stock NOT allowed
  if (!setting) return false;
  return setting.value === true;
}

// ==========================================
// Stock Status Calculation
// ==========================================
export interface StockMovementOptions {
  db?: Prisma.TransactionClient;
}

export async function createStockMovement(
  input: StockMovementInput,
  options: StockMovementOptions = {}
): Promise<{
  inventory: {
    id: string;
    currentQuantity: Decimal;
    availableQuantity: number;
  };
  movement: {
    id: string;
    movementType: string;
    quantity: Decimal;
    previousQuantity: Decimal;
    resultingQuantity: Decimal;
  };
}> {
  const {
    businessId,
    branchId,
    productId,
    variantId,
    movementType,
    quantity,
    reason,
    notes,
    referenceType,
    referenceId,
    performedBy,
  } = input;

  const db = options.db ?? prisma;

  // Validate the references through the same client that will perform the
  // movement. Callers that pass an outer transaction therefore cannot commit a
  // status transition while an inventory movement is rolled back separately.
  const product = await db.product.findFirst({
    where: { id: productId, businessId },
    include: { variants: true },
  });

  if (!product) {
    throw new Error('Product not found or does not belong to this business');
  }

  if (variantId) {
    const variant = product.variants.find(v => v.id === variantId);
    if (!variant) {
      throw new Error('Variant not found for this product');
    }
  }

  const branch = await db.branch.findFirst({
    where: { id: branchId, businessId },
  });

  if (!branch) {
    throw new Error('Branch not found or does not belong to this business');
  }

  const user = await db.user.findFirst({
    where: { id: performedBy, businessId },
  });

  if (!user) {
    throw new Error('User not found or does not belong to this business');
  }

  const runMovement = async (tx: Prisma.TransactionClient) => {
    // SELECT FOR UPDATE protects existing rows. The advisory lock also covers
    // the missing-row case (and PostgreSQL NULL uniqueness semantics for a
    // base-product inventory row), without serializing unrelated products or
    // branches.
    const inventoryLockKey = `inventory:${businessId}:${branchId}:${productId}:${variantId ?? ''}`;
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${inventoryLockKey}, 0))
    `;

    const lockedRows = await tx.$queryRawUnsafe(
      `SELECT * FROM inventories WHERE business_id = $1 AND branch_id = $2 AND product_id = $3 AND (variant_id = $4 OR (variant_id IS NULL AND $4 IS NULL)) FOR UPDATE`,
      businessId, branchId, productId, variantId || null
    ) as Array<{ id: string; current_quantity: any; reserved_quantity: any }>;

    let inventoryId: string;
    let previousQuantity: number;

    if (lockedRows && lockedRows.length > 0) {
      inventoryId = lockedRows[0].id;
      previousQuantity = Number(lockedRows[0].current_quantity);
    } else {
      const newInventory = await tx.inventory.create({
        data: {
          businessId,
          branchId,
          productId,
          variantId,
          currentQuantity: 0,
          reservedQuantity: 0,
        },
      });
      inventoryId = newInventory.id;
      previousQuantity = 0;
    }

    const newQuantity = previousQuantity + quantity;

    if (quantity < 0 && newQuantity < 0) {
      const allowNegative = await getNegativeStockConfig(businessId, tx);
      if (!allowNegative) {
        throw new Error(
          `Insufficient stock. Available: ${previousQuantity}, Requested deduction: ${Math.abs(quantity)}`
        );
      }
    }

    const updatedInventory = await tx.inventory.update({
      where: { id: inventoryId },
      data: {
        currentQuantity: newQuantity,
        lastMovementAt: new Date(),
      },
    });

    const movement = await tx.stockMovement.create({
      data: {
        businessId,
        branchId,
        inventoryId,
        productId,
        variantId,
        movementType,
        quantity,
        previousQuantity,
        resultingQuantity: newQuantity,
        referenceType,
        referenceId,
        reason,
        notes,
        performedBy,
      },
    });

    return {
      inventory: {
        id: updatedInventory.id,
        currentQuantity: updatedInventory.currentQuantity,
        availableQuantity: Number(updatedInventory.currentQuantity) - Number(updatedInventory.reservedQuantity),
      },
      movement: {
        id: movement.id,
        movementType: movement.movementType,
        quantity: movement.quantity,
        previousQuantity: movement.previousQuantity,
        resultingQuantity: movement.resultingQuantity,
      },
    };
  };

  const result = options.db
    ? await runMovement(options.db)
    : await prisma.$transaction(runMovement, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });

  // Emit realtime events AFTER successful commit
  const event = eventEmitter.createBaseEvent(
    RealtimeEvents.STOCK_CHANGED,
    businessId,
    performedBy,
    branchId
  );

  eventEmitter.emitToBranch({
    ...event,
    eventType: RealtimeEvents.STOCK_CHANGED,
    data: {
      productId,
      productName: product.name,
      variantId,
      variantName: variantId ? product.variants.find(v => v.id === variantId)?.name : undefined,
      previousQuantity: String(result.movement.previousQuantity),
      newQuantity: String(result.movement.resultingQuantity),
      changeAmount: String(quantity),
      movementType,
      referenceType,
      referenceId,
    },
  } as any);

  // Check for low stock or out of stock alerts
  const newQuantity = Number(result.inventory.currentQuantity);
  const minThreshold = product.minStockThreshold || 10; // Default threshold if not set

  if (newQuantity === 0) {
    const outEvent = eventEmitter.createBaseEvent(
      RealtimeEvents.OUT_OF_STOCK,
      businessId,
      performedBy,
      branchId
    );

    eventEmitter.emitToBranch({
      ...outEvent,
      eventType: RealtimeEvents.OUT_OF_STOCK,
      data: {
        productId,
        productName: product.name,
        variantId,
        variantName: variantId ? product.variants.find(v => v.id === variantId)?.name : undefined,
      },
    } as any);
  } else if (newQuantity <= minThreshold) {
    const lowEvent = eventEmitter.createBaseEvent(
      RealtimeEvents.LOW_STOCK,
      businessId,
      performedBy,
      branchId
    );

    eventEmitter.emitToBranch({
      ...lowEvent,
      eventType: RealtimeEvents.LOW_STOCK,
      data: {
        productId,
        productName: product.name,
        variantId,
        variantName: variantId ? product.variants.find(v => v.id === variantId)?.name : undefined,
        currentQuantity: String(newQuantity),
        minThreshold,
      },
    } as any);
  }

  return result;
}

/**
 * Create opening stock
 */
export async function createOpeningStock(
  input: OpeningStockInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Check if inventory already has stock
  const existingInventory = await prisma.inventory.findFirst({
    where: {
      businessId: input.businessId,
      branchId: input.branchId,
      productId: input.productId,
      variantId: input.variantId || null,
    },
  });

  if (existingInventory && Number(existingInventory.currentQuantity) > 0) {
    throw new Error('Opening stock already exists for this product/variant at this branch');
  }

  const result = await createStockMovement({
    businessId: input.businessId,
    branchId: input.branchId,
    productId: input.productId,
    variantId: input.variantId,
    movementType: MOVEMENT_TYPES.OPENING_STOCK,
    quantity: input.quantity,
    reason: input.reason,
    notes: input.notes,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    performedBy: userId,
  });

  // Audit log
  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.INVENTORY_OPENING_STOCK,
    entityType: 'inventory',
    entityId: result.inventory.id,
    newValues: {
      productId: input.productId,
      variantId: input.variantId,
      branchId: input.branchId,
      quantity: input.quantity,
      reason: input.reason,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Opening stock created', {
    businessId: input.businessId,
    productId: input.productId,
    variantId: input.variantId,
    branchId: input.branchId,
    quantity: input.quantity,
  });

  return result;
}

/**
 * List opening stock entries (OPENING_STOCK movements, newest first)
 */
export async function getOpeningStockEntries(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    branchId?: string;
  } = {}
) {
  const { page = 1, limit = 50, branchId } = params;

  const where: Record<string, unknown> = {
    businessId,
    movementType: MOVEMENT_TYPES.OPENING_STOCK,
  };
  if (branchId) where.branchId = branchId;

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        variant: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  // NOTE: unit cost / batch numbers are not tracked on opening stock
  // movements, so they are returned as 0 / null rather than fabricated.
  return {
    data: movements.map((m: any) => ({
      id: m.id,
      productId: m.productId,
      product: m.product,
      variantId: m.variantId,
      variant: m.variant,
      branchId: m.branchId,
      branch: m.branch,
      quantity: Number(m.quantity),
      unitCost: 0,
      totalCost: 0,
      batchNumber: null,
      notes: m.notes,
      createdAt: m.createdAt,
      user: m.user,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Manual stock adjustment (increase or decrease)
 */
export async function createStockAdjustment(
  input: StockAdjustmentInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  if (input.quantity === 0) {
    throw new Error('Adjustment quantity cannot be zero');
  }

  const movementType = input.quantity > 0
    ? MOVEMENT_TYPES.ADJUSTMENT_IN
    : MOVEMENT_TYPES.ADJUSTMENT_OUT;

  const result = await createStockMovement({
    businessId: input.businessId,
    branchId: input.branchId,
    productId: input.productId,
    variantId: input.variantId,
    movementType,
    quantity: input.quantity,
    reason: input.reason,
    notes: input.notes,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    performedBy: userId,
  });

  // Audit log
  const auditAction = input.quantity > 0
    ? AuditActions.INVENTORY_ADJUSTMENT_INCREASE
    : AuditActions.INVENTORY_ADJUSTMENT_DECREASE;

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: auditAction,
    entityType: 'inventory',
    entityId: result.inventory.id,
    newValues: {
      productId: input.productId,
      variantId: input.variantId,
      branchId: input.branchId,
      quantity: input.quantity,
      movementType,
      reason: input.reason,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Stock adjustment created', {
    businessId: input.businessId,
    productId: input.productId,
    variantId: input.variantId,
    branchId: input.branchId,
    quantity: input.quantity,
    movementType,
  });

  return result;
}

// ==========================================
// Inventory Queries
// ==========================================

/**
 * Get inventory by product/variant at a branch
 */
export async function getInventory(
  businessId: string,
  branchId: string,
  productId: string,
  variantId?: string
) {
  const inventory = await prisma.inventory.findFirst({
    where: {
      businessId,
      branchId,
      productId,
      variantId: variantId || null,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          minStockThreshold: true,
          maxStockThreshold: true,
          category: { select: { id: true, name: true } },
        },
      },
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          unit: { select: { id: true, name: true, shortCode: true } },
        },
      },
      branch: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  if (!inventory) return null;

  // Calculate stock status
  const stockStatus = calculateStockStatus(
    inventory.currentQuantity,
    inventory.product.minStockThreshold,
    inventory.product.maxStockThreshold
  );

  return {
    ...inventory,
    availableQuantity: Number(inventory.currentQuantity) - Number(inventory.reservedQuantity),
    stockStatus,
  };
}

/**
 * Get all inventory for a business with filtering
 */
export async function getInventories(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    branchId?: string;
    productId?: string;
    stockStatus?: StockStatusType;
  } = {}
) {
  const { page = 1, limit = 20, search, categoryId, branchId, productId, stockStatus } = params;

  const where: Prisma.InventoryWhereInput = { businessId };
  if (branchId) where.branchId = branchId;
  if (productId) where.productId = productId;

  if (categoryId) {
    where.product = { categoryId };
  }

  if (search) {
    where.OR = [
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
      { product: { barcode: { contains: search, mode: 'insensitive' } } },
      { variant: { name: { contains: search, mode: 'insensitive' } } },
      { variant: { sku: { contains: search, mode: 'insensitive' } } },
      { variant: { barcode: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            minStockThreshold: true,
            maxStockThreshold: true,
            category: { select: { id: true, name: true } },
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            unit: { select: { id: true, name: true, shortCode: true } },
          },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.inventory.count({ where }),
  ]);

  // Calculate stock status for each inventory
  const inventoriesWithStatus = inventories.map(inv => ({
    ...inv,
    availableQuantity: Number(inv.currentQuantity) - Number(inv.reservedQuantity),
    stockStatus: calculateStockStatus(
      inv.currentQuantity,
      inv.product.minStockThreshold,
      inv.product.maxStockThreshold
    ),
    // Convenience fields consumed by the Inventory Management UI
    unit: inv.variant?.unit ?? null,
    lowStockThreshold: inv.product.minStockThreshold ?? 0,
  }));

  // Filter by stock status if provided
  const filtered = stockStatus
    ? inventoriesWithStatus.filter(inv => inv.stockStatus === stockStatus)
    : inventoriesWithStatus;

  return {
    data: filtered,
    meta: {
      page,
      limit,
      total: stockStatus ? filtered.length : total,
      totalPages: Math.ceil((stockStatus ? filtered.length : total) / limit),
    },
  };
}

/**
 * Get stock movements with filtering
 */
export async function getStockMovements(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    productId?: string;
    variantId?: string;
    branchId?: string;
    movementType?: string;
    performedBy?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    productId,
    variantId,
    branchId,
    movementType,
    performedBy,
    startDate,
    endDate,
  } = params;

  const where: Prisma.StockMovementWhereInput = { businessId };
  if (productId) where.productId = productId;
  if (variantId) where.variantId = variantId;
  if (branchId) where.branchId = branchId;
  if (movementType) where.movementType = movementType;
  if (performedBy) where.performedBy = performedBy;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: { select: { name: true, shortCode: true } },
          },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    data: movements,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get stock movement by ID
 */
export async function getStockMovementById(movementId: string, businessId: string) {
  return prisma.stockMovement.findFirst({
    where: { id: movementId, businessId },
    include: {
      product: {
        select: { id: true, name: true, sku: true, barcode: true },
      },
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          unit: { select: { name: true, shortCode: true } },
        },
      },
      branch: {
        select: { id: true, name: true, code: true },
      },
      user: {
        select: { id: true, username: true, fullName: true },
      },
      inventory: {
        select: { id: true, currentQuantity: true },
      },
    },
  });
}

/**
 * Get inventory summary for a branch
 */
export async function getInventorySummary(businessId: string, branchId?: string) {
  const where: Prisma.InventoryWhereInput = { businessId };
  if (branchId) where.branchId = branchId;

  const inventories = await prisma.inventory.findMany({
    where,
    include: {
      product: {
        select: {
          minStockThreshold: true,
          maxStockThreshold: true,
        },
      },
    },
  });

  let outOfStock = 0;
  let lowStock = 0;
  let normal = 0;
  let overstocked = 0;

  for (const inv of inventories) {
    const status = calculateStockStatus(
      inv.currentQuantity,
      inv.product.minStockThreshold,
      inv.product.maxStockThreshold
    );

    switch (status) {
      case 'OUT_OF_STOCK': outOfStock++; break;
      case 'LOW_STOCK': lowStock++; break;
      case 'NORMAL': normal++; break;
      case 'OVERSTOCKED': overstocked++; break;
    }
  }

  return {
    totalItems: inventories.length,
    outOfStock,
    lowStock,
    normal,
    overstocked,
  };
}
