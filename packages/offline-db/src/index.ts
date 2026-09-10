/**
 * Phase 16: Offline Database Package
 * 
 * Main entry point for the POS offline data layer.
 * 
 * This package provides:
 * - IndexedDB-based local storage
 * - Product/variant/category cache
 * - Inventory snapshot cache
 * - Customer lookup cache
 * - Settings cache
 * - Cashier session context
 * - Transaction queue for offline operations
 * - Offline sale records
 * - Network status monitoring
 * - Idempotency key generation
 * 
 * Architecture:
 * POS → Local Offline DB (this package) → Queue → Server API (Phase 17)
 * 
 * The local database is NOT a replacement for PostgreSQL.
 * The server remains the authoritative source of truth.
 */

// Database core
export {
  openDatabase,
  getRecord,
  getAllRecords,
  getByIndex,
  putRecord,
  putRecords,
  deleteRecord,
  clearStore,
  countRecords,
  countByIndex,
  executeTransaction,
  deleteDatabase,
  getDatabaseInfo,
  STORES,
  type StoreName,
} from './database.js';

// Cache management
export {
  cacheProducts,
  getCachedProducts,
  getCachedProduct,
  findProductByBarcode,
  findProductBySku,
  clearProductCache,
  cacheCategories,
  getCachedCategories,
  cacheUnits,
  getCachedUnits,
  cacheInventory,
  getCachedInventory,
  getCachedProductInventory,
  cacheCustomers,
  getCachedCustomers,
  getCachedCustomer,
  findCustomerByPhone,
  cacheSettings,
  getCachedSettings,
  getCacheMetadata,
  getAllCacheMetadata,
  getCacheStatistics,
  clearAllCache,
} from './cache.js';

// Transaction queue
export {
  enqueueOperation,
  enqueueOperationAtomic,
  getQueuedOperation,
  getOperationByIdempotencyKey,
  getPendingOperations,
  getQueuedOperations,
  getOperationsForRetry,
  markOperationProcessing,
  markOperationCompleted,
  markOperationFailed,
  deleteCompletedOperation,
  cleanupCompletedOperations,
  getQueueStatistics,
  operationExists,
  getTotalPendingCount,
} from './queue.js';

// Offline sales
export {
  createOfflineSale,
  getOfflineSale,
  getOfflineSales,
  getPendingOfflineSales,
  getShiftOfflineSales,
  markSaleSynced,
  markSaleFailed,
  deleteSyncedSale,
  cleanupSyncedSales,
  getOfflineSaleStatistics,
} from './offlineSales.js';

// Session management
export {
  saveSession,
  getActiveSession,
  updateSessionActivity,
  updateSessionShift,
  clearSession,
  isSessionValid,
  hasPermission,
  isSessionForBusiness,
  isSessionForBranch,
  getSessionContext,
} from './session.js';

// Network status
export {
  initializeNetworkMonitoring,
  updateConnectionStatus,
  updatePendingOperationsCount,
  updateLastSyncTime,
  getNetworkState,
  isOnline,
  isOffline,
  onNetworkStateChange,
  resetNetworkState,
} from './network.js';

// Idempotency
export {
  generateIdempotencyKey,
  generateDeviceIdempotencyKey,
  parseIdempotencyKey,
  getOrCreateDeviceId,
  isValidIdempotencyKey,
} from './idempotency.js';

// Types
export type {
  CachedProduct,
  CachedVariant,
  CachedCategory,
  CachedUnit,
  CachedInventory,
  CachedCustomer,
  CachedSettings,
  CachedSession,
  QueuedOperation,
  QueueOperationType,
  QueueStatus,
  OfflineSale,
  OfflineSaleItem,
  OfflinePayment,
  CacheMetadata,
  ConnectionStatus,
  NetworkState,
  OfflineDBConfig,
  CacheQueryOptions,
  QueueQueryOptions,
} from './types.js';

export {
  LOCAL_DB_VERSION,
  LOCAL_DB_NAME,
} from './types.js';

// ==========================================
// Sync Engine (Phase 17)
export {
  configureSyncEngine,
  onSyncEvent,
  isSyncInProgress,
  startAutoSync,
  stopAutoSync,
  syncNow,
  getSyncStatus,
  cleanupCompletedOperations as cleanupCompletedSyncOperations,
  type SyncEngineConfig,
  type SyncResult,
  type SyncSummary,
  type SyncStatus,
  type SyncEvent,
} from './syncEngine.js';

// High-Level API
// ==========================================

import { openDatabase } from './database.js';
import { initializeNetworkMonitoring } from './network.js';
import { getOrCreateDeviceId } from './idempotency.js';
import type { OfflineDBConfig } from './types.js';

/**
 * Initialize the offline database system
 * Call this once when the POS application starts
 */
export async function initializeOfflineDB(config?: OfflineDBConfig): Promise<IDBDatabase> {
  // Open/upgrade database
  const db = await openDatabase(config);

  // Initialize network monitoring
  initializeNetworkMonitoring();

  // Ensure device ID exists
  getOrCreateDeviceId();

  return db;
}

/**
 * Get database health status
 */
export function getOfflineDBHealth(db: IDBDatabase): {
  status: 'healthy' | 'error';
  name: string;
  version: number;
  stores: string[];
  deviceId: string;
} {
  try {
    return {
      status: 'healthy',
      name: db.name,
      version: db.version,
      stores: Array.from(db.objectStoreNames),
      deviceId: getOrCreateDeviceId(),
    };
  } catch (error) {
    return {
      status: 'error',
      name: '',
      version: 0,
      stores: [],
      deviceId: getOrCreateDeviceId(),
    };
  }
}
