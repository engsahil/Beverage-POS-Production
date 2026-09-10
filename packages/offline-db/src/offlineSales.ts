/**
 * Phase 16: Offline Sales Module
 * 
 * Manages local sale records created during offline operation.
 * These sales will be synced to the server when connection returns (Phase 17).
 * 
 * Each offline sale:
 * - Has a unique local ID
 * - Has a stable idempotency key for server deduplication
 * - Preserves all sale data (items, payments, customer, etc.)
 * - Is linked to the cashier, branch, and shift
 * - Survives browser restart and offline periods
 */

import {
  STORES,
  getRecord,
  getByIndex,
  putRecord,
  deleteRecord,
  countRecords,
  executeTransaction,
} from './database.js';
import type {
  OfflineSale,
  OfflineSaleItem,
  OfflinePayment,
  QueuedOperation,
} from './types.js';
import { generateIdempotencyKey, getOrCreateDeviceId } from './idempotency.js';

// ==========================================
// Offline Sale Creation
// ==========================================

/**
 * Create an offline sale record and queue it for server sync
 * This is an atomic operation - both the sale and queue entry are saved together
 */
export async function createOfflineSale(
  db: IDBDatabase,
  params: {
    businessId: string;
    branchId: string | null;
    shiftId: string | null;
    cashierId: string;
    cashierName: string;
    customerId?: string;
    customerName?: string;
    items: OfflineSaleItem[];
    subtotal: string;
    discountAmount: string;
    discountPercentage: string;
    taxAmount: string;
    total: string;
    amountPaid: string;
    outstandingAmount: string;
    payments: OfflinePayment[];
    notes?: string;
  }
): Promise<OfflineSale> {
  const now = new Date().toISOString();
  const deviceId = getOrCreateDeviceId();
  const localId = crypto.randomUUID();

  // Generate stable idempotency key
  const idempotencyKey = generateIdempotencyKey(
    'SALE_CREATE',
    'Sale',
    localId,
    params.businessId
  );

  const sale: OfflineSale = {
    localId,
    idempotencyKey,
    businessId: params.businessId,
    branchId: params.branchId,
    shiftId: params.shiftId,
    cashierId: params.cashierId,
    cashierName: params.cashierName,
    customerId: params.customerId || null,
    customerName: params.customerName || null,
    items: params.items,
    subtotal: params.subtotal,
    discountAmount: params.discountAmount,
    discountPercentage: params.discountPercentage,
    taxAmount: params.taxAmount,
    total: params.total,
    amountPaid: params.amountPaid,
    outstandingAmount: params.outstandingAmount,
    payments: params.payments,
    saleDate: now,
    status: 'PENDING_SYNC',
    serverSaleId: null,
    serverSaleNumber: null,
    notes: params.notes || null,
    createdAt: now,
    updatedAt: now,
  };

  // Create queue operation
  const queueOperation: QueuedOperation = {
    id: crypto.randomUUID(),
    idempotencyKey,
    operationType: 'SALE_CREATE',
    entityType: 'Sale',
    entityLocalId: localId,
    payload: {
      sale,
      deviceId,
    },
    status: 'PENDING',
    retryCount: 0,
    maxRetries: 5,
    lastError: null,
    lastErrorAt: null,
    nextRetryAt: null,
    serverEntityId: null,
    serverResponse: null,
    userId: params.cashierId,
    businessId: params.businessId,
    branchId: params.branchId,
    deviceId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic transaction: save sale + queue operation together
  await executeTransaction(
    db,
    [STORES.OFFLINE_SALES, STORES.QUEUE],
    'readwrite',
    (stores) => {
      stores[STORES.OFFLINE_SALES].put(sale);
      stores[STORES.QUEUE].put(queueOperation);
    }
  );

  return sale;
}

// ==========================================
// Offline Sale Retrieval
// ==========================================

/**
 * Get offline sale by local ID
 */
export async function getOfflineSale(
  db: IDBDatabase,
  localId: string
): Promise<OfflineSale | null> {
  return getRecord<OfflineSale>(db, STORES.OFFLINE_SALES, localId);
}

/**
 * Get all offline sales for a business
 */
export async function getOfflineSales(
  db: IDBDatabase,
  businessId: string,
  options?: {
    status?: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
    shiftId?: string;
    cashierId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<OfflineSale[]> {
  let sales: OfflineSale[];

  if (options?.shiftId) {
    sales = await getByIndex<OfflineSale>(
      db,
      STORES.OFFLINE_SALES,
      'shiftId',
      options.shiftId
    );
    sales = sales.filter(s => s.businessId === businessId);
  } else if (options?.cashierId) {
    sales = await getByIndex<OfflineSale>(
      db,
      STORES.OFFLINE_SALES,
      'cashierId',
      options.cashierId
    );
    sales = sales.filter(s => s.businessId === businessId);
  } else {
    sales = await getByIndex<OfflineSale>(
      db,
      STORES.OFFLINE_SALES,
      'businessId',
      businessId
    );
  }

  // Filter by status if specified
  if (options?.status) {
    sales = sales.filter(s => s.status === options.status);
  }

  // Sort by creation time (newest first)
  sales.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Apply pagination
  if (options?.offset) {
    sales = sales.slice(options.offset);
  }
  if (options?.limit) {
    sales = sales.slice(0, options.limit);
  }

  return sales;
}

/**
 * Get pending offline sales (not yet synced)
 */
export async function getPendingOfflineSales(
  db: IDBDatabase,
  businessId: string
): Promise<OfflineSale[]> {
  return getOfflineSales(db, businessId, { status: 'PENDING_SYNC' });
}

/**
 * Get offline sales for a specific shift
 */
export async function getShiftOfflineSales(
  db: IDBDatabase,
  shiftId: string
): Promise<OfflineSale[]> {
  const sales = await getByIndex<OfflineSale>(
    db,
    STORES.OFFLINE_SALES,
    'shiftId',
    shiftId
  );

  return sales.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// ==========================================
// Offline Sale Status Updates
// ==========================================

/**
 * Mark offline sale as synced (server confirmed)
 */
export async function markSaleSynced(
  db: IDBDatabase,
  localId: string,
  serverSaleId: string,
  serverSaleNumber: string
): Promise<void> {
  const sale = await getOfflineSale(db, localId);
  if (!sale) {
    throw new Error(`Offline sale ${localId} not found`);
  }

  sale.status = 'SYNCED';
  sale.serverSaleId = serverSaleId;
  sale.serverSaleNumber = serverSaleNumber;
  sale.updatedAt = new Date().toISOString();

  await putRecord(db, STORES.OFFLINE_SALES, sale);
}

/**
 * Mark offline sale as failed
 */
export async function markSaleFailed(
  db: IDBDatabase,
  localId: string
): Promise<void> {
  const sale = await getOfflineSale(db, localId);
  if (!sale) {
    throw new Error(`Offline sale ${localId} not found`);
  }

  sale.status = 'FAILED';
  sale.updatedAt = new Date().toISOString();

  await putRecord(db, STORES.OFFLINE_SALES, sale);
}

/**
 * Delete a synced offline sale (cleanup)
 */
export async function deleteSyncedSale(
  db: IDBDatabase,
  localId: string
): Promise<void> {
  const sale = await getOfflineSale(db, localId);
  if (!sale) return;

  if (sale.status !== 'SYNCED') {
    throw new Error('Cannot delete non-synced offline sale');
  }

  await deleteRecord(db, STORES.OFFLINE_SALES, localId);
}

/**
 * Clean up old synced sales (older than specified days)
 */
export async function cleanupSyncedSales(
  db: IDBDatabase,
  businessId: string,
  olderThanDays: number = 7
): Promise<number> {
  const syncedSales = await getOfflineSales(db, businessId, { status: 'SYNCED' });
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deletedCount = 0;
  for (const sale of syncedSales) {
    if (new Date(sale.updatedAt) < cutoffDate) {
      await deleteRecord(db, STORES.OFFLINE_SALES, sale.localId);
      deletedCount++;
    }
  }

  return deletedCount;
}

// ==========================================
// Offline Sale Statistics
// ==========================================

/**
 * Get offline sale statistics for a business
 */
export async function getOfflineSaleStatistics(
  db: IDBDatabase,
  businessId: string
): Promise<{
  total: number;
  pendingSync: number;
  synced: number;
  failed: number;
  totalAmount: string;
  pendingAmount: string;
}> {
  const sales = await getByIndex<OfflineSale>(
    db,
    STORES.OFFLINE_SALES,
    'businessId',
    businessId
  );

  const pendingSales = sales.filter(s => s.status === 'PENDING_SYNC');
  const syncedSales = sales.filter(s => s.status === 'SYNCED');
  const failedSales = sales.filter(s => s.status === 'FAILED');

  const totalAmount = sales.reduce(
    (sum, s) => sum + parseFloat(s.total),
    0
  ).toFixed(2);

  const pendingAmount = pendingSales.reduce(
    (sum, s) => sum + parseFloat(s.total),
    0
  ).toFixed(2);

  return {
    total: sales.length,
    pendingSync: pendingSales.length,
    synced: syncedSales.length,
    failed: failedSales.length,
    totalAmount,
    pendingAmount,
  };
}
