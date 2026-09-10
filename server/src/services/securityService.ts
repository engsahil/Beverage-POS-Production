/**
 * Phase 23: Security Hardening
 * Centralized security limits and validation
 */

// ==========================================
// FILE UPLOAD LIMITS
// ==========================================

export const FILE_LIMITS = {
  // Logo upload
  LOGO_MAX_SIZE: 2 * 1024 * 1024, // 2MB
  LOGO_ALLOWED_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  LOGO_ALLOWED_EXTENSIONS: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  
  // Import files
  IMPORT_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  IMPORT_ALLOWED_TYPES: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  IMPORT_ALLOWED_EXTENSIONS: ['csv', 'xlsx', 'xls'],
  IMPORT_MAX_ROWS: 10000,
  
  // Backup files
  BACKUP_MAX_SIZE: 100 * 1024 * 1024, // 100MB
  
  // General
  MAX_FILENAME_LENGTH: 255,
} as const;

// ==========================================
// PASSWORD POLICY
// ==========================================

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL: false, // Don't make it too annoying for POS users
} as const;

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters`);
  }
  
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    errors.push(`Password cannot exceed ${PASSWORD_POLICY.MAX_LENGTH} characters`);
  }
  
  if (PASSWORD_POLICY.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (PASSWORD_POLICY.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (PASSWORD_POLICY.REQUIRE_NUMBERS && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (PASSWORD_POLICY.REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==========================================
// TEXT LIMITS
// ==========================================

export const TEXT_LIMITS = {
  // Business
  BUSINESS_NAME_MAX: 200,
  BUSINESS_ADDRESS_MAX: 500,
  
  // Products
  PRODUCT_NAME_MAX: 200,
  PRODUCT_SKU_MAX: 50,
  PRODUCT_BARCODE_MAX: 50,
  PRODUCT_DESCRIPTION_MAX: 1000,
  
  // Customers
  CUSTOMER_NAME_MAX: 200,
  CUSTOMER_PHONE_MAX: 20,
  CUSTOMER_EMAIL_MAX: 255,
  CUSTOMER_ADDRESS_MAX: 500,
  
  // Vendors
  VENDOR_NAME_MAX: 200,
  VENDOR_PHONE_MAX: 20,
  VENDOR_EMAIL_MAX: 255,
  VENDOR_ADDRESS_MAX: 500,
  
  // Receipts
  RECEIPT_HEADER_MAX: 200,
  RECEIPT_FOOTER_MAX: 500,
  RECEIPT_THANK_YOU_MAX: 200,
  
  // General
  NOTES_MAX: 1000,
  DESCRIPTION_MAX: 1000,
  SEARCH_QUERY_MAX: 200,
} as const;

// ==========================================
// NUMERIC LIMITS
// ==========================================

export const NUMERIC_LIMITS = {
  // Prices
  MIN_PRICE: 0,
  MAX_PRICE: 9999999.99,
  
  // Quantities
  MIN_QUANTITY: 0,
  MAX_QUANTITY: 999999,
  
  // Discounts
  MIN_DISCOUNT: 0,
  MAX_DISCOUNT_PERCENT: 100,
  MAX_DISCOUNT_AMOUNT: 999999.99,
  
  // Credit
  MIN_CREDIT_LIMIT: 0,
  MAX_CREDIT_LIMIT: 9999999.99,
  
  // Pagination
  MIN_PAGE: 1,
  MAX_PAGE: 10000,
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  
  // Dates
  MIN_DATE_RANGE_DAYS: 1,
  MAX_DATE_RANGE_DAYS: 365,
} as const;

// ==========================================
// RATE LIMITS
// ==========================================

export const RATE_LIMITS = {
  // Authentication
  LOGIN_ATTEMPTS_WINDOW: 15 * 60 * 1000, // 15 minutes
  LOGIN_MAX_ATTEMPTS: 10,
  
  // Sensitive operations
  SENSITIVE_WINDOW: 60 * 1000, // 1 minute
  SENSITIVE_MAX_ATTEMPTS: 10,
  
  // File uploads
  UPLOAD_WINDOW: 60 * 1000, // 1 minute
  UPLOAD_MAX_ATTEMPTS: 20,
  
  // Export
  EXPORT_WINDOW: 60 * 1000, // 1 minute
  EXPORT_MAX_ATTEMPTS: 10,
  
  // Import
  IMPORT_WINDOW: 60 * 1000, // 1 minute
  IMPORT_MAX_ATTEMPTS: 10,
  
  // WhatsApp
  WHATSAPP_WINDOW: 60 * 1000, // 1 minute
  WHATSAPP_MAX_ATTEMPTS: 5,
} as const;

// ==========================================
// INPUT SANITIZATION
// ==========================================

/**
 * Sanitize text input to prevent XSS
 */
export function sanitizeInput(text: string): string {
  if (typeof text !== 'string') return '';
  
  return text
    // Remove script tags
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    // Remove all HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove data: protocol (potential XSS vector)
    .replace(/data:/gi, '')
    // Trim whitespace
    .trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Pakistan format)
 */
export function isValidPhone(phone: string): boolean {
  // Pakistan: +92XXXXXXXXXX or 0XXXXXXXXXX
  const cleaned = phone.replace(/\s/g, '');
  return /^\+?92[0-9]{10}$|^0[0-9]{10}$/.test(cleaned);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// SECURITY HEADERS
// ==========================================

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

// ==========================================
// AUDIT EVENTS
// ==========================================

export const SECURITY_AUDIT_EVENTS = {
  // Authentication
  USER_LOGIN_SUCCESS: 'USER_LOGIN_SUCCESS',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_ACCOUNT_LOCKED: 'USER_ACCOUNT_LOCKED',
  USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  
  // Authorization
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
  
  // Data access
  SENSITIVE_DATA_EXPORTED: 'SENSITIVE_DATA_EXPORTED',
  BULK_DATA_IMPORTED: 'BULK_DATA_IMPORTED',
  
  // Configuration
  SECURITY_SETTINGS_CHANGED: 'SECURITY_SETTINGS_CHANGED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  
  // File operations
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_DOWNLOADED: 'FILE_DOWNLOADED',
  FILE_DELETED: 'FILE_DELETED',
} as const;
