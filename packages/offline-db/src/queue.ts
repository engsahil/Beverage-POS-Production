/**
 * Phase 16: Transaction Queue Module
 * 
 * Manages the local queue of operations that need to be synced to the server.
 * This is the foundation for Phase 17 synchronization engine.
 * 
 * Features:
 * - Persistent queue storage
 * - Idempotency keys for deduplication
 * - Retry logic with exponential backoff
 * - Status tracking
 * - Business/branch isolation
 */

import {
  STORES,
  getRecord,
  getByIndex,
  putRecord,
  deleteRecord,
  countRecords,
  countByIndex,
  executeTransaction,
} from './database.js';
import type {
  QueuedOperation,
  QueueOperationType,
  QueueStatus,
  QueueQueryOptions,
} from './types.js';
import { generateIdempotencyKey } from './idempotency.js';

// ==========================================
// Queue Operations
// ==========================================

/**
 * Enqueue a new operation for server synchronization
 * Returns the queued operation with generated ID and idempotency key
 */
export async function enqueueOperation(
  db: IDBDatabase,
  params: {
    operationType: QueueOperationType;
    entityType: string;
    entityLocalId?: string;
    payload: Record<string, unknown>;
    userId: string;
    businessId: string;
    branchId?: string;
    deviceId: string;
    maxRetries?: number;
  }
): Promise<QueuedOperation> {
  const now = new Date().toISOString();
  
  const operation: QueuedOperation = {
    id: crypto.randomUUID(),
    idempotencyKey: generateIdempotencyKey(
      params.operationType,
      params.entityType,
      params.entityLocalId || params.payload.id as string || now,
      params.businessId
    ),
    operationType: params.operationType,
    entityType: params.entityType,
    entityLocalId: params.entityLocalId || null,
    payload: params.payload,
    status: 'PENDING',
    retryCount: 0,
    maxRetries: params.maxRetries || 5,
    lastError: null,
    lastErrorAt: null,
    nextRetryAt: null,
    serverEntityId: null,
    serverResponse: null,
    userId: params.userId,
    businessId: params.businessId,
    branchId: params.branchId || null,
    deviceId: params.deviceId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  await putRecord(db, STORES.QUEUE, operation);
  return operation;
}

/**
 * Enqueue operation atomically with another store operation
 * Critical for ensuring sale + queue entry are saved together
 */
export async function enqueueOperationAtomic(
  db: IDBDatabase,
  operation: QueuedOperation,
  additionalStoreName: string,
  additionalRecord: unknown
): Promise<void> {
  await executeTransaction(
    db,
    [STORES.QUEUE, additionalStoreName as any],
    'readwrite',
    (stores) => {
      stores[STORES.QUEUE].put(operation);
      stores[additionalStoreName].put(additionalRecord);
    }
  );
}

/**
 * Get operation by ID
 */
export async function getQueuedOperation(
  db: IDBDatabase,
  operationId: string
): Promise<QueuedOperation | null> {
  return getRecord<QueuedOperation>(db, STORES.QUEUE, operationId);
}

/**
 * Get operation by idempotency key
 */
export async function getOperationByIdempotencyKey(
  db: IDBDatabase,
  idempotencyKey: string
): Promise<QueuedOperation | null> {
  const operations = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'idempotencyKey',
    idempotencyKey
  );
  return operations[0] || null;
}

/**
 * Get all pending operations for a business
 */
export async function getPendingOperations(
  db: IDBDatabase,
  businessId: string
): Promise<QueuedOperation[]> {
  const operations = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status_businessId',
    ['PENDING', businessId]
  );

  // Sort by creation time (oldest first)
  return operations.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Get all operations matching query options
 */
export async function getQueuedOperations(
  db: IDBDatabase,
  options: QueueQueryOptions
): Promise<QueuedOperation[]> {
  let operations: QueuedOperation[];

  if (options.status) {
    operations = await getByIndex<QueuedOperation>(
      db,
      STORES.QUEUE,
      'status_businessId',
      [options.status, options.businessId]
    );
  } else {
    operations = await getByIndex<QueuedOperation>(
      db,
      STORES.QUEUE,
      'businessId',
      options.businessId
    );
  }

  // Filter by operation type if specified
  if (options.operationType) {
    operations = operations.filter(op => op.operationType === options.operationType);
  }

  // Sort by creation time
  operations.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Apply pagination
  if (options.offset) {
    operations = operations.slice(options.offset);
  }
  if (options.limit) {
    operations = operations.slice(0, options.limit);
  }

  return operations;
}

/**
 * Get operations ready for retry (failed operations with nextRetryAt in the past)
 */
export async function getOperationsForRetry(
  db: IDBDatabase,
  businessId: string
): Promise<QueuedOperation[]> {
  const failedOperations = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status_businessId',
    ['RETRY_REQUIRED', businessId]
  );

  const now = new Date().toISOString();
  
  return failedOperations
    .filter(op => op.nextRetryAt && op.nextRetryAt <= now)
    .sort((a, b) => 
      new Date(a.nextRetryAt!).getTime() - new Date(b.nextRetryAt!).getTime()
    );
}

/**
 * Update operation status to PROCESSING
 */
export async function markOperationProcessing(
  db: IDBDatabase,
  operationId: string
): Promise<void> {
  const operation = await getQueuedOperation(db, operationId);
  if (!operation) {
    throw new Error(`Operation ${operationId} not found`);
  }

  operation.status = 'PROCESSING';
  operation.updatedAt = new Date().toISOString();
  await putRecord(db, STORES.QUEUE, operation);
}

/**
 * Mark operation as completed (server confirmed)
 */
export async function markOperationCompleted(
  db: IDBDatabase,
  operationId: string,
  serverEntityId: string,
  serverResponse?: Record<string, unknown>
): Promise<void> {
  const operation = await getQueuedOperation(db, operationId);
  if (!operation) {
    throw new Error(`Operation ${operationId} not found`);
  }

  operation.status = 'COMPLETED';
  operation.serverEntityId = serverEntityId;
  operation.serverResponse = serverResponse || null;
  operation.updatedAt = new Date().toISOString();
  await putRecord(db, STORES.QUEUE, operation);
}

/**
 * Mark operation as failed with error
 * Automatically schedules retry if under max retries
 */
export async function markOperationFailed(
  db: IDBDatabase,
  operationId: string,
  error: string,
  shouldRetry: boolean = true
): Promise<void> {
  const operation = await getQueuedOperation(db, operationId);
  if (!operation) {
    throw new Error(`Operation ${operationId} not found`);
  }

  operation.retryCount++;
  operation.lastError = error;
  operation.lastErrorAt = new Date().toISOString();
  operation.updatedAt = new Date().toISOString();

  if (shouldRetry && operation.retryCount < operation.maxRetries) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
    const backoffMs = Math.pow(2, operation.retryCount - 1) * 1000;
    operation.status = 'RETRY_REQUIRED';
    operation.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  } else {
    // Max retries exceeded or retry disabled
    operation.status = 'FAILED';
    operation.nextRetryAt = null;
  }

  await putRecord(db, STORES.QUEUE, operation);
}

/**
 * Delete a completed operation (cleanup)
 */
export async function deleteCompletedOperation(
  db: IDBDatabase,
  operationId: string
): Promise<void> {
  const operation = await getQueuedOperation(db, operationId);
  if (!operation) {
    return;
  }

  if (operation.status !== 'COMPLETED') {
    throw new Error('Cannot delete non-completed operation');
  }

  await deleteRecord(db, STORES.QUEUE, operationId);
}

/**
 * Clean up old completed operations (older than specified days)
 */
export async function cleanupCompletedOperations(
  db: IDBDatabase,
  businessId: string,
  olderThanDays: number = 7
): Promise<number> {
  const completedOperations = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'status_businessId',
    ['COMPLETED', businessId]
  );

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deletedCount = 0;
  for (const operation of completedOperations) {
    if (new Date(operation.updatedAt) < cutoffDate) {
      await deleteRecord(db, STORES.QUEUE, operation.id);
      deletedCount++;
    }
  }

  return deletedCount;
}

// ==========================================
// Queue Statistics
// ==========================================

/**
 * Get queue statistics for a business
 */
export async function getQueueStatistics(
  db: IDBDatabase,
  businessId: string
): Promise<{
  total: number;
  pending: number;
  processing: number;
  failed: number;
  retryRequired: number;
  completed: number;
}> {
  const allOperations = await getByIndex<QueuedOperation>(
    db,
    STORES.QUEUE,
    'businessId',
    businessId
  );

  return {
    total: allOperations.length,
    pending: allOperations.filter(op => op.status === 'PENDING').length,
    processing: allOperations.filter(op => op.status === 'PROCESSING').length,
    failed: allOperations.filter(op => op.status === 'FAILED').length,
    retryRequired: allOperations.filter(op => op.status === 'RETRY_REQUIRED').length,
    completed: allOperations.filter(op => op.status === 'COMPLETED').length,
  };
}

/**
 * Check if operation with idempotency key already exists
 * Used to prevent duplicate queue entries
 */
export async function operationExists(
  db: IDBDatabase,
  idempotencyKey: string
): Promise<boolean> {
  const operation = await getOperationByIdempotencyKey(db, idempotencyKey);
  return operation !== null;
}

/**
 * Get total pending operation count across all businesses
 */
export async function getTotalPendingCount(db: IDBDatabase): Promise<number> {
  const pending = await countByIndex(db, STORES.QUEUE, 'status', 'PENDING');
  const retryRequired = await countByIndex(db, STORES.QUEUE, 'status', 'RETRY_REQUIRED');
  return pending + retryRequired;
}
