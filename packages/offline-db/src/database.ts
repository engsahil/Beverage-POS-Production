/**
 * Phase 16: IndexedDB Database Layer
 * 
 * Core database wrapper for IndexedDB with:
 * - Versioned schema migrations
 * - Transaction support
 * - Business/branch isolation
 * - Safe error handling
 * 
 * This is the ONLY layer that directly interacts with IndexedDB.
 * All other modules use this abstraction.
 */

import {
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  type OfflineDBConfig,
} from './types.js';

// Store names
export const STORES = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  UNITS: 'units',
  INVENTORY: 'inventory',
  CUSTOMERS: 'customers',
  SETTINGS: 'settings',
  SESSION: 'session',
  QUEUE: 'queue',
  OFFLINE_SALES: 'offlineSales',
  CACHE_METADATA: 'cacheMetadata',
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

/**
 * Initialize the IndexedDB database with schema migrations
 */
export function openDatabase(config: OfflineDBConfig = {}): Promise<IDBDatabase> {
  const dbName = config.dbName || LOCAL_DB_NAME;
  const version = config.version || LOCAL_DB_VERSION;

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(dbName, version);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion || version;

      // Run migrations
      migrateDatabase(db, oldVersion, newVersion);

      // Call custom upgrade handler if provided
      if (config.onUpgradeNeeded) {
        config.onUpgradeNeeded(db, oldVersion, newVersion);
      }
    };

    request.onblocked = () => {
      reject(new Error('Database upgrade blocked by another connection'));
    };
  });
}

/**
 * Database schema migrations
 */
function migrateDatabase(db: IDBDatabase, oldVersion: number, newVersion: number): void {
  // Version 1: Initial schema
  if (oldVersion < 1) {
    createVersion1Schema(db);
  }

  // Future versions:
  // if (oldVersion < 2) {
  //   migrateToVersion2(db);
  // }
}

/**
 * Version 1: Initial schema creation
 */
function createVersion1Schema(db: IDBDatabase): void {
  // Products store - indexed by businessId + categoryId for efficient filtering
  if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
    const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
    productStore.createIndex('businessId', 'businessId', { unique: false });
    productStore.createIndex('categoryId', 'categoryId', { unique: false });
    productStore.createIndex('isActive', 'isActive', { unique: false });
    productStore.createIndex('businessId_categoryId', ['businessId', 'categoryId'], { unique: false });
    productStore.createIndex('sku', 'sku', { unique: false });
    productStore.createIndex('barcode', 'barcode', { unique: false });
    productStore.createIndex('name', 'name', { unique: false });
  }

  // Categories store
  if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
    const categoryStore = db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
    categoryStore.createIndex('businessId', 'businessId', { unique: false });
    categoryStore.createIndex('isActive', 'isActive', { unique: false });
  }

  // Units store
  if (!db.objectStoreNames.contains(STORES.UNITS)) {
    const unitStore = db.createObjectStore(STORES.UNITS, { keyPath: 'id' });
    unitStore.createIndex('businessId', 'businessId', { unique: false });
  }

  // Inventory store - composite key for product+variant+branch
  if (!db.objectStoreNames.contains(STORES.INVENTORY)) {
    const inventoryStore = db.createObjectStore(STORES.INVENTORY, { keyPath: 'id' });
    inventoryStore.createIndex('businessId', 'businessId', { unique: false });
    inventoryStore.createIndex('branchId', 'branchId', { unique: false });
    inventoryStore.createIndex('productId', 'productId', { unique: false });
    inventoryStore.createIndex('businessId_branchId', ['businessId', 'branchId'], { unique: false });
    inventoryStore.createIndex('stockStatus', 'stockStatus', { unique: false });
  }

  // Customers store
  if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
    const customerStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
    customerStore.createIndex('businessId', 'businessId', { unique: false });
    customerStore.createIndex('phone', 'phone', { unique: false });
    customerStore.createIndex('status', 'status', { unique: false });
    customerStore.createIndex('name', 'name', { unique: false });
  }

  // Settings store - single record per business
  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    const settingsStore = db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
    settingsStore.createIndex('businessId', 'businessId', { unique: false });
  }

  // Session store - single active session
  if (!db.objectStoreNames.contains(STORES.SESSION)) {
    const sessionStore = db.createObjectStore(STORES.SESSION, { keyPath: 'id' });
  }

  // Queue store - pending operations
  if (!db.objectStoreNames.contains(STORES.QUEUE)) {
    const queueStore = db.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
    queueStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
    queueStore.createIndex('status', 'status', { unique: false });
    queueStore.createIndex('operationType', 'operationType', { unique: false });
    queueStore.createIndex('businessId', 'businessId', { unique: false });
    queueStore.createIndex('status_businessId', ['status', 'businessId'], { unique: false });
    queueStore.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
    queueStore.createIndex('createdAt', 'createdAt', { unique: false });
  }

  // Offline sales store
  if (!db.objectStoreNames.contains(STORES.OFFLINE_SALES)) {
    const salesStore = db.createObjectStore(STORES.OFFLINE_SALES, { keyPath: 'localId' });
    salesStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
    salesStore.createIndex('businessId', 'businessId', { unique: false });
    salesStore.createIndex('status', 'status', { unique: false });
    salesStore.createIndex('shiftId', 'shiftId', { unique: false });
    salesStore.createIndex('cashierId', 'cashierId', { unique: false });
    salesStore.createIndex('createdAt', 'createdAt', { unique: false });
  }

  // Cache metadata store
  if (!db.objectStoreNames.contains(STORES.CACHE_METADATA)) {
    const metaStore = db.createObjectStore(STORES.CACHE_METADATA, { keyPath: 'id' });
    metaStore.createIndex('businessId', 'businessId', { unique: false });
  }
}

// ==========================================
// Generic CRUD Operations
// ==========================================

/**
 * Get a single record by key
 */
export function getRecord<T>(db: IDBDatabase, storeName: StoreName, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Failed to get record from ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Get all records from a store
 */
export function getAllRecords<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error(`Failed to get all records from ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Get records by index
 */
export function getByIndex<T>(
  db: IDBDatabase,
  storeName: StoreName,
  indexName: string,
  value: string | number | string[]
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error(`Failed to get by index ${indexName} from ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Put (insert or update) a record
 */
export function putRecord<T>(db: IDBDatabase, storeName: StoreName, record: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to put record in ${storeName}: ${request.error?.message}`));
    };

    tx.onerror = () => {
      reject(new Error(`Transaction failed for ${storeName}: ${tx.error?.message}`));
    };
  });
}

/**
 * Put multiple records in a single transaction
 */
export function putRecords<T>(db: IDBDatabase, storeName: StoreName, records: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Failed to put records in ${storeName}: ${tx.error?.message}`));
    };

    tx.onabort = () => {
      reject(new Error(`Transaction aborted for ${storeName}`));
    };
  });
}

/**
 * Delete a record by key
 */
export function deleteRecord(db: IDBDatabase, storeName: StoreName, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete record from ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Clear all records from a store
 */
export function clearStore(db: IDBDatabase, storeName: StoreName): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to clear store ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Count records in a store
 */
export function countRecords(db: IDBDatabase, storeName: StoreName): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error(`Failed to count records in ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Count records by index
 */
export function countByIndex(
  db: IDBDatabase,
  storeName: StoreName,
  indexName: string,
  value: string | number | string[]
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.count(value);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error(`Failed to count by index ${indexName} in ${storeName}: ${request.error?.message}`));
    };
  });
}

/**
 * Execute multiple operations in a single transaction
 * This is critical for atomic operations (e.g., save sale + enqueue operation)
 */
export function executeTransaction(
  db: IDBDatabase,
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  operations: (stores: Record<string, IDBObjectStore>) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores: Record<string, IDBObjectStore> = {};

    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }

    try {
      operations(stores);
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Transaction failed: ${tx.error?.message}`));
    };

    tx.onabort = () => {
      reject(new Error('Transaction aborted'));
    };
  });
}

/**
 * Delete the entire database (for reset functionality)
 */
export function deleteDatabase(dbName: string = LOCAL_DB_NAME): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete database: ${request.error?.message}`));
    };

    request.onblocked = () => {
      reject(new Error('Database deletion blocked by another connection'));
    };
  });
}

/**
 * Get database info (for diagnostics)
 */
export function getDatabaseInfo(db: IDBDatabase): {
  name: string;
  version: number;
  stores: string[];
} {
  return {
    name: db.name,
    version: db.version,
    stores: Array.from(db.objectStoreNames),
  };
}
