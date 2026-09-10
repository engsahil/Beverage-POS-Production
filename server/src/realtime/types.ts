/**
 * Phase 18: Real-Time Event Types
 * 
 * Defines all real-time event types, payloads, and socket structures.
 * Events are emitted AFTER successful database transaction commit.
 */

// ==========================================
// Event Type Definitions
// ==========================================

export const RealtimeEvents = {
  // Sales
  SALE_CREATED: 'sale:created',
  SALE_VOIDED: 'sale:voided',

  // Payments
  PAYMENT_RECEIVED: 'payment:received',

  // Inventory
  STOCK_CHANGED: 'stock:changed',
  LOW_STOCK: 'stock:low',
  OUT_OF_STOCK: 'stock:out',

  // Customers
  CUSTOMER_CREATED: 'customer:created',
  CUSTOMER_UPDATED: 'customer:updated',
  CUSTOMER_CREDIT_CHANGED: 'customer:credit_changed',
  CUSTOMER_RECOVERY_RECORDED: 'customer:recovery_recorded',

  // Shifts
  SHIFT_OPENED: 'shift:opened',
  SHIFT_CLOSED: 'shift:closed',

  // Expenses
  EXPENSE_CREATED: 'expense:created',
  EXPENSE_CANCELLED: 'expense:cancelled',

  // Claims
  CLAIM_CREATED: 'claim:created',
  CLAIM_STATUS_CHANGED: 'claim:status_changed',

  // Targets / Commission
  TARGET_PROGRESS_CHANGED: 'target:progress_changed',
  COMMISSION_UPDATED: 'commission:updated',

  // POS Status
  POS_CONNECTED: 'pos:connected',
  POS_DISCONNECTED: 'pos:disconnected',
  POS_HEARTBEAT: 'pos:heartbeat',
  POS_SYNC_STATUS_CHANGED: 'pos:sync_status_changed',

  // System
  NOTIFICATION: 'notification',
} as const;

export type RealtimeEventType = typeof RealtimeEvents[keyof typeof RealtimeEvents];

// ==========================================
// Event Payload Base
// ==========================================

export interface RealtimeEventBase {
  eventId: string;           // Unique event ID for deduplication
  eventType: RealtimeEventType;
  businessId: string;
  branchId?: string;
  timestamp: string;         // ISO timestamp
  deviceId?: string;         // POS device ID if applicable
  userId?: string;           // User who triggered the event
}

// ==========================================
// Sale Event Payloads
// ==========================================

export interface SaleCreatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.SALE_CREATED;
  data: {
    saleId: string;
    saleNumber: string;
    total: string;           // Decimal as string
    subtotal: string;
    taxAmount: string;
    discountAmount: string;
    paymentMethods: string[];
    itemCount: number;
    customerId?: string;
    customerName?: string;
    cashierId: string;
    cashierName: string;
    shiftId?: string;
    outstandingAmount?: string; // For credit sales
  };
}

export interface SaleVoidedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.SALE_VOIDED;
  data: {
    saleId: string;
    saleNumber: string;
    total: string;
    reason: string;
    voidedBy: string;
    voidedByName: string;
  };
}

// ==========================================
// Payment Event Payloads
// ==========================================

export interface PaymentReceivedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.PAYMENT_RECEIVED;
  data: {
    paymentId: string;
    saleId: string;
    saleNumber: string;
    amount: string;
    paymentMethod: string;
    referenceNumber?: string;
  };
}

// ==========================================
// Inventory Event Payloads
// ==========================================

export interface StockChangedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.STOCK_CHANGED;
  data: {
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
    previousQuantity: string;
    newQuantity: string;
    changeAmount: string;
    movementType: string;
    referenceType?: string;
    referenceId?: string;
  };
}

export interface LowStockEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.LOW_STOCK;
  data: {
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
    currentQuantity: string;
    minThreshold: number;
  };
}

export interface OutOfStockEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.OUT_OF_STOCK;
  data: {
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
  };
}

// ==========================================
// Customer Event Payloads
// ==========================================

export interface CustomerCreatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CUSTOMER_CREATED;
  data: {
    customerId: string;
    name: string;
    phone?: string;
    creditLimit: string;
  };
}

export interface CustomerUpdatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CUSTOMER_UPDATED;
  data: {
    customerId: string;
    name: string;
    changes: string[]; // List of changed fields
  };
}

export interface CustomerCreditChangedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CUSTOMER_CREDIT_CHANGED;
  data: {
    customerId: string;
    customerName: string;
    previousBalance: string;
    newBalance: string;
    changeAmount: string;
    referenceType: string; // SALE, PAYMENT, ADJUSTMENT
    referenceId: string;
  };
}

export interface CustomerRecoveryRecordedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CUSTOMER_RECOVERY_RECORDED;
  data: {
    paymentId: string;
    customerId: string;
    customerName: string;
    amount: string;
    paymentMethod: string;
    previousBalance: string;
    newBalance: string;
  };
}

// ==========================================
// Shift Event Payloads
// ==========================================

export interface ShiftOpenedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.SHIFT_OPENED;
  data: {
    shiftId: string;
    shiftNumber: string;
    cashierId: string;
    cashierName: string;
    openingCash: string;
    openedAt: string;
  };
}

export interface ShiftClosedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.SHIFT_CLOSED;
  data: {
    shiftId: string;
    shiftNumber: string;
    cashierId: string;
    cashierName: string;
    salesTotal: string;
    cashDifference: string;
    closedAt: string;
  };
}

// ==========================================
// Expense Event Payloads
// ==========================================

export interface ExpenseCreatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.EXPENSE_CREATED;
  data: {
    expenseId: string;
    expenseNumber: string;
    amount: string;
    categoryId: string;
    categoryName: string;
    description: string;
  };
}

export interface ExpenseCancelledEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.EXPENSE_CANCELLED;
  data: {
    expenseId: string;
    expenseNumber: string;
    amount: string;
    reason: string;
  };
}

// ==========================================
// Claim Event Payloads
// ==========================================

export interface ClaimCreatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CLAIM_CREATED;
  data: {
    claimId: string;
    claimNumber: string;
    claimType: string;
    totalAmount: string;
    vendorId?: string;
    vendorName?: string;
  };
}

export interface ClaimStatusChangedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.CLAIM_STATUS_CHANGED;
  data: {
    claimId: string;
    claimNumber: string;
    previousStatus: string;
    newStatus: string;
  };
}

// ==========================================
// Target/Commission Event Payloads
// ==========================================

export interface TargetProgressChangedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.TARGET_PROGRESS_CHANGED;
  data: {
    targetId: string;
    targetName: string;
    currentValue: string;
    targetValue: string;
    progressPercent: number;
  };
}

export interface CommissionUpdatedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.COMMISSION_UPDATED;
  data: {
    commissionId: string;
    userId: string;
    userName: string;
    amount: string;
    status: string;
  };
}

// ==========================================
// POS Status Event Payloads
// ==========================================

export interface PosConnectedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.POS_CONNECTED;
  data: {
    deviceId: string;
    cashierId: string;
    cashierName: string;
    branchId: string;
    branchName: string;
  };
}

export interface PosDisconnectedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.POS_DISCONNECTED;
  data: {
    deviceId: string;
    cashierId: string;
    cashierName: string;
    reason: string; // 'logout', 'disconnect', 'timeout'
  };
}

export interface PosHeartbeatEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.POS_HEARTBEAT;
  data: {
    deviceId: string;
    cashierId: string;
    status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR';
    pendingOperations: number;
    lastSyncAt?: string;
  };
}

export interface PosSyncStatusChangedEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.POS_SYNC_STATUS_CHANGED;
  data: {
    deviceId: string;
    cashierId: string;
    previousStatus: string;
    newStatus: string;
    pendingCount: number;
    conflictCount: number;
    lastSyncAt?: string;
  };
}

// ==========================================
// Notification Event
// ==========================================

export interface NotificationEvent extends RealtimeEventBase {
  eventType: typeof RealtimeEvents.NOTIFICATION;
  data: {
    type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
    title: string;
    message: string;
    actionUrl?: string;
  };
}

// ==========================================
// Union Type for All Events
// ==========================================

export type RealtimeEvent =
  | SaleCreatedEvent
  | SaleVoidedEvent
  | PaymentReceivedEvent
  | StockChangedEvent
  | LowStockEvent
  | OutOfStockEvent
  | CustomerCreatedEvent
  | CustomerUpdatedEvent
  | CustomerCreditChangedEvent
  | CustomerRecoveryRecordedEvent
  | ShiftOpenedEvent
  | ShiftClosedEvent
  | ExpenseCreatedEvent
  | ExpenseCancelledEvent
  | ClaimCreatedEvent
  | ClaimStatusChangedEvent
  | TargetProgressChangedEvent
  | CommissionUpdatedEvent
  | PosConnectedEvent
  | PosDisconnectedEvent
  | PosHeartbeatEvent
  | PosSyncStatusChangedEvent
  | NotificationEvent;

// ==========================================
// Socket Connection Context
// ==========================================

export interface SocketContext {
  userId: string;
  businessId: string;
  branchId?: string;
  roleId?: string;
  permissions: string[];
  deviceId?: string;
  clientType: 'POS' | 'ADMIN';
  connectedAt: Date;
  lastHeartbeat: Date;
}

// ==========================================
// Room Names
// ==========================================

export function getBusinessRoom(businessId: string): string {
  return `business:${businessId}`;
}

export function getBranchRoom(businessId: string, branchId: string): string {
  return `branch:${businessId}:${branchId}`;
}

export function getUserRoom(userId: string): string {
  return `user:${userId}`;
}

// ==========================================
// Permission Requirements for Events
// ==========================================

export const EventPermissions: Record<RealtimeEventType, string[]> = {
  [RealtimeEvents.SALE_CREATED]: ['sales.view', 'reports.view'],
  [RealtimeEvents.SALE_VOIDED]: ['sales.view', 'reports.view'],
  [RealtimeEvents.PAYMENT_RECEIVED]: ['sales.view', 'reports.view'],
  [RealtimeEvents.STOCK_CHANGED]: ['inventory.view', 'reports.view'],
  [RealtimeEvents.LOW_STOCK]: ['inventory.view', 'reports.view'],
  [RealtimeEvents.OUT_OF_STOCK]: ['inventory.view', 'reports.view'],
  [RealtimeEvents.CUSTOMER_CREATED]: ['customers.view'],
  [RealtimeEvents.CUSTOMER_UPDATED]: ['customers.view'],
  [RealtimeEvents.CUSTOMER_CREDIT_CHANGED]: ['customers.view', 'ledger.view'],
  [RealtimeEvents.CUSTOMER_RECOVERY_RECORDED]: ['customers.view', 'ledger.view'],
  [RealtimeEvents.SHIFT_OPENED]: ['shifts.view', 'reports.view'],
  [RealtimeEvents.SHIFT_CLOSED]: ['shifts.view', 'reports.view'],
  [RealtimeEvents.EXPENSE_CREATED]: ['expenses.view', 'reports.view'],
  [RealtimeEvents.EXPENSE_CANCELLED]: ['expenses.view', 'reports.view'],
  [RealtimeEvents.CLAIM_CREATED]: ['claims.view'],
  [RealtimeEvents.CLAIM_STATUS_CHANGED]: ['claims.view'],
  [RealtimeEvents.TARGET_PROGRESS_CHANGED]: ['targets.view', 'reports.view'],
  [RealtimeEvents.COMMISSION_UPDATED]: ['commission.view', 'reports.view'],
  [RealtimeEvents.POS_CONNECTED]: ['pos.monitor'],
  [RealtimeEvents.POS_DISCONNECTED]: ['pos.monitor'],
  [RealtimeEvents.POS_HEARTBEAT]: ['pos.monitor'],
  [RealtimeEvents.POS_SYNC_STATUS_CHANGED]: ['pos.monitor'],
  [RealtimeEvents.NOTIFICATION]: [], // Notifications are filtered by content, not permission
};
