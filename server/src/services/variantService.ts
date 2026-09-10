import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateVariantInput {
  productId: string;
  unitId: string;
  name: string;
  quantity: number;
  sku?: string;
  barcode?: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive?: boolean;
}

export interface UpdateVariantInput {
  unitId?: string;
  name?: string;
  quantity?: number;
  sku?: string | null;
  barcode?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  isActive?: boolean;
}

/**
 * Create a new product variant
 */
export async function createVariant(
  input: CreateVariantInput,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate product belongs to this business
  const product = await prisma.product.findFirst({
    where: { id: input.productId, businessId },
  });

  if (!product) {
    throw new Error('Product not found or does not belong to this business');
  }

  // Validate unit belongs to this business
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, businessId },
  });

  if (!unit) {
    throw new Error('Unit not found or does not belong to this business');
  }

  // Check variant name uniqueness within product
  const existingName = await prisma.productVariant.findFirst({
    where: {
      productId: input.productId,
      name: input.name,
    },
  });

  if (existingName) {
    throw new Error('Variant name already exists for this product');
  }

  // Check unit+quantity uniqueness within product
  const existingUnitQuantity = await prisma.productVariant.findFirst({
    where: {
      productId: input.productId,
      unitId: input.unitId,
      quantity: input.quantity,
    },
  });

  if (existingUnitQuantity) {
    throw new Error('Variant with this unit and quantity already exists for this product');
  }

  // Check SKU uniqueness
  if (input.sku) {
    const existingSku = await prisma.productVariant.findFirst({
      where: { sku: input.sku },
    });
    if (existingSku) {
      throw new Error('Variant SKU already exists');
    }

    // Also check product SKUs
    const existingProductSku = await prisma.product.findFirst({
      where: { sku: input.sku },
    });
    if (existingProductSku) {
      throw new Error('SKU already exists as a product SKU');
    }
  }

  // Check barcode uniqueness
  if (input.barcode) {
    const existingBarcode = await prisma.productVariant.findFirst({
      where: { barcode: input.barcode },
    });
    if (existingBarcode) {
      throw new Error('Variant barcode already exists');
    }

    // Also check product barcodes
    const existingProductBarcode = await prisma.product.findFirst({
      where: { barcode: input.barcode },
    });
    if (existingProductBarcode) {
      throw new Error('Barcode already exists as a product barcode');
    }
  }

  const variant = await prisma.productVariant.create({
    data: {
      productId: input.productId,
      unitId: input.unitId,
      name: input.name,
      quantity: input.quantity,
      sku: input.sku,
      barcode: input.barcode,
      purchasePrice: input.purchasePrice,
      sellingPrice: input.sellingPrice,
      isActive: input.isActive ?? true,
    },
    include: {
      product: {
        select: { id: true, name: true, businessId: true },
      },
      unit: true,
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.VARIANT_CREATED,
    entityType: 'variant',
    entityId: variant.id,
    newValues: {
      productId: variant.productId,
      name: variant.name,
      unitId: variant.unitId,
      quantity: variant.quantity,
      sku: variant.sku,
      barcode: variant.barcode,
      sellingPrice: variant.sellingPrice,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Variant created', {
    variantId: variant.id,
    productId: variant.productId,
    businessId,
  });

  return variant;
}

/**
 * Get variant by ID
 */
export async function getVariantById(variantId: string, businessId: string) {
  return prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: { businessId },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: {
            select: { id: true, name: true },
          },
        },
      },
      unit: true,
    },
  });
}

/**
 * Get all variants for a product
 */
export async function getVariantsByProduct(productId: string, businessId: string) {
  // Validate product belongs to this business
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });

  if (!product) {
    throw new Error('Product not found or does not belong to this business');
  }

  return prisma.productVariant.findMany({
    where: { productId },
    include: {
      unit: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Update variant
 */
export async function updateVariant(
  variantId: string,
  businessId: string,
  input: UpdateVariantInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentVariant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: { businessId },
    },
    include: {
      product: {
        select: { businessId: true },
      },
    },
  });

  if (!currentVariant) {
    throw new Error('Variant not found');
  }

  // Validate unit if changing
  if (input.unitId && input.unitId !== currentVariant.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, businessId },
    });
    if (!unit) {
      throw new Error('Unit not found or does not belong to this business');
    }
  }

  // Check variant name uniqueness if changing
  if (input.name && input.name !== currentVariant.name) {
    const existingName = await prisma.productVariant.findFirst({
      where: {
        productId: currentVariant.productId,
        name: input.name,
        id: { not: variantId },
      },
    });
    if (existingName) {
      throw new Error('Variant name already exists for this product');
    }
  }

  // Check unit+quantity uniqueness if changing
  const currentQuantityNum = Number(currentVariant.quantity);
  if (
    (input.unitId || input.quantity !== undefined) &&
    (input.unitId !== currentVariant.unitId || (input.quantity !== undefined && input.quantity !== currentQuantityNum))
  ) {
    const newUnitId = input.unitId || currentVariant.unitId;
    const newQuantity = input.quantity ?? currentQuantityNum;

    const existingUnitQuantity = await prisma.productVariant.findFirst({
      where: {
        productId: currentVariant.productId,
        unitId: newUnitId,
        quantity: newQuantity,
        id: { not: variantId },
      },
    });
    if (existingUnitQuantity) {
      throw new Error('Variant with this unit and quantity already exists for this product');
    }
  }

  // Check SKU uniqueness
  if (input.sku !== undefined && input.sku !== currentVariant.sku) {
    if (input.sku) {
      const existingSku = await prisma.productVariant.findFirst({
        where: { sku: input.sku, id: { not: variantId } },
      });
      if (existingSku) {
        throw new Error('Variant SKU already exists');
      }

      const existingProductSku = await prisma.product.findFirst({
        where: { sku: input.sku },
      });
      if (existingProductSku) {
        throw new Error('SKU already exists as a product SKU');
      }
    }
  }

  // Check barcode uniqueness
  if (input.barcode !== undefined && input.barcode !== currentVariant.barcode) {
    if (input.barcode) {
      const existingBarcode = await prisma.productVariant.findFirst({
        where: { barcode: input.barcode, id: { not: variantId } },
      });
      if (existingBarcode) {
        throw new Error('Variant barcode already exists');
      }

      const existingProductBarcode = await prisma.product.findFirst({
        where: { barcode: input.barcode },
      });
      if (existingProductBarcode) {
        throw new Error('Barcode already exists as a product barcode');
      }
    }
  }

  // Track changes for audit
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentVariant as Record<string, unknown>)[key] !== value) {
      oldValues[key] = (currentVariant as Record<string, unknown>)[key];
      newValues[key] = value;
    }
  }

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data: input,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          category: {
            select: { id: true, name: true },
          },
        },
      },
      unit: true,
    },
  });

  if (Object.keys(newValues).length > 0) {
    let action: string = AuditActions.VARIANT_UPDATED;
    if ('sellingPrice' in newValues || 'purchasePrice' in newValues) {
      action = AuditActions.PRICE_UPDATED;
    }
    if ('barcode' in newValues) {
      action = AuditActions.BARCODE_UPDATED;
    }
    if ('sku' in newValues) {
      action = AuditActions.SKU_UPDATED;
    }

    await createAuditLog({
      businessId,
      userId,
      action,
      entityType: 'variant',
      entityId: variantId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  return variant;
}

/**
 * Disable variant (soft delete)
 */
export async function disableVariant(
  variantId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: { businessId },
    },
  });

  if (!variant) {
    throw new Error('Variant not found');
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { isActive: false },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.VARIANT_DISABLED,
    entityType: 'variant',
    entityId: variantId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Enable variant
 */
export async function enableVariant(
  variantId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: { businessId },
    },
  });

  if (!variant) {
    throw new Error('Variant not found');
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { isActive: true },
    include: {
      product: {
        select: { id: true, name: true },
      },
      unit: true,
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.VARIANT_ENABLED,
    entityType: 'variant',
    entityId: variantId,
    ipAddress,
    userAgent,
  });

  return updated;
}

/**
 * Delete a variant only when it has no transactional history.
 * Refuses (409) when inventory, movements, purchases, counts, transfers,
 * batches, sales or claims reference it — use disable instead.
 */
export async function deleteVariant(
  variantId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { businessId } },
    select: { id: true, name: true, productId: true },
  });

  if (!variant) {
    throw new Error('Variant not found');
  }

  const [inventories, movements, purchases, counts, transfers, batches, sales, claims, adjustments] =
    await Promise.all([
      prisma.inventory.count({ where: { variantId } }),
      prisma.stockMovement.count({ where: { variantId } }),
      prisma.purchaseItem.count({ where: { variantId } }),
      prisma.stockCountItem.count({ where: { variantId } }),
      prisma.transferItem.count({ where: { variantId } }),
      prisma.stockBatch.count({ where: { variantId } }),
      prisma.saleItem.count({ where: { variantId } }),
      prisma.claimItem.count({ where: { variantId } }),
      prisma.stockAdjustment.count({ where: { variantId } }),
    ]);

  const refs = inventories + movements + purchases + counts + transfers + batches + sales + claims + adjustments;
  if (refs > 0) {
    throw new Error(
      'Variant has transaction history and cannot be deleted. Disable it instead.'
    );
  }

  await prisma.productVariant.delete({ where: { id: variantId } });

  await createAuditLog({
    businessId,
    userId,
    action: 'VARIANT_DELETED',
    entityType: 'variant',
    entityId: variantId,
    oldValues: { name: variant.name, productId: variant.productId },
    ipAddress,
    userAgent,
  });
}
