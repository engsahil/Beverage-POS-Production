import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import prisma from '../../lib/prisma.js';

const router = Router();

// All offline sync routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/offline/bootstrap
 * Get all data needed for initial offline cache population
 * 
 * Returns: products (with variants), categories, units, inventory, customers, settings
 * Supports incremental sync via `since` query parameter (ISO timestamp)
 */
router.get('/bootstrap', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const businessId = req.user.businessId;
    const branchId = req.query.branchId as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : null;

    // Build common where clause
    const businessWhere = { businessId };
    const branchWhere = branchId ? { branchId } : {};

    // Fetch all data in parallel
    const [products, categories, units, inventory, customers, settings] = await Promise.all([
      // Products with variants
      prisma.product.findMany({
        where: {
          ...businessWhere,
          ...(since ? { updatedAt: { gte: since } } : {}),
        },
        include: {
          category: { select: { id: true, name: true } },
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              sellingPrice: true,
              purchasePrice: true,
              isActive: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),

      // Categories
      prisma.category.findMany({
        where: {
          ...businessWhere,
          ...(since ? { updatedAt: { gte: since } } : {}),
        },
        orderBy: { name: 'asc' },
      }),

      // Units
      prisma.unit.findMany({
        where: {
          ...businessWhere,
          ...(since ? { updatedAt: { gte: since } } : {}),
        },
        orderBy: { name: 'asc' },
      }),

      // Inventory (current stock snapshot)
      prisma.inventory.findMany({
        where: {
          ...businessWhere,
          ...branchWhere,
          ...(since ? { updatedAt: { gte: since } } : {}),
        },
        include: {
          product: { select: { id: true, name: true, minStockThreshold: true, maxStockThreshold: true } },
          variant: { select: { id: true, name: true } },
        },
      }),

      // Customers (active customers for POS lookup)
      prisma.customer.findMany({
        where: {
          ...businessWhere,
          status: 'ACTIVE',
          ...(since ? { updatedAt: { gte: since } } : {}),
        },
        select: {
          id: true,
          name: true,
          phone: true,
          whatsapp: true,
          email: true,
          address: true,
          creditLimit: true,
          currentBalance: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { name: 'asc' },
      }),

      // Business settings
      prisma.setting.findMany({
        where: businessWhere,
      }),
    ]);

    // Format products for cache
    const formattedProducts = products.map(product => ({
      id: product.id,
      businessId: product.businessId,
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      isActive: product.isActive,
      minStockThreshold: product.minStockThreshold,
      maxStockThreshold: product.maxStockThreshold,
      categoryName: product.category?.name || '',
      variants: product.variants.map(v => ({
        id: v.id,
        productId: product.id,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode,
        sellingPrice: v.sellingPrice.toString(),
        purchasePrice: v.purchasePrice?.toString() || null,
        isActive: v.isActive,
        updatedAt: v.updatedAt.toISOString(),
      })),
      updatedAt: product.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    // Format categories
    const formattedCategories = categories.map(cat => ({
      id: cat.id,
      businessId: cat.businessId,
      name: cat.name,
      isActive: cat.isActive,
      updatedAt: cat.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    // Format units
    const formattedUnits = units.map(unit => ({
      id: unit.id,
      businessId: unit.businessId,
      name: unit.name,
      abbreviation: unit.shortCode,
      isActive: unit.isActive,
      updatedAt: unit.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    // Format inventory
    const formattedInventory = inventory.map(inv => {
      const currentQty = inv.currentQuantity;
      const minThreshold = inv.product.minStockThreshold;
      const maxThreshold = inv.product.maxStockThreshold;
      
      let stockStatus: string = 'NORMAL';
      if (currentQty.toNumber() <= 0) {
        stockStatus = 'OUT_OF_STOCK';
      } else if (minThreshold && currentQty.toNumber() <= minThreshold) {
        stockStatus = 'LOW_STOCK';
      } else if (maxThreshold && currentQty.toNumber() > maxThreshold) {
        stockStatus = 'OVERSTOCKED';
      }

      return {
        id: `${inv.productId}-${inv.variantId || 'base'}-${inv.branchId}`,
        businessId: inv.businessId,
        branchId: inv.branchId,
        productId: inv.productId,
        variantId: inv.variantId,
        currentQuantity: inv.currentQuantity.toString(),
        reservedQuantity: inv.reservedQuantity.toString(),
        availableQuantity: inv.currentQuantity.minus(inv.reservedQuantity).toString(),
        stockStatus,
        serverUpdatedAt: inv.updatedAt.toISOString(),
        cachedAt: new Date().toISOString(),
      };
    });

    // Format customers
    const formattedCustomers = customers.map(cust => ({
      id: cust.id,
      businessId: businessId,
      name: cust.name,
      phone: cust.phone,
      whatsapp: cust.whatsapp,
      email: cust.email,
      address: cust.address,
      creditLimit: cust.creditLimit.toString(),
      currentBalance: cust.currentBalance.toString(),
      status: cust.status,
      updatedAt: cust.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    // Format settings
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = String(setting.value);
    }

    // Get branch info if branchId provided
    let branchName: string | null = null;
    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      branchName = branch?.name || null;
    }

    const formattedSettings = {
      id: `business-${businessId}`,
      businessId,
      businessName: settingsMap['business.name'] || 'Business',
      businessPhone: settingsMap['business.phone'] || null,
      businessAddress: settingsMap['business.address'] || null,
      currency: settingsMap['currency'] || 'PKR',
      timezone: settingsMap['timezone'] || 'Asia/Karachi',
      taxRate: settingsMap['tax.rate'] || '0',
      invoicePrefix: settingsMap['invoice.prefix'] || 'INV',
      invoiceNextNumber: parseInt(settingsMap['invoice.nextNumber'] || '1', 10),
      receiptWidth: (settingsMap['receipt.width'] || '80mm') as '58mm' | '80mm',
      receiptShowLogo: settingsMap['receipt.showLogo'] === 'true',
      receiptShowBarcode: settingsMap['receipt.showBarcode'] !== 'false',
      receiptFooter: settingsMap['receipt.footer'] || null,
      allowNegativeStock: settingsMap['inventory.allowNegativeStock'] === 'true',
      branchId: branchId || null,
      branchName,
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };

    // Build response with sync metadata
    const syncTimestamp = new Date().toISOString();

    res.status(200).json({
      success: true,
      data: {
        products: formattedProducts,
        categories: formattedCategories,
        units: formattedUnits,
        inventory: formattedInventory,
        customers: formattedCustomers,
        settings: formattedSettings,
        syncMetadata: {
          timestamp: syncTimestamp,
          isIncremental: since !== null,
          counts: {
            products: formattedProducts.length,
            categories: formattedCategories.length,
            units: formattedUnits.length,
            inventory: formattedInventory.length,
            customers: formattedCustomers.length,
          },
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFLINE_BOOTSTRAP_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/offline/products
 * Get products for cache refresh (lightweight endpoint)
 */
router.get('/products', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const businessId = req.user.businessId;
    const since = req.query.since ? new Date(req.query.since as string) : null;

    const products = await prisma.product.findMany({
      where: {
        businessId,
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            sellingPrice: true,
            purchasePrice: true,
            isActive: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const formatted = products.map(product => ({
      id: product.id,
      businessId: product.businessId,
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      isActive: product.isActive,
      minStockThreshold: product.minStockThreshold,
      maxStockThreshold: product.maxStockThreshold,
      categoryName: product.category?.name || '',
      variants: product.variants.map(v => ({
        id: v.id,
        productId: product.id,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode,
        sellingPrice: v.sellingPrice.toString(),
        purchasePrice: v.purchasePrice?.toString() || null,
        isActive: v.isActive,
        updatedAt: v.updatedAt.toISOString(),
      })),
      updatedAt: product.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: {
        products: formatted,
        timestamp: new Date().toISOString(),
        isIncremental: since !== null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFLINE_PRODUCTS_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/offline/inventory
 * Get inventory snapshot for cache refresh
 */
router.get('/inventory', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const businessId = req.user.businessId;
    const branchId = req.query.branchId as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : null;

    const inventory = await prisma.inventory.findMany({
      where: {
        businessId,
        ...(branchId ? { branchId } : {}),
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      include: {
        product: { select: { id: true, name: true, minStockThreshold: true, maxStockThreshold: true } },
        variant: { select: { id: true, name: true } },
      },
    });

    const formatted = inventory.map(inv => {
      const currentQty = inv.currentQuantity;
      const minThreshold = inv.product.minStockThreshold;
      const maxThreshold = inv.product.maxStockThreshold;
      
      let stockStatus: string = 'NORMAL';
      if (currentQty.toNumber() <= 0) {
        stockStatus = 'OUT_OF_STOCK';
      } else if (minThreshold && currentQty.toNumber() <= minThreshold) {
        stockStatus = 'LOW_STOCK';
      } else if (maxThreshold && currentQty.toNumber() > maxThreshold) {
        stockStatus = 'OVERSTOCKED';
      }

      return {
        id: `${inv.productId}-${inv.variantId || 'base'}-${inv.branchId}`,
        businessId: inv.businessId,
        branchId: inv.branchId,
        productId: inv.productId,
        variantId: inv.variantId,
        currentQuantity: inv.currentQuantity.toString(),
        reservedQuantity: inv.reservedQuantity.toString(),
        availableQuantity: inv.currentQuantity.minus(inv.reservedQuantity).toString(),
        stockStatus,
        serverUpdatedAt: inv.updatedAt.toISOString(),
        cachedAt: new Date().toISOString(),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        inventory: formatted,
        timestamp: new Date().toISOString(),
        isIncremental: since !== null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFLINE_INVENTORY_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/offline/customers
 * Get customers for cache refresh
 */
router.get('/customers', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const businessId = req.user.businessId;
    const since = req.query.since ? new Date(req.query.since as string) : null;

    const customers = await prisma.customer.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsapp: true,
        email: true,
        address: true,
        creditLimit: true,
        currentBalance: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const formatted = customers.map(cust => ({
      id: cust.id,
      businessId,
      name: cust.name,
      phone: cust.phone,
      whatsapp: cust.whatsapp,
      email: cust.email,
      address: cust.address,
      creditLimit: cust.creditLimit.toString(),
      currentBalance: cust.currentBalance.toString(),
      status: cust.status,
      updatedAt: cust.updatedAt.toISOString(),
      cachedAt: new Date().toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: {
        customers: formatted,
        timestamp: new Date().toISOString(),
        isIncremental: since !== null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFLINE_CUSTOMERS_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/v1/offline/settings
 * Get settings for cache refresh
 */
router.get('/settings', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const businessId = req.user.businessId;
    const branchId = req.query.branchId as string | undefined;

    const settings = await prisma.setting.findMany({
      where: { businessId },
    });

    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = String(setting.value);
    }

    let branchName: string | null = null;
    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      branchName = branch?.name || null;
    }

    const formatted = {
      id: `business-${businessId}`,
      businessId,
      businessName: settingsMap['business.name'] || 'Business',
      businessPhone: settingsMap['business.phone'] || null,
      businessAddress: settingsMap['business.address'] || null,
      currency: settingsMap['currency'] || 'PKR',
      timezone: settingsMap['timezone'] || 'Asia/Karachi',
      taxRate: settingsMap['tax.rate'] || '0',
      invoicePrefix: settingsMap['invoice.prefix'] || 'INV',
      invoiceNextNumber: parseInt(settingsMap['invoice.nextNumber'] || '1', 10),
      receiptWidth: (settingsMap['receipt.width'] || '80mm') as '58mm' | '80mm',
      receiptShowLogo: settingsMap['receipt.showLogo'] === 'true',
      receiptShowBarcode: settingsMap['receipt.showBarcode'] !== 'false',
      receiptFooter: settingsMap['receipt.footer'] || null,
      allowNegativeStock: settingsMap['inventory.allowNegativeStock'] === 'true',
      branchId: branchId || null,
      branchName,
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      data: {
        settings: formatted,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFLINE_SETTINGS_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/v1/offline/queue/status
 * Get status of queued operations from client perspective
 * (Server-side validation of idempotency keys)
 */
router.post('/queue/status', authorize('pos.offline.sync'), async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    const { idempotencyKeys } = req.body as { idempotencyKeys: string[] };

    if (!idempotencyKeys || !Array.isArray(idempotencyKeys)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'idempotencyKeys array required' },
      });
      return;
    }

    // For now, return all as "not processed" since we don't have a server-side queue yet
    // Phase 17 will implement the server-side queue processor
    const statuses: Record<string, 'NOT_FOUND' | 'PROCESSED' | 'FAILED'> = {};
    for (const key of idempotencyKeys) {
      statuses[key] = 'NOT_FOUND';
    }

    res.status(200).json({
      success: true,
      data: { statuses },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'QUEUE_STATUS_ERROR',
        message: error.message,
      },
    });
  }
});

export default router;
