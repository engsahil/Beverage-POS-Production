/**
 * Phase 17: Sync Service
 * 
 * Server-side service for processing queued operations from POS clients.
 * 
 * Responsibilities:
 * - Process batches of queued operations
 * - Idempotency checking via IdempotencyRecord model
 * - Conflict detection and recording via SyncConflict model
 * - Execute operations using existing services (checkout, payments, etc.)
 * - Return results to client for local reconciliation
 * 
 * This service does NOT duplicate business logic.
 * It transports operations safely to existing services.
 */

import prisma from '../lib/prisma.js';
import * as checkoutService from './checkoutService.js';
import * as saleService from './saleService.js';
import * as customerPaymentService from './customerPaymentService.js';
import { createStockMovement } from './inventoryService.js';

// ==========================================
// Types
// ==========================================

export interface QueuedOperation {
  operationId: string;
  idempotencyKey: string;
  operationType: string;
  entityType: string;
  payload: Record<string, unknown>;
  deviceId?: string;
  createdAt: string;
}

export interface SyncResult {
  operationId: string;
  success: boolean;
  serverEntityId?: string;
  serverEntityNumber?: string;
  error?: string;
  errorCode?: string;
  retryable: boolean;
  conflict?: SyncConflictData;
}

export interface SyncConflictData {
  conflictType: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  localState: unknown;
  serverState: unknown;
  errorMessage: string;
}

// ==========================================
// Batch Processing
// ==========================================

/**
 * Process a batch of queued operations from POS
 * Each operation is processed sequentially to maintain ordering
 */
export async function processSyncBatch(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operations: QueuedOperation[]
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const operation of operations) {
    try {
      const result = await processOperation(businessId, branchId, userId, operation);
      results.push(result);
    } catch (error) {
      results.push({
        operationId: operation.operationId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'UNEXPECTED_ERROR',
        retryable: true,
      });
    }
  }

  return results;
}

/**
 * Process a single queued operation
 */
async function processOperation(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  // Check idempotency first - if already processed, return cached result
  const existingRecord = await checkIdempotency(operation.idempotencyKey, businessId);
  if (existingRecord) {
    return {
      operationId: operation.operationId,
      success: existingRecord.statusCode >= 200 && existingRecord.statusCode < 300,
      serverEntityId: existingRecord.entityId || undefined,
      serverEntityNumber: existingRecord.responseBody 
        ? (existingRecord.responseBody as any).saleNumber || (existingRecord.responseBody as any).number
        : undefined,
      retryable: false,
    };
  }

  // Process based on operation type
  let result: SyncResult;

  switch (operation.operationType) {
    case 'SALE_CREATE':
      result = await processSaleCreate(businessId, branchId, userId, operation);
      break;
    case 'CUSTOMER_PAYMENT_CREATE':
      result = await processCustomerPayment(businessId, userId, operation);
      break;
    case 'SHIFT_OPEN':
      result = await processShiftOpen(businessId, branchId, userId, operation);
      break;
    case 'SHIFT_CLOSE':
      result = await processShiftClose(businessId, userId, operation);
      break;
    case 'EXPENSE_CREATE':
      result = await processExpenseCreate(businessId, branchId, userId, operation);
      break;
    case 'SALE_VOID':
      result = await processSaleVoid(businessId, userId, operation);
      break;
    case 'STOCK_ADJUSTMENT':
      result = await processStockAdjustment(businessId, branchId, userId, operation);
      break;
    default:
      result = {
        operationId: operation.operationId,
        success: false,
        error: `Unknown operation type: ${operation.operationType}`,
        errorCode: 'UNKNOWN_OPERATION',
        retryable: false,
      };
  }

  // Record idempotency if successful
  if (result.success) {
    await recordIdempotency(
      operation.idempotencyKey,
      operation.operationType,
      operation.entityType,
      result.serverEntityId,
      businessId,
      userId,
      branchId,
      operation.deviceId,
      { saleNumber: result.serverEntityNumber }
    );
  }

  return result;
}

// ==========================================
// Operation Processors
// ==========================================

/**
 * Process sale creation from offline queue
 */
async function processSaleCreate(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;

    // Use the existing checkout service - it handles all business logic
    const result = await checkoutService.processCheckout({
      businessId,
      branchId: branchId || payload.branchId,
      cashierId: userId,
      shiftId: payload.shiftId,
      customerId: payload.customerId,
      items: payload.items.map((item: any) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountAmount: Number(item.discountAmount || 0),
      })),
      payments: payload.payments.map((p: any) => ({
        paymentMethod: p.paymentMethod,
        amount: Number(p.amount),
        referenceNumber: p.referenceNumber || p.reference,
        cashReceived: p.paymentMethod === 'CASH' ? Number(p.cashReceived ?? p.amount) : undefined,
      })),
      saleDiscount: payload.saleDiscount,
      idempotencyKey: operation.idempotencyKey,
      notes: payload.notes,
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: result.sale.id,
      serverEntityNumber: result.sale.saleNumber,
      retryable: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sale creation failed';
    
    // Determine if this is a conflict or a permanent error
    const isConflict = errorMessage.includes('Insufficient stock') ||
                       errorMessage.includes('inactive') ||
                       errorMessage.includes('not found') ||
                       errorMessage.includes('Credit limit exceeded');

    if (isConflict) {
      // Record the conflict for admin review
      const conflictType = errorMessage.includes('Insufficient stock')
        ? 'INVENTORY_SHORTAGE'
        : errorMessage.includes('inactive')
        ? 'PRODUCT_DISABLED'
        : errorMessage.includes('Credit limit exceeded')
        ? 'CREDIT_LIMIT_EXCEEDED'
        : 'VALIDATION_ERROR';

      await recordConflict({
        businessId,
        branchId,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        operationType: operation.operationType,
        entityType: operation.entityType,
        conflictType,
        severity: 'ERROR',
        localState: operation.payload,
        serverState: null,
        errorMessage,
        deviceId: operation.deviceId,
        cashierId: userId,
      });

      return {
        operationId: operation.operationId,
        success: false,
        error: errorMessage,
        errorCode: conflictType,
        retryable: false,
        conflict: {
          conflictType,
          severity: 'ERROR',
          localState: operation.payload,
          serverState: null,
          errorMessage,
        },
      };
    }

    // Check if it's a duplicate submission. The sale's durable unique
    // idempotency key is the source of truth even when the sync-record write
    // raced or the process crashed after committing the sale.
    if (errorMessage.includes('Duplicate sale submission')) {
      const existingSale = await prisma.sale.findUnique({
        where: { idempotencyKey: operation.idempotencyKey },
        select: { id: true, businessId: true, saleNumber: true },
      });

      if (existingSale?.businessId === businessId) {
        return {
          operationId: operation.operationId,
          success: true,
          serverEntityId: existingSale.id,
          serverEntityNumber: existingSale.saleNumber,
          retryable: false,
        };
      }

      return {
        operationId: operation.operationId,
        success: true, // Already processed, but do not expose another tenant's row
        retryable: false,
      };
    }

    return {
      operationId: operation.operationId,
      success: false,
      error: errorMessage,
      errorCode: 'SALE_CREATE_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process customer payment from offline queue
 */
async function processCustomerPayment(
  businessId: string,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;

    // Validate customer exists and is active
    const customer = await prisma.customer.findFirst({
      where: {
        id: payload.customerId,
        businessId,
      },
    });

    if (!customer) {
      await recordConflict({
        businessId,
        branchId: null,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        operationType: operation.operationType,
        entityType: operation.entityType,
        conflictType: 'CUSTOMER_NOT_FOUND',
        severity: 'ERROR',
        localState: operation.payload,
        serverState: null,
        errorMessage: 'Customer not found',
        deviceId: operation.deviceId,
        cashierId: userId,
      });

      return {
        operationId: operation.operationId,
        success: false,
        error: 'Customer not found',
        errorCode: 'CUSTOMER_NOT_FOUND',
        retryable: false,
      };
    }

    if (customer.status !== 'ACTIVE') {
      await recordConflict({
        businessId,
        branchId: null,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        operationType: operation.operationType,
        entityType: operation.entityType,
        conflictType: 'CUSTOMER_INACTIVE',
        severity: 'WARNING',
        localState: operation.payload,
        serverState: { status: customer.status },
        errorMessage: 'Customer is inactive',
        deviceId: operation.deviceId,
        cashierId: userId,
      });

      return {
        operationId: operation.operationId,
        success: false,
        error: 'Customer is inactive',
        errorCode: 'CUSTOMER_INACTIVE',
        retryable: false,
      };
    }

    // The service owns the transaction that contains payment, locked
    // customer balance, and ledger entry. Keeping this path on that service
    // also prevents offline sync from reintroducing a stale-balance write.
    const payment = await customerPaymentService.createCustomerPayment({
      businessId,
      customerId: payload.customerId,
      paymentDate: new Date(payload.paymentDate || operation.createdAt),
      paymentMethod: payload.paymentMethod || 'CASH',
      amount: Number(payload.amount),
      referenceNumber: payload.referenceNumber,
      notes: payload.notes,
      idempotencyKey: operation.idempotencyKey,
      userId,
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: payment.id,
      retryable: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Payment creation failed';
    
    if (errorMessage.includes('Duplicate payment submission') ||
        (errorMessage.includes('Unique constraint') && errorMessage.includes('idempotencyKey'))) {
      const existingPayment = await prisma.customerPayment.findUnique({
        where: { idempotencyKey: operation.idempotencyKey },
        select: { id: true, businessId: true },
      });

      if (existingPayment?.businessId === businessId) {
        return {
          operationId: operation.operationId,
          success: true,
          serverEntityId: existingPayment.id,
          retryable: false,
        };
      }
    }

    return {
      operationId: operation.operationId,
      success: false,
      error: errorMessage,
      errorCode: 'PAYMENT_CREATE_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process shift open from offline queue
 */
async function processShiftOpen(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;
    const effectiveBranchId = branchId || payload.branchId;

    if (!effectiveBranchId) {
      return {
        operationId: operation.operationId,
        success: false,
        error: 'Branch ID is required for shift operations',
        errorCode: 'BRANCH_REQUIRED',
        retryable: false,
      };
    }

    // Check if user already has an open shift at this branch
    const existingShift = await prisma.cashierShift.findFirst({
      where: {
        businessId,
        branchId: effectiveBranchId,
        cashierId: userId,
        status: 'OPEN',
      },
    });

    if (existingShift) {
      // Not an error - just return the existing shift
      return {
        operationId: operation.operationId,
        success: true,
        serverEntityId: existingShift.id,
        serverEntityNumber: existingShift.shiftNumber,
        retryable: false,
      };
    }

    // Generate shift number
    const latestShift = await prisma.cashierShift.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: { shiftNumber: true },
    });

    let nextNum = 1;
    if (latestShift) {
      const match = latestShift.shiftNumber.match(/SHIFT-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const shiftNumber = `SHIFT-${String(nextNum).padStart(6, '0')}`;

    const shift = await prisma.cashierShift.create({
      data: {
        businessId,
        branchId: effectiveBranchId,
        cashierId: userId,
        shiftNumber,
        openingDate: new Date(payload.openingDate || operation.createdAt),
        openingCash: Number(payload.openingCash || 0),
        status: 'OPEN',
        openedBy: userId,
        openingNotes: payload.notes,
      },
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: shift.id,
      serverEntityNumber: shift.shiftNumber,
      retryable: false,
    };
  } catch (error) {
    return {
      operationId: operation.operationId,
      success: false,
      error: error instanceof Error ? error.message : 'Shift open failed',
      errorCode: 'SHIFT_OPEN_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process shift close from offline queue
 */
async function processShiftClose(
  businessId: string,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;

    // Find the shift - try by ID first, then by shift number
    let shift = null;
    if (payload.shiftId) {
      shift = await prisma.cashierShift.findFirst({
        where: { id: payload.shiftId, businessId },
      });
    }
    
    if (!shift && payload.shiftNumber) {
      shift = await prisma.cashierShift.findFirst({
        where: { shiftNumber: payload.shiftNumber, businessId },
      });
    }

    if (!shift) {
      await recordConflict({
        businessId,
        branchId: null,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        operationType: operation.operationType,
        entityType: operation.entityType,
        conflictType: 'SHIFT_NOT_FOUND',
        severity: 'ERROR',
        localState: operation.payload,
        serverState: null,
        errorMessage: 'Shift not found',
        deviceId: operation.deviceId,
        cashierId: userId,
      });

      return {
        operationId: operation.operationId,
        success: false,
        error: 'Shift not found',
        errorCode: 'SHIFT_NOT_FOUND',
        retryable: false,
      };
    }

    if (shift.status !== 'OPEN') {
      // Already closed - not an error
      return {
        operationId: operation.operationId,
        success: true,
        serverEntityId: shift.id,
        serverEntityNumber: shift.shiftNumber,
        retryable: false,
      };
    }

    // Calculate expected cash
    const expectedCash = shift.openingCash.plus(shift.cashSales);
    const actualCash = Number(payload.actualCash || 0);
    const cashDifference = actualCash - Number(expectedCash);

    const updatedShift = await prisma.cashierShift.update({
      where: { id: shift.id },
      data: {
        closingDate: new Date(payload.closingDate || operation.createdAt),
        expectedCash,
        actualCash,
        cashDifference,
        status: 'CLOSED',
        closedBy: userId,
        closingNotes: payload.notes,
        differenceReason: payload.differenceReason,
      },
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: updatedShift.id,
      serverEntityNumber: updatedShift.shiftNumber,
      retryable: false,
    };
  } catch (error) {
    return {
      operationId: operation.operationId,
      success: false,
      error: error instanceof Error ? error.message : 'Shift close failed',
      errorCode: 'SHIFT_CLOSE_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process expense creation from offline queue
 */
async function processExpenseCreate(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;
    const effectiveBranchId = branchId || payload.branchId;

    // Generate expense number
    const latestExpense = await prisma.expense.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: { expenseNumber: true },
    });

    let nextNum = 1;
    if (latestExpense) {
      const match = latestExpense.expenseNumber.match(/EXP-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const expenseNumber = `EXP-${String(nextNum).padStart(6, '0')}`;

    const expense = await prisma.expense.create({
      data: {
        businessId,
        branchId: effectiveBranchId || '',
        expenseNumber,
        categoryId: payload.categoryId,
        description: payload.description,
        amount: Number(payload.amount),
        paymentMethod: payload.paymentMethod || 'CASH',
        expenseDate: new Date(payload.expenseDate || operation.createdAt),
        referenceNumber: payload.referenceNumber,
        notes: payload.notes,
        status: 'ACTIVE',
        idempotencyKey: operation.idempotencyKey,
        createdBy: userId,
      },
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: expense.id,
      serverEntityNumber: expense.expenseNumber,
      retryable: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Expense creation failed';
    
    if (errorMessage.includes('Unique constraint') && errorMessage.includes('idempotencyKey')) {
      return {
        operationId: operation.operationId,
        success: true,
        retryable: false,
      };
    }

    return {
      operationId: operation.operationId,
      success: false,
      error: errorMessage,
      errorCode: 'EXPENSE_CREATE_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process sale void from offline queue.
 *
 * Keep offline voids on the same transactional path as the authenticated
 * sales endpoint so customer-ledger reversals and inventory idempotency cannot
 * diverge between online and synchronized operations.
 */
async function processSaleVoid(
  businessId: string,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;

    // Find the sale - try by server ID first, then by sale number.
    let sale = null;
    if (payload.saleId) {
      sale = await prisma.sale.findFirst({
        where: { id: payload.saleId, businessId },
        select: { id: true, saleNumber: true, status: true },
      });
    }

    if (!sale && payload.saleNumber) {
      sale = await prisma.sale.findFirst({
        where: { saleNumber: payload.saleNumber, businessId },
        select: { id: true, saleNumber: true, status: true },
      });
    }

    if (!sale) {
      return {
        operationId: operation.operationId,
        success: false,
        error: 'Sale not found',
        errorCode: 'SALE_NOT_FOUND',
        retryable: false,
      };
    }

    if (sale.status !== 'COMPLETED') {
      // Preserve existing sync idempotency behavior for a previously voided
      // or refunded sale. No financial mutation is performed here.
      return {
        operationId: operation.operationId,
        success: true,
        serverEntityId: sale.id,
        serverEntityNumber: sale.saleNumber,
        retryable: false,
      };
    }

    const voidedSale = await saleService.voidSale(
      sale.id,
      businessId,
      userId,
      payload.reason || 'Voided from offline POS'
    );

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: voidedSale.id,
      serverEntityNumber: voidedSale.saleNumber,
      retryable: false,
    };
  } catch (error) {
    return {
      operationId: operation.operationId,
      success: false,
      error: error instanceof Error ? error.message : 'Sale void failed',
      errorCode: 'SALE_VOID_FAILED',
      retryable: true,
    };
  }
}

/**
 * Process stock adjustment from offline queue
 */
async function processStockAdjustment(
  businessId: string,
  branchId: string | undefined,
  userId: string,
  operation: QueuedOperation
): Promise<SyncResult> {
  try {
    const payload = operation.payload as any;
    const effectiveBranchId = branchId || payload.branchId;

    if (!effectiveBranchId) {
      return {
        operationId: operation.operationId,
        success: false,
        error: 'Branch ID is required for stock adjustments',
        errorCode: 'BRANCH_REQUIRED',
        retryable: false,
      };
    }

    // Preserve the existing not-found response, but do not use this read as
    // the stock calculation. The authoritative movement below locks the
    // inventory entity and computes previous/resulting quantities while
    // holding the outer sync transaction.
    const inventory = await prisma.inventory.findFirst({
      where: {
        businessId,
        branchId: effectiveBranchId,
        productId: payload.productId,
        variantId: payload.variantId || null,
      },
      select: { id: true },
    });

    if (!inventory) {
      return {
        operationId: operation.operationId,
        success: false,
        error: 'Inventory record not found',
        errorCode: 'INVENTORY_NOT_FOUND',
        retryable: false,
      };
    }

    const adjustmentQty = Number(payload.quantity);
    const movementQty = payload.adjustmentType === 'INCREASE' ? adjustmentQty : -adjustmentQty;

    // Create adjustment and movement in one transaction. This replaces the
    // old stale-read/absolute-write path, which could overwrite a concurrent
    // checkout or stock-in.
    const result = await prisma.$transaction(async (tx) => {
      const movementResult = await createStockMovement({
        businessId,
        branchId: effectiveBranchId,
        productId: payload.productId,
        variantId: payload.variantId,
        movementType: 'ADJUSTMENT',
        quantity: movementQty,
        reason: payload.reason,
        notes: payload.notes,
        referenceType: 'offline_sync',
        referenceId: operation.operationId,
        performedBy: userId,
      }, { db: tx });

      const previousStock = Number(movementResult.movement.previousQuantity);
      const newStock = Number(movementResult.movement.resultingQuantity);

      return tx.stockAdjustment.create({
        data: {
          businessId,
          branchId: effectiveBranchId,
          productId: payload.productId,
          variantId: payload.variantId,
          adjustmentType: payload.adjustmentType,
          quantity: adjustmentQty,
          reason: payload.reason,
          notes: payload.notes,
          previousStock,
          newStock,
          movementId: movementResult.movement.id,
          performedBy: userId,
        },
      });
    });

    return {
      operationId: operation.operationId,
      success: true,
      serverEntityId: result.id,
      retryable: false,
    };
  } catch (error) {
    return {
      operationId: operation.operationId,
      success: false,
      error: error instanceof Error ? error.message : 'Stock adjustment failed',
      errorCode: 'ADJUSTMENT_FAILED',
      retryable: true,
    };
  }
}

// ==========================================
// Idempotency
// ==========================================

/**
 * Check if operation was already processed
 */
async function checkIdempotency(idempotencyKey: string, businessId: string) {
  return prisma.idempotencyRecord.findFirst({
    where: {
      idempotencyKey,
      businessId,
      expiresAt: { gt: new Date() },
    },
  });
}

/**
 * Record successful operation for idempotency
 */
async function recordIdempotency(
  idempotencyKey: string,
  operationType: string,
  entityType: string,
  entityId: string | undefined,
  businessId: string,
  userId: string,
  branchId: string | undefined,
  deviceId: string | undefined,
  responseBody?: Record<string, unknown>
) {
  // The initial check and the sale transaction are intentionally separate.
  // Upsert makes the durable sync record safe when two retries finish the
  // same operation concurrently; the sale's unique idempotency key remains
  // the authoritative operation claim.
  await prisma.idempotencyRecord.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      operationType,
      entityType,
      entityId: entityId || null,
      businessId,
      userId,
      branchId: branchId || null,
      deviceId: deviceId || null,
      statusCode: 200,
      responseBody: responseBody ? responseBody as any : undefined,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
    update: {},
  });
}

// ==========================================
// Conflict Management
// ==========================================

/**
 * Record a sync conflict for admin review
 */
async function recordConflict(params: {
  businessId: string;
  branchId: string | undefined | null;
  operationId: string;
  idempotencyKey: string;
  operationType: string;
  entityType: string;
  conflictType: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  localState: unknown;
  serverState: unknown;
  errorMessage: string;
  deviceId?: string;
  cashierId: string;
}) {
  try {
    // Get cashier name for the conflict record
    const cashier = await prisma.user.findUnique({
      where: { id: params.cashierId },
      select: { fullName: true },
    });

    await prisma.syncConflict.create({
      data: {
        businessId: params.businessId,
        branchId: params.branchId || null,
        operationId: params.operationId,
        idempotencyKey: params.idempotencyKey,
        operationType: params.operationType,
        entityType: params.entityType,
        conflictType: params.conflictType,
        severity: params.severity,
        status: 'OPEN',
        localState: params.localState as any,
        serverState: params.serverState as any,
        errorMessage: params.errorMessage,
        deviceId: params.deviceId || null,
        cashierId: params.cashierId,
        cashierName: cashier?.fullName || null,
      },
    });
  } catch (error) {
    // Don't fail the sync operation if conflict recording fails
    console.error('Failed to record sync conflict:', error);
  }
}

/**
 * Get pending sync conflicts for a business
 */
export async function getSyncConflicts(
  businessId: string,
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN'
) {
  return prisma.syncConflict.findMany({
    where: {
      businessId,
      status,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      cashier: {
        select: {
          id: true,
          username: true,
          fullName: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Resolve a sync conflict
 */
export async function resolveConflict(
  conflictId: string,
  businessId: string,
  resolvedBy: string,
  resolutionNotes: string
) {
  return prisma.syncConflict.update({
    where: {
      id: conflictId,
      businessId,
    },
    data: {
      status: 'RESOLVED',
      resolvedBy,
      resolvedAt: new Date(),
      resolutionNotes,
    },
  });
}

/**
 * Dismiss a sync conflict
 */
export async function dismissConflict(
  conflictId: string,
  businessId: string,
  resolvedBy: string,
  resolutionNotes: string
) {
  return prisma.syncConflict.update({
    where: {
      id: conflictId,
      businessId,
    },
    data: {
      status: 'DISMISSED',
      resolvedBy,
      resolvedAt: new Date(),
      resolutionNotes,
    },
  });
}

/**
 * Clean up expired idempotency records
 */
export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}
