/**
 * Phase 16: Cache Management Module
 * 
 * Handles caching of server data for offline access:
 * - Products (with variants)
 * - Categories
 * - Units
 * - Inventory snapshots
 * - Customers
 * - Settings
 * 
 * All cached data is read-only from the POS perspective.
 * The server remains the authoritative source of truth.
 */

import {
  STORES,
  getRecord,
  getAllRecords,
  getByIndex,
  putRecord,
  putRecords,
  clearStore,
  countRecords,
  type StoreName,
} from './database.js';
import type {
  CachedProduct,
  CachedCategory,
  CachedUnit,
  CachedInventory,
  CachedCustomer,
  CachedSettings,
  CacheMetadata,
  CacheQueryOptions,
} from './types.js';

// ==========================================
// Product Cache
// ==========================================

/**
 * Cache products from server
 */
export async function cacheProducts(
  db: IDBDatabase,
  products: CachedProduct[],
  businessId: string
): Promise<void> {
  // Update products
  await putRecords(db, STORES.PRODUCTS, products);

  // Update cache metadata
  await updateCacheMetadata(db, 'products', businessId, null, products.length);
}

/**
 * Get all cached products for a business
 */
export async function getCachedProducts(
  db: IDBDatabase,
  options: CacheQueryOptions
): Promise<CachedProduct[]> {
  let products = await getByIndex<CachedProduct>(
    db,
    STORES.PRODUCTS,
    'businessId',
    options.businessId
  );

  // Filter by category if specified
  if (options.categoryId) {
    products = products.filter(p => p.categoryId === options.categoryId);
  }

  // Filter by active status if specified
  if (options.isActive !== undefined) {
    products = products.filter(p => p.isActive === options.isActive);
  }

  // Search by name, SKU, or barcode
  if (options.search) {
    const searchLower = options.search.toLowerCase();
    products = products.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      p.sku.toLowerCase().includes(searchLower) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchLower)) ||
      p.variants.some(v => 
        v.name.toLowerCase().includes(searchLower) ||
        (v.sku && v.sku.toLowerCase().includes(searchLower)) ||
        (v.barcode && v.barcode.toLowerCase().includes(searchLower))
      )
    );
  }

  // Apply pagination
  if (options.offset) {
    products = products.slice(options.offset);
  }
  if (options.limit) {
    products = products.slice(0, options.limit);
  }

  return products;
}

/**
 * Get product by ID
 */
export async function getCachedProduct(
  db: IDBDatabase,
  productId: string
): Promise<CachedProduct | null> {
  return getRecord<CachedProduct>(db, STORES.PRODUCTS, productId);
}

/**
 * Search product by barcode (searches both product and variant barcodes)
 */
export async function findProductByBarcode(
  db: IDBDatabase,
  businessId: string,
  barcode: string
): Promise<CachedProduct | null> {
  const products = await getByIndex<CachedProduct>(
    db,
    STORES.PRODUCTS,
    'businessId',
    businessId
  );

  // Search product barcode
  let found = products.find(p => p.barcode === barcode);
  if (found) return found;

  // Search variant barcodes
  found = products.find(p => 
    p.variants.some(v => v.barcode === barcode)
  );

  return found || null;
}

/**
 * Search product by SKU
 */
export async function findProductBySku(
  db: IDBDatabase,
  businessId: string,
  sku: string
): Promise<CachedProduct | null> {
  const products = await getByIndex<CachedProduct>(
    db,
    STORES.PRODUCTS,
    'businessId',
    businessId
  );

  // Search product SKU
  let found = products.find(p => p.sku === sku);
  if (found) return found;

  // Search variant SKUs
  found = products.find(p => 
    p.variants.some(v => v.sku === sku)
  );

  return found || null;
}

/**
 * Clear product cache for a business
 */
export async function clearProductCache(
  db: IDBDatabase,
  businessId: string
): Promise<void> {
  const products = await getByIndex<CachedProduct>(
    db,
    STORES.PRODUCTS,
    'businessId',
    businessId
  );

  // Delete each product individually (could optimize with transaction)
  for (const product of products) {
    await deleteProduct(db, product.id);
  }
}

async function deleteProduct(db: IDBDatabase, productId: string): Promise<void> {
  const { deleteRecord } = await import('./database.js');
  await deleteRecord(db, STORES.PRODUCTS, productId);
}

// ==========================================
// Category Cache
// ==========================================

/**
 * Cache categories from server
 */
export async function cacheCategories(
  db: IDBDatabase,
  categories: CachedCategory[],
  businessId: string
): Promise<void> {
  await putRecords(db, STORES.CATEGORIES, categories);
  await updateCacheMetadata(db, 'categories', businessId, null, categories.length);
}

/**
 * Get all cached categories for a business
 */
export async function getCachedCategories(
  db: IDBDatabase,
  businessId: string,
  activeOnly: boolean = true
): Promise<CachedCategory[]> {
  let categories = await getByIndex<CachedCategory>(
    db,
    STORES.CATEGORIES,
    'businessId',
    businessId
  );

  if (activeOnly) {
    categories = categories.filter(c => c.isActive);
  }

  return categories;
}

// ==========================================
// Unit Cache
// ==========================================

/**
 * Cache units from server
 */
export async function cacheUnits(
  db: IDBDatabase,
  units: CachedUnit[],
  businessId: string
): Promise<void> {
  await putRecords(db, STORES.UNITS, units);
  await updateCacheMetadata(db, 'units', businessId, null, units.length);
}

/**
 * Get all cached units for a business
 */
export async function getCachedUnits(
  db: IDBDatabase,
  businessId: string
): Promise<CachedUnit[]> {
  return getByIndex<CachedUnit>(db, STORES.UNITS, 'businessId', businessId);
}

// ==========================================
// Inventory Cache
// ==========================================

/**
 * Cache inventory snapshots from server
 */
export async function cacheInventory(
  db: IDBDatabase,
  inventory: CachedInventory[],
  businessId: string,
  branchId: string | null
): Promise<void> {
  await putRecords(db, STORES.INVENTORY, inventory);
  await updateCacheMetadata(db, 'inventory', businessId, branchId, inventory.length);
}

/**
 * Get cached inventory for a business/branch
 */
export async function getCachedInventory(
  db: IDBDatabase,
  businessId: string,
  branchId?: string
): Promise<CachedInventory[]> {
  if (branchId) {
    return getByIndex<CachedInventory>(
      db,
      STORES.INVENTORY,
      'businessId_branchId',
      [businessId, branchId]
    );
  }

  return getByIndex<CachedInventory>(
    db,
    STORES.INVENTORY,
    'businessId',
    businessId
  );
}

/**
 * Get inventory for a specific product/variant
 */
export async function getCachedProductInventory(
  db: IDBDatabase,
  productId: string,
  variantId: string | null,
  branchId: string
): Promise<CachedInventory | null> {
  const inventoryId = `${productId}-${variantId || 'base'}-${branchId}`;
  return getRecord<CachedInventory>(db, STORES.INVENTORY, inventoryId);
}

// ==========================================
// Customer Cache
// ==========================================

/**
 * Cache customers from server
 */
export async function cacheCustomers(
  db: IDBDatabase,
  customers: CachedCustomer[],
  businessId: string
): Promise<void> {
  await putRecords(db, STORES.CUSTOMERS, customers);
  await updateCacheMetadata(db, 'customers', businessId, null, customers.length);
}

/**
 * Get all cached customers for a business
 */
export async function getCachedCustomers(
  db: IDBDatabase,
  options: CacheQueryOptions
): Promise<CachedCustomer[]> {
  let customers = await getByIndex<CachedCustomer>(
    db,
    STORES.CUSTOMERS,
    'businessId',
    options.businessId
  );

  // Filter by status if specified
  if (options.isActive !== undefined) {
    const status = options.isActive ? 'ACTIVE' : 'INACTIVE';
    customers = customers.filter(c => c.status === status);
  }

  // Search by name or phone
  if (options.search) {
    const searchLower = options.search.toLowerCase();
    customers = customers.filter(c => 
      c.name.toLowerCase().includes(searchLower) ||
      (c.phone && c.phone.toLowerCase().includes(searchLower)) ||
      (c.whatsapp && c.whatsapp.toLowerCase().includes(searchLower))
    );
  }

  // Apply pagination
  if (options.offset) {
    customers = customers.slice(options.offset);
  }
  if (options.limit) {
    customers = customers.slice(0, options.limit);
  }

  return customers;
}

/**
 * Get customer by ID
 */
export async function getCachedCustomer(
  db: IDBDatabase,
  customerId: string
): Promise<CachedCustomer | null> {
  return getRecord<CachedCustomer>(db, STORES.CUSTOMERS, customerId);
}

/**
 * Find customer by phone number
 */
export async function findCustomerByPhone(
  db: IDBDatabase,
  businessId: string,
  phone: string
): Promise<CachedCustomer | null> {
  const customers = await getByIndex<CachedCustomer>(
    db,
    STORES.CUSTOMERS,
    'businessId',
    businessId
  );

  return customers.find(c => c.phone === phone || c.whatsapp === phone) || null;
}

// ==========================================
// Settings Cache
// ==========================================

/**
 * Cache settings from server
 */
export async function cacheSettings(
  db: IDBDatabase,
  settings: CachedSettings
): Promise<void> {
  await putRecord(db, STORES.SETTINGS, settings);
  await updateCacheMetadata(db, 'settings', settings.businessId, settings.branchId, 1);
}

/**
 * Get cached settings
 */
export async function getCachedSettings(
  db: IDBDatabase,
  businessId: string
): Promise<CachedSettings | null> {
  const settingsId = `business-${businessId}`;
  return getRecord<CachedSettings>(db, STORES.SETTINGS, settingsId);
}

// ==========================================
// Cache Metadata
// ==========================================

/**
 * Update cache metadata (last sync time, record count)
 */
async function updateCacheMetadata(
  db: IDBDatabase,
  category: string,
  businessId: string,
  branchId: string | null,
  recordCount: number
): Promise<void> {
  const metadata: CacheMetadata = {
    id: `${category}-${businessId}${branchId ? `-${branchId}` : ''}`,
    lastSyncAt: new Date().toISOString(),
    lastSyncVersion: null,
    recordCount,
    businessId,
    branchId,
  };

  await putRecord(db, STORES.CACHE_METADATA, metadata);
}

/**
 * Get cache metadata for a category
 */
export async function getCacheMetadata(
  db: IDBDatabase,
  category: string,
  businessId: string,
  branchId?: string
): Promise<CacheMetadata | null> {
  const metadataId = `${category}-${businessId}${branchId ? `-${branchId}` : ''}`;
  return getRecord<CacheMetadata>(db, STORES.CACHE_METADATA, metadataId);
}

/**
 * Get all cache metadata for a business
 */
export async function getAllCacheMetadata(
  db: IDBDatabase,
  businessId: string
): Promise<CacheMetadata[]> {
  return getByIndex<CacheMetadata>(
    db,
    STORES.CACHE_METADATA,
    'businessId',
    businessId
  );
}

// ==========================================
// Cache Statistics
// ==========================================

/**
 * Get cache statistics for diagnostics
 */
export async function getCacheStatistics(db: IDBDatabase): Promise<{
  products: number;
  categories: number;
  units: number;
  inventory: number;
  customers: number;
  settings: number;
}> {
  return {
    products: await countRecords(db, STORES.PRODUCTS),
    categories: await countRecords(db, STORES.CATEGORIES),
    units: await countRecords(db, STORES.UNITS),
    inventory: await countRecords(db, STORES.INVENTORY),
    customers: await countRecords(db, STORES.CUSTOMERS),
    settings: await countRecords(db, STORES.SETTINGS),
  };
}

/**
 * Clear all cache data (but preserve queue and offline sales)
 */
export async function clearAllCache(
  db: IDBDatabase,
  businessId: string
): Promise<void> {
  // Clear each cache store for this business
  await clearProductCache(db, businessId);
  
  const categories = await getByIndex<CachedCategory>(db, STORES.CATEGORIES, 'businessId', businessId);
  for (const category of categories) {
    const { deleteRecord } = await import('./database.js');
    await deleteRecord(db, STORES.CATEGORIES, category.id);
  }

  const units = await getByIndex<CachedUnit>(db, STORES.UNITS, 'businessId', businessId);
  for (const unit of units) {
    const { deleteRecord } = await import('./database.js');
    await deleteRecord(db, STORES.UNITS, unit.id);
  }

  const inventory = await getByIndex<CachedInventory>(db, STORES.INVENTORY, 'businessId', businessId);
  for (const item of inventory) {
    const { deleteRecord } = await import('./database.js');
    await deleteRecord(db, STORES.INVENTORY, item.id);
  }

  const customers = await getByIndex<CachedCustomer>(db, STORES.CUSTOMERS, 'businessId', businessId);
  for (const customer of customers) {
    const { deleteRecord } = await import('./database.js');
    await deleteRecord(db, STORES.CUSTOMERS, customer.id);
  }

  const metadata = await getByIndex<CacheMetadata>(db, STORES.CACHE_METADATA, 'businessId', businessId);
  for (const meta of metadata) {
    const { deleteRecord } = await import('./database.js');
    await deleteRecord(db, STORES.CACHE_METADATA, meta.id);
  }
}
