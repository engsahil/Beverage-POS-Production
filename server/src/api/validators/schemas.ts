import { z } from 'zod';

// ==========================================
// Authentication Schemas
// ==========================================

export const loginSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(100, 'Username too long')
    .trim(),
  password: z.string()
    .min(1, 'Password is required'),
  businessId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
});

// ==========================================
// User Schemas
// ==========================================

export const createUserSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .trim(),
  email: z.string().email('Invalid email format').optional(),
  phone: z.string()
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Invalid Pakistan phone number format')
    .optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name too long')
    .trim(),
  roleId: z.string().uuid('Invalid role ID'),
  branchId: z.string().uuid('Invalid branch ID').optional(),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  phone: z.string()
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Invalid Pakistan phone number format')
    .optional()
    .nullable(),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name too long')
    .trim()
    .optional(),
  roleId: z.string().uuid('Invalid role ID').optional(),
  branchId: z.string().uuid('Invalid branch ID').optional().nullable(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
});

// ==========================================
// Role Schemas
// ==========================================

export const createRoleSchema = z.object({
  name: z.string()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name too long')
    .trim(),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name too long')
    .trim()
    .optional(),
  description: z.string().max(500).optional().nullable(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

// ==========================================
// Permission Schemas
// ==========================================

export const createPermissionSchema = z.object({
  name: z.string()
    .min(2, 'Permission name must be at least 2 characters')
    .max(100, 'Permission name too long')
    .regex(/^[a-z]+\.[a-z_]+$/, 'Permission name must be in format "module.action"')
    .trim(),
  module: z.string()
    .min(2, 'Module must be at least 2 characters')
    .max(100, 'Module too long')
    .trim(),
  action: z.string()
    .min(2, 'Action must be at least 2 characters')
    .max(50, 'Action too long')
    .trim(),
  description: z.string().max(500).optional(),
});

// ==========================================
// Audit Log Schemas
// ==========================================

export const auditLogSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  oldValues: z.record(z.any()).optional(),
  newValues: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// ==========================================
// Category Schemas
// ==========================================

export const createCategorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .max(100, 'Category name too long')
    .trim(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .max(100, 'Category name too long')
    .trim()
    .optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ==========================================
// Unit Schemas
// ==========================================

export const createUnitSchema = z.object({
  name: z.string()
    .min(1, 'Unit name is required')
    .max(100, 'Unit name too long')
    .trim(),
  shortCode: z.string()
    .min(1, 'Short code is required')
    .max(20, 'Short code too long')
    .trim(),
  isActive: z.boolean().default(true),
});

export const updateUnitSchema = z.object({
  name: z.string()
    .min(1, 'Unit name is required')
    .max(100, 'Unit name too long')
    .trim()
    .optional(),
  shortCode: z.string()
    .min(1, 'Short code is required')
    .max(20, 'Short code too long')
    .trim()
    .optional(),
  isActive: z.boolean().optional(),
});

// ==========================================
// Product Schemas
// ==========================================

export const createProductSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  name: z.string()
    .min(1, 'Product name is required')
    .max(255, 'Product name too long')
    .trim(),
  description: z.string().max(2000).optional(),
  sku: z.string().max(100).trim().optional(),
  barcode: z.string().max(100).trim().optional(),
  purchasePrice: z.coerce.number()
    .min(0, 'Purchase price cannot be negative')
    .max(99999999.99, 'Purchase price too large'),
  sellingPrice: z.coerce.number()
    .min(0, 'Selling price cannot be negative')
    .max(99999999.99, 'Selling price too large'),
  isActive: z.boolean().default(true),
  taxEnabled: z.boolean().default(false),
  taxRate: z.coerce.number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional(),
  discountAllowed: z.boolean().default(true),
  maxDiscountPercent: z.coerce.number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .optional(),
  minStockThreshold: z.coerce.number().int().min(0).optional(),
  maxStockThreshold: z.coerce.number().int().min(0).optional(),
  expiryTrackingEnabled: z.boolean().default(false),
  expiryWarningDays: z.coerce.number().int().min(0).optional(),
  variants: z.array(z.object({
    name: z.string().min(1).max(255).trim(),
    unitId: z.string().uuid('Invalid unit ID'),
    quantity: z.coerce.number().min(0.01, 'Quantity must be positive'),
    sku: z.string().max(100).trim().optional(),
    barcode: z.string().max(100).trim().optional(),
    purchasePrice: z.coerce.number().min(0).max(99999999.99),
    sellingPrice: z.coerce.number().min(0).max(99999999.99),
    isActive: z.boolean().default(true),
  })).optional(),
});

export const updateProductSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID').optional(),
  name: z.string()
    .min(1, 'Product name is required')
    .max(255, 'Product name too long')
    .trim()
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  sku: z.string().max(100).trim().optional().nullable(),
  barcode: z.string().max(100).trim().optional().nullable(),
  purchasePrice: z.coerce.number()
    .min(0, 'Purchase price cannot be negative')
    .max(99999999.99, 'Purchase price too large')
    .optional(),
  sellingPrice: z.coerce.number()
    .min(0, 'Selling price cannot be negative')
    .max(99999999.99, 'Selling price too large')
    .optional(),
  isActive: z.boolean().optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: z.coerce.number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional()
    .nullable(),
  discountAllowed: z.boolean().optional(),
  maxDiscountPercent: z.coerce.number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .optional()
    .nullable(),
  minStockThreshold: z.coerce.number().int().min(0).optional().nullable(),
  maxStockThreshold: z.coerce.number().int().min(0).optional().nullable(),
  expiryTrackingEnabled: z.boolean().optional(),
  expiryWarningDays: z.coerce.number().int().min(0).optional().nullable(),
});

// ==========================================
// Product Variant Schemas
// ==========================================

export const createVariantSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  name: z.string()
    .min(1, 'Variant name is required')
    .max(255, 'Variant name too long')
    .trim(),
  quantity: z.coerce.number()
    .min(0.01, 'Quantity must be positive')
    .max(99999999.99, 'Quantity too large'),
  sku: z.string().max(100).trim().optional(),
  barcode: z.string().max(100).trim().optional(),
  purchasePrice: z.coerce.number()
    .min(0, 'Purchase price cannot be negative')
    .max(99999999.99, 'Purchase price too large'),
  sellingPrice: z.coerce.number()
    .min(0, 'Selling price cannot be negative')
    .max(99999999.99, 'Selling price too large'),
  isActive: z.boolean().default(true),
});

export const updateVariantSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID').optional(),
  name: z.string()
    .min(1, 'Variant name is required')
    .max(255, 'Variant name too long')
    .trim()
    .optional(),
  quantity: z.coerce.number()
    .min(0.01, 'Quantity must be positive')
    .max(99999999.99, 'Quantity too large')
    .optional(),
  sku: z.string().max(100).trim().optional().nullable(),
  barcode: z.string().max(100).trim().optional().nullable(),
  purchasePrice: z.coerce.number()
    .min(0, 'Purchase price cannot be negative')
    .max(99999999.99, 'Purchase price too large')
    .optional(),
  sellingPrice: z.coerce.number()
    .min(0, 'Selling price cannot be negative')
    .max(99999999.99, 'Selling price too large')
    .optional(),
  isActive: z.boolean().optional(),
});

// ==========================================
// Inventory Schemas (Phase 4)
// ==========================================

export const openingStockSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').optional(),
  quantity: z.coerce.number()
    .min(0, 'Quantity must be non-negative')
    .max(99999999.99, 'Quantity too large'),
  reason: z.string().min(1, 'Reason is required').max(500),
  notes: z.string().max(2000).optional(),
  referenceType: z.string().max(100).optional(),
  referenceId: z.string().uuid().optional(),
});

export const stockAdjustmentSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').optional(),
  quantity: z.coerce.number()
    .refine(val => val !== 0, 'Adjustment quantity cannot be zero')
    .refine(val => Math.abs(val) <= 99999999.99, 'Adjustment quantity too large'),
  reason: z.string().min(1, 'Reason is required').max(500),
  notes: z.string().max(2000).optional(),
  referenceType: z.string().max(100).optional(),
  referenceId: z.string().uuid().optional(),
});

export const inventorySearchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  stockStatus: z.enum(['OUT_OF_STOCK', 'LOW_STOCK', 'NORMAL', 'OVERSTOCKED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

export const stockMovementSearchSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  movementType: z.string().optional(),
  performedBy: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// Movement types enum
export const MOVEMENT_TYPES = {
  OPENING_STOCK: 'OPENING_STOCK',
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  SALE_RETURN: 'SALE_RETURN',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  DAMAGE: 'DAMAGE',
  EXPIRED: 'EXPIRED',
  MANUAL_CORRECTION: 'MANUAL_CORRECTION',
} as const;

// Stock status enum
export const STOCK_STATUS = {
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  NORMAL: 'NORMAL',
  OVERSTOCKED: 'OVERSTOCKED',
} as const;

// Purchase status enum (Phase 5)
export const PURCHASE_STATUS = {
  DRAFT: 'DRAFT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;

// Payment status enum (Phase 5)
export const PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
} as const;

// ==========================================
// Vendor Schemas (Phase 5)
// ==========================================

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(255),
  companyName: z.string().max(255).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().regex(/^\+92[0-9]{10}$/, 'Phone must be in +92 format with 10 digits').optional(),
  whatsapp: z.string().regex(/^\+92[0-9]{10}$/, 'WhatsApp must be in +92 format with 10 digits').optional(),
  email: z.string().email('Invalid email format').max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  openingBalance: z.coerce.number()
    .min(0, 'Opening balance cannot be negative')
    .max(99999999.99, 'Opening balance too large')
    .optional()
    .default(0),
  paymentTerms: z.coerce.number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms too large')
    .optional(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').max(255).optional(),
  companyName: z.string().max(255).optional().nullable(),
  contactPerson: z.string().max(255).optional().nullable(),
  phone: z.string().regex(/^\+92[0-9]{10}$/, 'Phone must be in +92 format with 10 digits').optional().nullable(),
  whatsapp: z.string().regex(/^\+92[0-9]{10}$/, 'WhatsApp must be in +92 format with 10 digits').optional().nullable(),
  email: z.string().email('Invalid email format').max(255).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  openingBalance: z.coerce.number()
    .min(0, 'Opening balance cannot be negative')
    .max(99999999.99, 'Opening balance too large')
    .optional(),
  paymentTerms: z.coerce.number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms too large')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

export const vendorSearchSchema = z.object({
  q: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// ==========================================
// Purchase Schemas (Phase 5)
// ==========================================

export const createPurchaseSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  vendorId: z.string().uuid('Invalid vendor ID'),
  purchaseDate: z.string().datetime('Invalid date format'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    quantity: z.coerce.number()
      .min(0.01, 'Quantity must be positive')
      .max(99999999.99, 'Quantity too large'),
    purchasePrice: z.coerce.number()
      .min(0, 'Purchase price cannot be negative')
      .max(99999999.99, 'Purchase price too large'),
    discount: z.coerce.number()
      .min(0, 'Discount cannot be negative')
      .max(99999999.99, 'Discount too large')
      .optional()
      .default(0),
    tax: z.coerce.number()
      .min(0, 'Tax cannot be negative')
      .max(99999999.99, 'Tax too large')
      .optional()
      .default(0),
  })).min(1, 'At least one item is required'),
  discount: z.coerce.number()
    .min(0, 'Discount cannot be negative')
    .max(99999999.99, 'Discount too large')
    .optional()
    .default(0),
  tax: z.coerce.number()
    .min(0, 'Tax cannot be negative')
    .max(99999999.99, 'Tax too large')
    .optional()
    .default(0),
  amountPaid: z.coerce.number()
    .min(0, 'Amount paid cannot be negative')
    .max(99999999.99, 'Amount paid too large')
    .optional()
    .default(0),
  notes: z.string().max(2000).optional(),
});

export const updatePurchaseSchema = z.object({
  vendorId: z.string().uuid('Invalid vendor ID').optional(),
  purchaseDate: z.string().datetime('Invalid date format').optional(),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    quantity: z.coerce.number()
      .min(0.01, 'Quantity must be positive')
      .max(99999999.99, 'Quantity too large'),
    purchasePrice: z.coerce.number()
      .min(0, 'Purchase price cannot be negative')
      .max(99999999.99, 'Purchase price too large'),
    discount: z.coerce.number()
      .min(0, 'Discount cannot be negative')
      .max(99999999.99, 'Discount too large')
      .optional()
      .default(0),
    tax: z.coerce.number()
      .min(0, 'Tax cannot be negative')
      .max(99999999.99, 'Tax too large')
      .optional()
      .default(0),
  })).min(1, 'At least one item is required').optional(),
  discount: z.coerce.number()
    .min(0, 'Discount cannot be negative')
    .max(99999999.99, 'Discount too large')
    .optional(),
  tax: z.coerce.number()
    .min(0, 'Tax cannot be negative')
    .max(99999999.99, 'Tax too large')
    .optional(),
  amountPaid: z.coerce.number()
    .min(0, 'Amount paid cannot be negative')
    .max(99999999.99, 'Amount paid too large')
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const purchaseSearchSchema = z.object({
  q: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// ==========================================
// Product Search/Filter Schemas
// ==========================================

export const productSearchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// ==========================================
// Common Schemas
// ==========================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ==========================================
// Phase 6 Schemas: Stock Counts, Transfers, Expiry
// ==========================================

// Stock Count Schemas (Phase 6)
export const createStockCountSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  countDate: z.string().datetime('Invalid date format'),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    physicalQuantity: z.coerce.number()
      .min(0, 'Physical quantity cannot be negative')
      .max(99999999.99, 'Quantity too large'),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one item is required'),
});

export const stockCountSearchSchema = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// Transfer Schemas (Phase 6)
export const createTransferSchema = z.object({
  sourceBranchId: z.string().uuid('Invalid source branch ID'),
  destinationBranchId: z.string().uuid('Invalid destination branch ID'),
  transferDate: z.string().datetime('Invalid date format'),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    quantity: z.coerce.number()
      .min(0.01, 'Quantity must be positive')
      .max(99999999.99, 'Quantity too large'),
  })).min(1, 'At least one item is required'),
}).refine(
  (data) => data.sourceBranchId !== data.destinationBranchId,
  { message: 'Source and destination branches must be different', path: ['destinationBranchId'] }
);

export const transferSearchSchema = z.object({
  sourceBranchId: z.string().uuid().optional(),
  destinationBranchId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

// Stock Batch / Expiry Schemas (Phase 6)
export const createBatchSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  productId: z.string().uuid('Invalid product ID'),
  variantId: z.string().uuid('Invalid variant ID').optional(),
  batchNumber: z.string().max(100).trim().optional(),
  quantity: z.coerce.number()
    .min(0, 'Quantity cannot be negative')
    .max(99999999.99, 'Quantity too large'),
  receivedDate: z.string().datetime('Invalid date format'),
  expiryDate: z.string().datetime('Invalid date format').optional(),
  manufacturingDate: z.string().datetime('Invalid date format').optional(),
  purchaseId: z.string().uuid('Invalid purchase ID').optional(),
});

export const batchSearchSchema = z.object({
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  status: z.enum(['NOT_TRACKED', 'VALID', 'EXPIRING_SOON', 'EXPIRED']).optional(),
  hasExpiry: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

export const expirySearchSchema = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum(['NOT_TRACKED', 'VALID', 'EXPIRING_SOON', 'EXPIRED']).optional(),
  productId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

// Transfer/Count status enums (Phase 6)
export const STOCK_COUNT_STATUS = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export const TRANSFER_STATUS = {
  DRAFT: 'DRAFT',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;

export const EXPIRY_STATUS = {
  NOT_TRACKED: 'NOT_TRACKED',
  VALID: 'VALID',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
} as const;
