import prisma from '../lib/prisma.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface CreateProductInput {
  businessId: string;
  categoryId: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive?: boolean;
  taxEnabled?: boolean;
  taxRate?: number;
  discountAllowed?: boolean;
  maxDiscountPercent?: number;
  minStockThreshold?: number;
  maxStockThreshold?: number;
  expiryTrackingEnabled?: boolean;
  expiryWarningDays?: number;
  variants?: Array<{
    name: string;
    unitId: string;
    quantity: number;
    sku?: string;
    barcode?: string;
    purchasePrice: number;
    sellingPrice: number;
    isActive?: boolean;
  }>;
}

export interface UpdateProductInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  purchasePrice?: number;
  sellingPrice?: number;
  isActive?: boolean;
  taxEnabled?: boolean;
  taxRate?: number | null;
  discountAllowed?: boolean;
  maxDiscountPercent?: number | null;
  minStockThreshold?: number | null;
  maxStockThreshold?: number | null;
  expiryTrackingEnabled?: boolean;
  expiryWarningDays?: number | null;
}

/**
 * Create a new product with optional variants
 */
export async function createProduct(
  input: CreateProductInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  // Validate category belongs to this business
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, businessId: input.businessId },
  });

  if (!category) {
    throw new Error('Category not found or does not belong to this business');
  }

  // Check SKU uniqueness
  if (input.sku) {
    const existingSku = await prisma.product.findFirst({
      where: { businessId: input.businessId, sku: input.sku },
    });
    if (existingSku) {
      throw new Error('SKU already exists');
    }
  }

  // Check barcode uniqueness
  if (input.barcode) {
    const existingBarcode = await prisma.product.findFirst({
      where: { barcode: input.barcode },
    });
    if (existingBarcode) {
      throw new Error('Barcode already exists');
    }
  }

  // Validate variants if provided
  if (input.variants && input.variants.length > 0) {
    for (const variant of input.variants) {
      const unit = await prisma.unit.findFirst({
        where: { id: variant.unitId, businessId: input.businessId },
      });
      if (!unit) {
        throw new Error(`Unit ${variant.unitId} not found or does not belong to this business`);
      }

      if (variant.sku) {
        const existingSku = await prisma.productVariant.findFirst({
          where: { sku: variant.sku },
        });
        if (existingSku) {
          throw new Error(`Variant SKU ${variant.sku} already exists`);
        }
      }

      if (variant.barcode) {
        const existingBarcode = await prisma.productVariant.findFirst({
          where: { barcode: variant.barcode },
        });
        if (existingBarcode) {
          throw new Error(`Variant barcode ${variant.barcode} already exists`);
        }
      }
    }
  }

  // Create product with variants in a transaction
  const product = await prisma.$transaction(async (tx) => {
    const newProduct = await tx.product.create({
      data: {
        businessId: input.businessId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        sku: input.sku,
        barcode: input.barcode,
        purchasePrice: input.purchasePrice,
        sellingPrice: input.sellingPrice,
        isActive: input.isActive ?? true,
        taxEnabled: input.taxEnabled ?? false,
        taxRate: input.taxRate,
        discountAllowed: input.discountAllowed ?? true,
        maxDiscountPercent: input.maxDiscountPercent,
        minStockThreshold: input.minStockThreshold,
        maxStockThreshold: input.maxStockThreshold,
        expiryTrackingEnabled: input.expiryTrackingEnabled ?? false,
        expiryWarningDays: input.expiryWarningDays,
      },
    });

    // Create variants if provided
    if (input.variants && input.variants.length > 0) {
      await tx.productVariant.createMany({
        data: input.variants.map(v => ({
          productId: newProduct.id,
          unitId: v.unitId,
          name: v.name,
          quantity: v.quantity,
          sku: v.sku,
          barcode: v.barcode,
          purchasePrice: v.purchasePrice,
          sellingPrice: v.sellingPrice,
          isActive: v.isActive ?? true,
        })),
      });
    }

    return newProduct;
  });

  // Fetch complete product with relations
  const completeProduct = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      category: true,
      variants: {
        include: {
          unit: true,
        },
      },
    },
  });

  await createAuditLog({
    businessId: input.businessId,
    userId,
    action: AuditActions.PRODUCT_CREATED,
    entityType: 'product',
    entityId: product.id,
    newValues: {
      name: product.name,
      categoryId: product.categoryId,
      sku: product.sku,
      barcode: product.barcode,
      sellingPrice: product.sellingPrice,
      variantCount: input.variants?.length || 0,
    },
    ipAddress,
    userAgent,
  });

  logger.info('Product created', {
    productId: product.id,
    businessId: input.businessId,
    variantCount: input.variants?.length || 0,
  });

  return completeProduct;
}

/**
 * Get product by ID
 */
export async function getProductById(productId: string, businessId: string) {
  return prisma.product.findFirst({
    where: { id: productId, businessId },
    include: {
      category: true,
      variants: {
        include: {
          unit: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

/**
 * Get all products for a business with filtering and search
 */
export async function getProducts(
  businessId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    isActive?: boolean;
  } = {}
) {
  const { page = 1, limit = 20, search, categoryId, isActive } = params;

  const where: Record<string, unknown> = { businessId };
  if (categoryId) where.categoryId = categoryId;
  if (isActive !== undefined) where.isActive = isActive;
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
        variants: {
          include: {
            unit: {
              select: { id: true, name: true, shortCode: true },
            },
          },
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { variants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Search product by barcode
 */
export async function searchByBarcode(barcode: string, businessId: string) {
  // First check product barcode
  const product = await prisma.product.findFirst({
    where: { barcode, businessId, isActive: true },
    include: {
      category: true,
      variants: {
        include: { unit: true },
        where: { isActive: true },
      },
    },
  });

  if (product) {
    return { type: 'product' as const, data: product };
  }

  // Then check variant barcode
  const variant = await prisma.productVariant.findFirst({
    where: {
      barcode,
      isActive: true,
      product: {
        businessId,
        isActive: true,
      },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
      unit: true,
    },
  });

  if (variant) {
    return { type: 'variant' as const, data: variant };
  }

  return null;
}

/**
 * Search product by SKU
 */
export async function searchBySku(sku: string, businessId: string) {
  // First check product SKU
  const product = await prisma.product.findFirst({
    where: { sku, businessId, isActive: true },
    include: {
      category: true,
      variants: {
        include: { unit: true },
        where: { isActive: true },
      },
    },
  });

  if (product) {
    return { type: 'product' as const, data: product };
  }

  // Then check variant SKU
  const variant = await prisma.productVariant.findFirst({
    where: {
      sku,
      isActive: true,
      product: {
        businessId,
        isActive: true,
      },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
      unit: true,
    },
  });

  if (variant) {
    return { type: 'variant' as const, data: variant };
  }

  return null;
}

/**
 * Update product
 */
export async function updateProduct(
  productId: string,
  businessId: string,
  input: UpdateProductInput,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const currentProduct = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });

  if (!currentProduct) {
    throw new Error('Product not found');
  }

  // Validate category if changing
  if (input.categoryId && input.categoryId !== currentProduct.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, businessId },
    });
    if (!category) {
      throw new Error('Category not found or does not belong to this business');
    }
  }

  // Check SKU uniqueness
  if (input.sku !== undefined && input.sku !== currentProduct.sku) {
    if (input.sku) {
      const existingSku = await prisma.product.findFirst({
        where: { businessId, sku: input.sku, id: { not: productId } },
      });
      if (existingSku) {
        throw new Error('SKU already exists');
      }

      // Also check variant SKUs
      const existingVariantSku = await prisma.productVariant.findFirst({
        where: { sku: input.sku },
      });
      if (existingVariantSku) {
        throw new Error('SKU already exists as a variant SKU');
      }
    }
  }

  // Check barcode uniqueness
  if (input.barcode !== undefined && input.barcode !== currentProduct.barcode) {
    if (input.barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: { barcode: input.barcode, id: { not: productId } },
      });
      if (existingBarcode) {
        throw new Error('Barcode already exists');
      }

      // Also check variant barcodes
      const existingVariantBarcode = await prisma.productVariant.findFirst({
        where: { barcode: input.barcode },
      });
      if (existingVariantBarcode) {
        throw new Error('Barcode already exists as a variant barcode');
      }
    }
  }

  // Track changes for audit
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && (currentProduct as Record<string, unknown>)[key] !== value) {
      oldValues[key] = (currentProduct as Record<string, unknown>)[key];
      newValues[key] = value;
    }
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: input,
    include: {
      category: true,
      variants: {
        include: { unit: true },
      },
    },
  });

  if (Object.keys(newValues).length > 0) {
    // Determine audit action based on what changed
    let action: string = AuditActions.PRODUCT_UPDATED;
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
      entityType: 'product',
      entityId: productId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  return product;
}

/**
 * Disable product (soft delete)
 */
export async function disableProduct(
  productId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Disable product and all its variants
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    }),
    prisma.productVariant.updateMany({
      where: { productId },
      data: { isActive: false },
    }),
  ]);

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PRODUCT_DISABLED,
    entityType: 'product',
    entityId: productId,
    ipAddress,
    userAgent,
  });

  return { success: true };
}

/**
 * Enable product
 */
export async function enableProduct(
  productId: string,
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { isActive: true },
    include: {
      category: true,
      variants: {
        include: { unit: true },
      },
    },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PRODUCT_ENABLED,
    entityType: 'product',
    entityId: productId,
    ipAddress,
    userAgent,
  });

  return updated;
}
