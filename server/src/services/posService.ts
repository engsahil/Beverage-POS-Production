import prisma from '../lib/prisma.js';

export interface POSProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  variants: POSVariantResult[];
}

export interface POSVariantResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  unitName: string;
  unitShortCode: string;
  isActive: boolean;
  stock: {
    current: number;
    available: number;
    reserved: number;
    status: string;
  } | null;
}

function calculateAvailableQuantity(current: number, reserved: number): number {
  return Math.max(0, current - reserved);
}

/**
 * Search products for POS with inventory data
 */
export async function searchProductsForPOS(
  businessId: string,
  branchId: string,
  params: {
    search?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const { search, categoryId, page = 1, limit = 20 } = params;

  const where: any = {
    businessId,
    isActive: true,
  };

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      {
        variants: {
          some: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        variants: {
          where: { isActive: true },
          include: {
            unit: {
              select: {
                name: true,
                shortCode: true,
              },
            },
            inventories: {
              where: { branchId },
              select: {
                currentQuantity: true,
                reservedQuantity: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  const data = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: Number(product.sellingPrice),
    categoryId: product.categoryId,
    categoryName: product.category.name,
    isActive: product.isActive,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      sellingPrice: Number(variant.sellingPrice),
      unitName: variant.unit.name,
      unitShortCode: variant.unit.shortCode,
      isActive: variant.isActive,
      stock: variant.inventories[0]
        ? {
            current: Number(variant.inventories[0].currentQuantity),
            available: calculateAvailableQuantity(
              Number(variant.inventories[0].currentQuantity),
              Number(variant.inventories[0].reservedQuantity)
            ),
            reserved: Number(variant.inventories[0].reservedQuantity),
            status: calculateStockStatus(
              calculateAvailableQuantity(
                Number(variant.inventories[0].currentQuantity),
                Number(variant.inventories[0].reservedQuantity)
              )
            ),
          }
        : null,
    })),
  }));

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Search product by barcode for POS
 */
export async function searchByBarcodeForPOS(
  barcode: string,
  businessId: string,
  branchId: string
) {
  // First try to find a variant with this barcode
  const variant = await prisma.productVariant.findFirst({
    where: {
      barcode,
      product: { businessId, isActive: true },
      isActive: true,
    },
    include: {
      product: {
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      },
      unit: {
        select: { name: true, shortCode: true },
      },
      inventories: {
        where: { branchId },
        select: {
          currentQuantity: true,
          
          reservedQuantity: true,
        },
      },
    },
  });

  if (variant) {
    return {
      type: 'variant' as const,
      product: {
        id: variant.product.id,
        name: variant.product.name,
        categoryId: variant.product.categoryId,
        categoryName: variant.product.category.name,
      },
      variant: {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        sellingPrice: Number(variant.sellingPrice),
        unitName: variant.unit.name,
        unitShortCode: variant.unit.shortCode,
        stock: variant.inventories[0]
          ? {
              current: Number(variant.inventories[0].currentQuantity),
              available: calculateAvailableQuantity(Number(variant.inventories[0].currentQuantity), Number(variant.inventories[0].reservedQuantity)),
              reserved: Number(variant.inventories[0].reservedQuantity),
              status: calculateStockStatus(calculateAvailableQuantity(Number(variant.inventories[0].currentQuantity), Number(variant.inventories[0].reservedQuantity))),
            }
          : null,
      },
    };
  }

  // Try to find a product with this barcode
  const product = await prisma.product.findFirst({
    where: {
      barcode,
      businessId,
      isActive: true,
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
  });

  if (product) {
    return {
      type: 'product' as const,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        sellingPrice: Number(product.sellingPrice),
        categoryId: product.categoryId,
        categoryName: product.category.name,
      },
    };
  }

  return null;
}

/**
 * Search product by SKU for POS
 */
export async function searchBySkuForPOS(
  sku: string,
  businessId: string,
  branchId: string
) {
  // First try to find a variant with this SKU
  const variant = await prisma.productVariant.findFirst({
    where: {
      sku,
      product: { businessId, isActive: true },
      isActive: true,
    },
    include: {
      product: {
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      },
      unit: {
        select: { name: true, shortCode: true },
      },
      inventories: {
        where: { branchId },
        select: {
          currentQuantity: true,
          
          reservedQuantity: true,
        },
      },
    },
  });

  if (variant) {
    return {
      type: 'variant' as const,
      product: {
        id: variant.product.id,
        name: variant.product.name,
        categoryId: variant.product.categoryId,
        categoryName: variant.product.category.name,
      },
      variant: {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        sellingPrice: Number(variant.sellingPrice),
        unitName: variant.unit.name,
        unitShortCode: variant.unit.shortCode,
        stock: variant.inventories[0]
          ? {
              current: Number(variant.inventories[0].currentQuantity),
              available: calculateAvailableQuantity(Number(variant.inventories[0].currentQuantity), Number(variant.inventories[0].reservedQuantity)),
              reserved: Number(variant.inventories[0].reservedQuantity),
              status: calculateStockStatus(calculateAvailableQuantity(Number(variant.inventories[0].currentQuantity), Number(variant.inventories[0].reservedQuantity))),
            }
          : null,
      },
    };
  }

  // Try to find a product with this SKU
  const product = await prisma.product.findFirst({
    where: {
      sku,
      businessId,
      isActive: true,
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
  });

  if (product) {
    return {
      type: 'product' as const,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        sellingPrice: Number(product.sellingPrice),
        categoryId: product.categoryId,
        categoryName: product.category.name,
      },
    };
  }

  return null;
}

/**
 * Get categories for POS
 */
export async function getCategoriesForPOS(businessId: string) {
  const categories = await prisma.category.findMany({
    where: {
      businessId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });

  return categories;
}

/**
 * Get variant stock for POS
 */
export async function getVariantStock(
  variantId: string,
  businessId: string,
  branchId: string
) {
  const inventory = await prisma.inventory.findFirst({
    where: {
      variantId,
      businessId,
      branchId,
    },
    select: {
      currentQuantity: true,
      reservedQuantity: true,
    },
  });

  if (!inventory) {
    return null;
  }

  const current = Number(inventory.currentQuantity);
  const reserved = Number(inventory.reservedQuantity);
  const available = calculateAvailableQuantity(current, reserved);

  return {
    current,
    available,
    reserved,
    status: calculateStockStatus(available),
  };
}

/**
 * Calculate stock status
 */
function calculateStockStatus(availableQuantity: number): string {
  if (availableQuantity <= 0) return 'OUT_OF_STOCK';
  if (availableQuantity < 10) return 'LOW_STOCK';
  return 'IN_STOCK';
}
