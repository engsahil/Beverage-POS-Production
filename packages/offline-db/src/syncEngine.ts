/**
 * Phase 17: Sync Engine
 * 
 * Client-side synchronization engine that processes the local queue
 * and synchronizes operations with the server.
 * 
 * Features:
 * - Sync lock to prevent concurrent syncs
 * - Batch processing with configurable batch size
 * - Network-aware (only syncs when online)
 * - Automatic retry with exponential backoff
 * - Conflict detection and recording
 * - Cache refresh after successful sync
 * - Status tracking and event emission
 * 
 * This engine does NOT duplicate business logic.
 * It transports operations safely to the server.
 */

import {
  STORES,
  getRecord,
  putRecord,
  getByIndex,
  executeTransaction,
} from './database.js';
import type {
  QueuedOperation,
  QueueStatus,
  OfflineSale,
  ConnectionStatus,
} from './types.js';
import { getNetworkState, updateConnectionStatus } from './network.js';

// ==========================================
// Types
// ==========================================

export interface SyncEngineConfig {
  apiBaseUrl: string;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  syncIntervalMs: number;
}

export interface SyncResult {
  operationId: string;
  success: boolean;
  serverEntityId?: string;
  serverEntityNumber?: string;
  error?: string;
  errorCode?: string;
  retryable: boolean;
  conflict?: {
    conflictType: string;
    severity: 'WARNING' | 'ERROR' | 'CRITICAL';
    localState: unknown;
    serverState: unknown;
    errorMessage: string;
  };
}

export interface SyncSummary {
  total: number;
  successful: number;
  failed: number;
  conflicts: number;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncResult: SyncSummary | null;
  pendingCount: number;
  conflictCount: number;
}

type SyncEventListener = (event: SyncEvent) => void;

export interface SyncEvent {
  type: 'SYNC_START' | 'SYNC_COMPLETE' | 'SYNC_ERROR' | 'OPERATION_SYNCED' | 'CONFLICT_DETECTED';
  data?: any;
}

// ==========================================
// Sync Engine State
// ==========================================

let syncLock = false;
let syncInterval: number | null = null;
let config: SyncEngineConfig = {
  apiBaseUrl: '',
  batchSize: 10,
  maxRetries: 5,
  retryDelayMs: 1000,
  syncIntervalMs: 30000, // 30 seconds
};

const eventListeners: SyncEventListener[] = [];

// ==========================================
// Configuration
// ==========================================

/**
 * Configure the sync engine
 */
export function configureSyncEngine(userConfig: Partial<SyncEngineConfig>): void {
  config = { ...config, ...userConfig };
}

// ==========================================
// Event System
// ==========================================

/**
 * Subscribe to sync events
 */
export function onSyncEvent(listener: SyncEventListener): () => void {
  eventListeners.push(listener);
  return () => {
    const index = eventListeners.indexOf(listener);
    if (index > -1) {
      eventListeners.splice(index, 1);
    }
  };
}

/**
 * Emit sync event
 */
function emitEvent(event: SyncEvent): void {
  eventListeners.forEach(listener => {
    try {
      listener(event);
    } catch (error) {
      console.error('Sync event listener error:', error);
    }
  });
}

// ==========================================
// Sync Lock
// ==========================================

/**
 * Acquire sync lock
 * Returns true if lock acquired, false if already locked
 */
function acquireSyncLock(): boolean {
  if (syncLock) {
    return false;
  }
  syncLock = true;
  return true;
}

/**
 * Release sync lock
 */
function releaseSyncLock(): void {
  syncLock = false;
}

/**
 * Check if sync is in progress
 */
export function isSyncInProgress(): boolean {
  return syncLock;
}

// ==========================================
// Sync Operations
// ==========================================

/**
 * Start automatic sync
 * Periodically syncs when online and has pending operations
 */
export function startAutoSync(db: IDBDatabase, accessToken: string): void {
  if (syncInterval !== null) {
    return; // Already started
  }

  syncInterval = window.setInterval(async () => {
    const networkState = getNetworkState();
    if (networkState.status === 'ONLINE') {
      const pendingCount = await getPendingOperationCount(db);
      if (pendingCount > 0) {
        await syncNow(db, accessToken);
      }
    }
  }, config.syncIntervalMs);
}

/**
 * Stop automatic sync
 */
export function stopAutoSync(): void {
  if (syncInterval !== null) {
    window.clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Sync now (manual trigger)
 * Processes all pending and retry-eligible operations
 */
export async function syncNow(db: IDBDatabase, accessToken: string): Promise<SyncSummary | null> {
  // Check network status
  const networkState = getNetworkState();
  if (networkState.status !== 'ONLINE') {
    console.log('Sync skipped: offline');
    return null;
  }

  // Acquire sync lock
  if (!acquireSyncLock()) {
    console.log('Sync skipped: already in progress');
    return null;
  }

  try {
    updateConnectionStatus('SYNCING');
    emitEvent({ type: 'SYNC_START' });

    const summary = await processQueue(db, accessToken);

    updateConnectionStatus('ONLINE');
    emitEvent({ type: 'SYNC_COMPLETE', data: summary });

    return summary;
  } catch (error) {
    updateConnectionStatus('SYNC_ERROR');
    emitEvent({ type: 'SYNC_ERROR', data: error });
    throw error;
  } finally {
    releaseSyncLock();
  }
}

/**
 * Process the queue
 */
async function processQueue(db: IDBDatabase, accessToken: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    total: 0,
    successful: 0,
    failed: 0,
    conflicts: 0,
  };

  // Get all pending and retry-eligible operations
  const operations = await getSyncableOperations(db);
  summary.total = operations.length;

  if (operations.length === 0) {
    return summary;
  }

  // Process in batches
  for (let i = 0; i < operations.length; i += config.batchSize) {
    const batch = operations.slice(i, i + config.batchSize);
    const results = await sendBatchToServer(batch, accessToken);

    // Process results
    for (const result of results) {
      await processSyncResult(db, result);

      if (result.success) {
        summary.successful++;
      } else if (result.conflict) {
        summary.conflicts++;
      } else {
        summary.failed++;
      }
    }
  }

  return summary;
}

/**
 * Get operations ready for sync
 * Includes PENDING and RETRY_REQUIRED (if retry time has passed)
 */
async function getSyncableOperations(db: IDBDatabase): Promise<QueuedOperation[]> {
  const now = new Date().toISOString();

  // Get PENDING operations
  const pending = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status_businessId',
    ['PENDING', ''] // Empty businessId gets all
  );

  // Get RETRY_REQUIRED operations (if retry time has passed)
  const retryRequired = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'RETRY_REQUIRED'
  );

  const retryEligible = retryRequired.filter(op => 
    op.nextRetryAt && op.nextRetryAt <= now
  );

  // Combine and sort by creation time
  const allOperations = [...pending, ...retryEligible];
  allOperations.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return allOperations;
}

/**
 * Send batch of operations to server
 */
async function sendBatchToServer(
  operations: QueuedOperation[],
  accessToken: string
): Promise<SyncResult[]> {
  const payload = {
    operations: operations.map(op => ({
      operationId: op.id,
      idempotencyKey: op.idempotencyKey,
      operationType: op.operationType,
      entityType: op.entityType,
      payload: op.payload,
      deviceId: op.deviceId,
      createdAt: op.createdAt,
    })),
  };

  const response = await fetch(`${config.apiBaseUrl}/api/v1/sync/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sync request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error?.message || 'Sync failed');
  }

  return result.data.results;
}

/**
 * Process sync result for a single operation
 */
async function processSyncResult(db: IDBDatabase, result: SyncResult): Promise<void> {
  const operation = await getRecord<QueuedOperation>(db, STORES.QUEUE, result.operationId);
  
  if (!operation) {
    console.warn(`Operation ${result.operationId} not found in queue`);
    return;
  }

  if (result.success) {
    // Mark as COMPLETED
    operation.status = 'COMPLETED';
    operation.serverEntityId = result.serverEntityId || null;
    operation.serverResponse = {
      entityId: result.serverEntityId,
      entityNumber: result.serverEntityNumber,
    };
    operation.updatedAt = new Date().toISOString();

    await putRecord(db, STORES.QUEUE, operation);

    // Update offline sale if applicable
    if (operation.entityType === 'Sale' && operation.entityLocalId) {
      await updateOfflineSaleStatus(
        db,
        operation.entityLocalId,
        'SYNCED',
        result.serverEntityId,
        result.serverEntityNumber
      );
    }

    emitEvent({
      type: 'OPERATION_SYNCED',
      data: {
        operationId: operation.id,
        operationType: operation.operationType,
        serverEntityId: result.serverEntityId,
      },
    });
  } else if (result.conflict) {
    // Mark as FAILED with conflict
    operation.status = 'FAILED';
    operation.lastError = result.conflict.errorMessage;
    operation.lastErrorAt = new Date().toISOString();
    operation.retryCount++;
    operation.updatedAt = new Date().toISOString();

    await putRecord(db, STORES.QUEUE, operation);

    // Update offline sale status
    if (operation.entityType === 'Sale' && operation.entityLocalId) {
      await updateOfflineSaleStatus(db, operation.entityLocalId, 'FAILED');
    }

    emitEvent({
      type: 'CONFLICT_DETECTED',
      data: {
        operationId: operation.id,
        operationType: operation.operationType,
        conflict: result.conflict,
      },
    });
  } else if (result.retryable) {
    // Mark as RETRY_REQUIRED with exponential backoff
    operation.status = 'RETRY_REQUIRED';
    operation.lastError = result.error || 'Unknown error';
    operation.lastErrorAt = new Date().toISOString();
    operation.retryCount++;

    // Calculate next retry time with exponential backoff
    const backoffMs = Math.min(
      config.retryDelayMs * Math.pow(2, operation.retryCount - 1),
      300000 // Max 5 minutes
    );
    operation.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    operation.updatedAt = new Date().toISOString();

    // Check if max retries exceeded
    if (operation.retryCount >= config.maxRetries) {
      operation.status = 'FAILED';
      operation.nextRetryAt = null;
    }

    await putRecord(db, STORES.QUEUE, operation);
  } else {
    // Permanent failure
    operation.status = 'FAILED';
    operation.lastError = result.error || 'Unknown error';
    operation.lastErrorAt = new Date().toISOString();
    operation.retryCount++;
    operation.updatedAt = new Date().toISOString();

    await putRecord(db, STORES.QUEUE, operation);

    // Update offline sale status
    if (operation.entityType === 'Sale' && operation.entityLocalId) {
      await updateOfflineSaleStatus(db, operation.entityLocalId, 'FAILED');
    }
  }
}

/**
 * Update offline sale status after sync
 */
async function updateOfflineSaleStatus(
  db: IDBDatabase,
  localId: string,
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED',
  serverSaleId?: string,
  serverSaleNumber?: string
): Promise<void> {
  const sale = await getRecord<OfflineSale>(db, STORES.OFFLINE_SALES, localId);
  
  if (!sale) {
    return;
  }

  sale.status = status;
  sale.serverSaleId = serverSaleId || null;
  sale.serverSaleNumber = serverSaleNumber || null;
  sale.updatedAt = new Date().toISOString();

  await putRecord(db, STORES.OFFLINE_SALES, sale);
}

// ==========================================
// Status & Statistics
// ==========================================

/**
 * Get current sync status
 */
export async function getSyncStatus(db: IDBDatabase): Promise<SyncStatus> {
  const pendingCount = await getPendingOperationCount(db);
  const conflictCount = await getConflictCount(db);

  // Get last sync result from completed operations
  const completedOps = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'COMPLETED'
  );

  let lastSyncAt: string | null = null;
  if (completedOps.length > 0) {
    const sorted = completedOps.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    lastSyncAt = sorted[0].updatedAt;
  }

  return {
    isSyncing: syncLock,
    lastSyncAt,
    lastSyncResult: null, // Could be stored separately
    pendingCount,
    conflictCount,
  };
}

/**
 * Get count of pending operations
 */
async function getPendingOperationCount(db: IDBDatabase): Promise<number> {
  const pending = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'PENDING'
  );

  const retryRequired = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'RETRY_REQUIRED'
  );

  return pending.length + retryRequired.length;
}

/**
 * Get count of failed operations (conflicts)
 */
async function getConflictCount(db: IDBDatabase): Promise<number> {
  const failed = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'FAILED'
  );

  return failed.length;
}

// ==========================================
// Cleanup
// ==========================================

/**
 * Clean up old completed operations
 */
export async function cleanupCompletedOperations(
  db: IDBDatabase,
  olderThanDays: number = 7
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  const cutoffIso = cutoffDate.toISOString();

  const completed = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status',
    'COMPLETED'
  );

  let deletedCount = 0;

  for (const operation of completed) {
    if (operation.updatedAt < cutoffIso) {
      await executeTransaction(
        db,
        [STORES.QUEUE],
        'readwrite',
        (stores) => {
          stores[STORES.QUEUE].delete(operation.id);
        }
      );
      deletedCount++;
    }
  }

  return deletedCount;
}
