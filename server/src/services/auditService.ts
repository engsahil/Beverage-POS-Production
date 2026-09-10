import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuditLogData {
  businessId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// Actions that should be logged
export const AuditActions = {
  // Authentication
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_ACCOUNT_LOCKED: 'USER_ACCOUNT_LOCKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',

  // User management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',

  // Role management
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  ROLE_PERMISSIONS_UPDATED: 'ROLE_PERMISSIONS_UPDATED',

  // Permission management
  PERMISSION_CREATED: 'PERMISSION_CREATED',
  PERMISSION_UPDATED: 'PERMISSION_UPDATED',
  PERMISSION_DELETED: 'PERMISSION_DELETED',

  // System
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  DATA_EXPORTED: 'DATA_EXPORTED',
  DATA_IMPORTED: 'DATA_IMPORTED',

  // Settings (Phase 22)
  SETTING_UPDATED: 'SETTING_UPDATED',
  LOGO_UPLOADED: 'LOGO_UPLOADED',
  LOGO_REMOVED: 'LOGO_REMOVED',
  BACKUP_CREATED: 'BACKUP_CREATED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  BACKUP_FAILED: 'BACKUP_FAILED',
  BACKUP_RETRIED: 'BACKUP_RETRIED',
  BACKUP_DELETED: 'BACKUP_DELETED',
  BACKUP_RESTORE_FAILED: 'BACKUP_RESTORE_FAILED',
  STORAGE_CONFIG_UPDATED: 'STORAGE_CONFIG_UPDATED',

  // WhatsApp (Phase 20)
  WHATSAPP_CONFIG_UPDATED: 'WHATSAPP_CONFIG_UPDATED',
  WHATSAPP_TEST_SENT: 'WHATSAPP_TEST_SENT',
  WHATSAPP_SHIFT_REPORT_SENT: 'WHATSAPP_SHIFT_REPORT_SENT',
  WHATSAPP_MESSAGE_FAILED: 'WHATSAPP_MESSAGE_FAILED',
  WHATSAPP_MESSAGE_RETRIED: 'WHATSAPP_MESSAGE_RETRIED',

  // Product catalog
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DISABLED: 'CATEGORY_DISABLED',
  CATEGORY_ENABLED: 'CATEGORY_ENABLED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  UNIT_CREATED: 'UNIT_CREATED',
  UNIT_UPDATED: 'UNIT_UPDATED',
  UNIT_DISABLED: 'UNIT_DISABLED',
  UNIT_ENABLED: 'UNIT_ENABLED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DISABLED: 'PRODUCT_DISABLED',
  PRODUCT_ENABLED: 'PRODUCT_ENABLED',
  VARIANT_CREATED: 'VARIANT_CREATED',
  VARIANT_UPDATED: 'VARIANT_UPDATED',
  VARIANT_DISABLED: 'VARIANT_DISABLED',
  VARIANT_ENABLED: 'VARIANT_ENABLED',
  PRICE_UPDATED: 'PRICE_UPDATED',
  BARCODE_UPDATED: 'BARCODE_UPDATED',
  SKU_UPDATED: 'SKU_UPDATED',

  // Inventory (Phase 4)
  INVENTORY_OPENING_STOCK: 'INVENTORY_OPENING_STOCK',
  INVENTORY_ADJUSTMENT_INCREASE: 'INVENTORY_ADJUSTMENT_INCREASE',
  INVENTORY_ADJUSTMENT_DECREASE: 'INVENTORY_ADJUSTMENT_DECREASE',
  INVENTORY_MOVEMENT_CREATED: 'INVENTORY_MOVEMENT_CREATED',
  INVENTORY_CONFIGURATION_UPDATED: 'INVENTORY_CONFIGURATION_UPDATED',

  // Purchasing & Vendors (Phase 5)
  VENDOR_CREATED: 'VENDOR_CREATED',
  VENDOR_UPDATED: 'VENDOR_UPDATED',
  VENDOR_DISABLED: 'VENDOR_DISABLED',
  VENDOR_ENABLED: 'VENDOR_ENABLED',
  PURCHASE_CREATED: 'PURCHASE_CREATED',
  PURCHASE_UPDATED: 'PURCHASE_UPDATED',
  PURCHASE_RECEIVED: 'PURCHASE_RECEIVED',
  PURCHASE_CANCELLED: 'PURCHASE_CANCELLED',
  PURCHASE_PAYMENT_UPDATED: 'PURCHASE_PAYMENT_UPDATED',

  // Stock Adjustments, Transfers & Expiry (Phase 6)
  STOCK_COUNT_CREATED: 'STOCK_COUNT_CREATED',
  STOCK_COUNT_CONFIRMED: 'STOCK_COUNT_CONFIRMED',
  STOCK_COUNT_CANCELLED: 'STOCK_COUNT_CANCELLED',
  TRANSFER_CREATED: 'TRANSFER_CREATED',
  TRANSFER_APPROVED: 'TRANSFER_APPROVED',
  TRANSFER_RECEIVED: 'TRANSFER_RECEIVED',
  TRANSFER_CANCELLED: 'TRANSFER_CANCELLED',
  EXPIRY_PROCESSED: 'EXPIRY_PROCESSED',
  BATCH_CREATED: 'BATCH_CREATED',
  BATCH_UPDATED: 'BATCH_UPDATED',

  // Business operations
  SALE_CREATED: 'SALE_CREATED',
  SALE_VOIDED: 'SALE_VOIDED',
  SALE_REFUNDED: 'SALE_REFUNDED',
  INVENTORY_ADJUSTED: 'INVENTORY_ADJUSTED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  SHIFT_OPENED: 'SHIFT_OPENED',
  SHIFT_CLOSED: 'SHIFT_CLOSED',

  // Phase 8: Payments & Discounts
  DISCOUNT_APPLIED: 'DISCOUNT_APPLIED',
  DISCOUNT_OVERRIDDEN: 'DISCOUNT_OVERRIDDEN',
  PRICE_OVERRIDE: 'PRICE_OVERRIDE',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  UNAUTHORIZED_DISCOUNT_ATTEMPT: 'UNAUTHORIZED_DISCOUNT_ATTEMPT',
  UNAUTHORIZED_PRICE_OVERRIDE_ATTEMPT: 'UNAUTHORIZED_PRICE_OVERRIDE_ATTEMPT',

  // Phase 9: Receipts & Printing
  RECEIPT_GENERATED: 'RECEIPT_GENERATED',
  RECEIPT_REPRINTED: 'RECEIPT_REPRINTED',
  SHORT_ORDER_PRINTED: 'SHORT_ORDER_PRINTED',
  RECEIPT_PDF_GENERATED: 'RECEIPT_PDF_GENERATED',

  // Phase 10: Customers, Credit & Ledger
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_CREDIT_LIMIT_CHANGED: 'CUSTOMER_CREDIT_LIMIT_CHANGED',
  CUSTOMER_PAYMENT_RECORDED: 'CUSTOMER_PAYMENT_RECORDED',
  CREDIT_SALE_CREATED: 'CREDIT_SALE_CREATED',
  CUSTOMER_LEDGER_ENTRY: 'CUSTOMER_LEDGER_ENTRY',

  // Phase 11: Expenses & Claims
  EXPENSE_CATEGORY_CREATED: 'EXPENSE_CATEGORY_CREATED',
  EXPENSE_CATEGORY_UPDATED: 'EXPENSE_CATEGORY_UPDATED',
  EXPENSE_CATEGORY_ENABLED: 'EXPENSE_CATEGORY_ENABLED',
  EXPENSE_CATEGORY_DISABLED: 'EXPENSE_CATEGORY_DISABLED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  EXPENSE_UPDATED: 'EXPENSE_UPDATED',
  EXPENSE_CANCELLED: 'EXPENSE_CANCELLED',
  CLAIM_CREATED: 'CLAIM_CREATED',
  CLAIM_UPDATED: 'CLAIM_UPDATED',
  CLAIM_SUBMITTED: 'CLAIM_SUBMITTED',
  CLAIM_UNDER_REVIEW: 'CLAIM_UNDER_REVIEW',
  CLAIM_APPROVED: 'CLAIM_APPROVED',
  CLAIM_REJECTED: 'CLAIM_REJECTED',
  CLAIM_RESOLVED: 'CLAIM_RESOLVED',
  CLAIM_CANCELLED: 'CLAIM_CANCELLED',
  CLAIM_INVENTORY_ACTION: 'CLAIM_INVENTORY_ACTION',

  // Phase 12: Targets & Commission
  TARGET_CREATED: 'TARGET_CREATED',
  TARGET_UPDATED: 'TARGET_UPDATED',
  TARGET_CANCELLED: 'TARGET_CANCELLED',
  COMMISSION_RULE_CREATED: 'COMMISSION_RULE_CREATED',
  COMMISSION_RULE_UPDATED: 'COMMISSION_RULE_UPDATED',
  COMMISSION_RULE_ENABLED: 'COMMISSION_RULE_ENABLED',
  COMMISSION_RULE_DISABLED: 'COMMISSION_RULE_DISABLED',
  COMMISSION_CALCULATED: 'COMMISSION_CALCULATED',
  COMMISSION_APPROVED: 'COMMISSION_APPROVED',
  COMMISSION_REJECTED: 'COMMISSION_REJECTED',
  COMMISSION_PAID: 'COMMISSION_PAID',

  // Phase 13: Cashier Shifts & Daily Open/Close
  SHIFT_CANCELLED: 'SHIFT_CANCELLED',
  SHIFT_OVERRIDE: 'SHIFT_OVERRIDE',
  DAILY_OPENED: 'DAILY_OPENED',
  DAILY_CLOSED: 'DAILY_CLOSED',

  // Phase 14: Reports
  REPORT_EXPORTED: 'REPORT_EXPORTED',
} as const;

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        businessId: data.businessId,
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValues: data.oldValues as object | undefined,
        newValues: data.newValues as object | undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata as object | undefined,
      },
    });
  } catch (error) {
    // Don't throw, just log - audit logging should never break the main flow
    logger.error('Failed to create audit log', {
      error: String(error),
      data: {
        action: data.action,
        entityType: data.entityType,
        userId: data.userId,
      },
    });
  }
}

/**
 * Get audit logs with pagination and filtering
 */
export async function getAuditLogs(params: {
  businessId: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const {
    businessId,
    userId,
    action,
    entityType,
    entityId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = params;

  const where: Record<string, unknown> = { businessId };

  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
