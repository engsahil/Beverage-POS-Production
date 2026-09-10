/**
 * Phase 16: Offline Database Type Definitions
 * 
 * These types define the local storage schema for the POS offline layer.
 * The local database is NOT a replacement for PostgreSQL - it is a cache
 * and transaction queue that enables temporary offline operation.
 */

// ==========================================
// Local Database Schema Version
// ==========================================

export const LOCAL_DB_VERSION = 1;
export const LOCAL_DB_NAME = 'beverage-pos-offline';

// ==========================================
// Cache Types (Read-Only from Server)
// ==========================================

/**
 * Cached product data - synced from server, not modified locally
 */
export interface CachedProduct {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  isActive: boolean;
  minStockThreshold: number | null;
  maxStockThreshold: number | null;
  categoryName: string;
  variants: CachedVariant[];
  updatedAt: string; // ISO timestamp from server
  cachedAt: string;  // ISO timestamp when cached locally
}

/**
 * Cached variant data
 */
export interface CachedVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: string; // Decimal as string
  costPrice: string | null;
  isActive: boolean;
  updatedAt: string;
}

/**
 * Cached category data
 */
export interface CachedCategory {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
  cachedAt: string;
}

/**
 * Cached unit data
 */
export interface CachedUnit {
  id: string;
  businessId: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
  updatedAt: string;
  cachedAt: string;
}

/**
 * Cached inventory snapshot - last known stock levels
 * NOT authoritative - server is always the source of truth
 */
export interface CachedInventory {
  id: string; // composite: productId-variantId-branchId
  businessId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  currentQuantity: string; // Decimal as string
  reservedQuantity: string;
  availableQuantity: string;
  stockStatus: 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCKED';
  serverUpdatedAt: string; // When server last updated this
  cachedAt: string;        // When we cached this locally
}

/**
 * Cached customer data for POS lookup
 */
export interface CachedCustomer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string; // Decimal as string
  currentBalance: string; // Decimal as string - LAST KNOWN, not authoritative
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
  cachedAt: string;
}

/**
 * Cached business/branch settings
 */
export interface CachedSettings {
  id: string; // 'business-settings'
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  currency: string;
  timezone: string;
  taxRate: string; // Decimal as string
  invoicePrefix: string;
  invoiceNextNumber: number;
  receiptWidth: '58mm' | '80mm';
  receiptShowLogo: boolean;
  receiptShowBarcode: boolean;
  receiptFooter: string | null;
  allowNegativeStock: boolean;
  branchId: string | null;
  branchName: string | null;
  updatedAt: string;
  cachedAt: string;
}

// ==========================================
// Session Context (Local State)
// ==========================================

/**
 * Authenticated cashier session context
 * Does NOT store passwords or sensitive tokens
 */
export interface CachedSession {
  id: string; // 'active-session'
  userId: string;
  username: string;
  fullName: string;
  businessId: string;
  businessName: string;
  branchId: string | null;
  branchName: string | null;
  roleId: string | null;
  roleName: string | null;
  permissions: string[]; // Permission names only
  activeShiftId: string | null;
  activeShiftNumber: string | null;
  shiftOpeningCash: string | null; // Decimal as string
  loginAt: string;
  lastActivityAt: string;
}

// ==========================================
// Transaction Queue (Pending Operations)
// ==========================================

export type QueueOperationType = 
  | 'SALE_CREATE'
  | 'SALE_VOID'
  | 'CUSTOMER_PAYMENT_CREATE'
  | 'STOCK_ADJUSTMENT'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | 'EXPENSE_CREATE';

export type QueueStatus = 
  | 'PENDING'        // Waiting to be sent to server
  | 'PROCESSING'     // Currently being sent
  | 'FAILED'         // Failed to send, needs review (includes conflicts)
  | 'RETRY_REQUIRED' // Will retry automatically
  | 'COMPLETED';     // Server confirmed (kept for audit, cleaned up later)

/**
 * Queued operation for server synchronization
 * Each operation has a stable idempotency key that survives restarts
 */
export interface QueuedOperation {
  id: string;                  // Local unique ID
  idempotencyKey: string;      // Stable key for server deduplication
  operationType: QueueOperationType;
  entityType: string;          // 'Sale', 'CustomerPayment', etc.
  entityLocalId: string | null; // Local reference if applicable
  payload: Record<string, unknown>; // Operation data
  status: QueueStatus;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  lastErrorAt: string | null;
  nextRetryAt: string | null;
  serverEntityId: string | null; // Set when server confirms
  serverResponse: Record<string, unknown> | null;
  userId: string;
  businessId: string;
  branchId: string | null;
  deviceId: string;            // Unique device identifier
  schemaVersion: number;       // For future migration support
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Offline Sale (Local Transaction Record)
// ==========================================

/**
 * Local sale record - created during offline operation
 * Will be synced to server when connection returns
 */
export interface OfflineSale {
  localId: string;             // Local unique ID
  idempotencyKey: string;      // For server deduplication
  businessId: string;
  branchId: string | null;
  shiftId: string | null;
  cashierId: string;
  cashierName: string;
  customerId: string | null;
  customerName: string | null;
  items: OfflineSaleItem[];
  subtotal: string;            // Decimal as string
  discountAmount: string;
  discountPercentage: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  outstandingAmount: string;
  payments: OfflinePayment[];
  saleDate: string;
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
  serverSaleId: string | null;
  serverSaleNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineSaleItem {
  localId: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: string;            // Decimal as string
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface OfflinePayment {
  localId: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER' | 'CREDIT';
  amount: string;              // Decimal as string
  reference: string | null;
  receivedAt: string;
}

// ==========================================
// Cache Metadata
// ==========================================

/**
 * Tracks when each cache category was last refreshed
 */
export interface CacheMetadata {
  id: string; // Category name: 'products', 'categories', 'inventory', etc.
  lastSyncAt: string;
  lastSyncVersion: string | null; // Server version/hash if available
  recordCount: number;
  businessId: string;
  branchId: string | null;
}

// ==========================================
// Network Status
// ==========================================

export type ConnectionStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR';

export interface NetworkState {
  status: ConnectionStatus;
  lastOnlineAt: string | null;
  lastSyncAt: string | null;
  pendingOperations: number;
  syncErrors: number;
}

// ==========================================
// Database Configuration
// ==========================================

export interface OfflineDBConfig {
  dbName?: string;
  version?: number;
  deviceId?: string;
  onUpgradeNeeded?: (db: IDBDatabase, oldVersion: number, newVersion: number) => void;
}

// ==========================================
// Query Options
// ==========================================

export interface CacheQueryOptions {
  businessId: string;
  branchId?: string;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface QueueQueryOptions {
  businessId: string;
  status?: QueueStatus;
  operationType?: QueueOperationType;
  limit?: number;
  offset?: number;
}
