/**
 * Phase 22: Settings Service
 * Centralized settings management with validation and audit logging
 */

import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createAuditLog } from './auditService.js';
import { getStorageProvider } from './storage/storageFactory.js';

// ==========================================
// SETTINGS TYPES
// ==========================================

export interface BusinessProfile {
  name: string;
  displayName?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  registrationNumber?: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  language: string;
}

export interface ReceiptSettings {
  paperSize: '58mm' | '80mm';
  showLogo: boolean;
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showWhatsApp: boolean;
  showEmail: boolean;
  showTaxNumber: boolean;
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCashier: boolean;
  showBranch: boolean;
  showCustomer: boolean;
  showSKU: boolean;
  showBarcode: boolean;
  showVariant: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showLineTotal: boolean;
  showSubtotal: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showGrandTotal: boolean;
  showPaidAmount: boolean;
  showChange: boolean;
  showPaymentMethod: boolean;
  showCreditInfo: boolean;
  headerText?: string;
  footerText?: string;
  thankYouMessage?: string;
  returnPolicy?: string;
}

export interface InvoiceSettings {
  prefix: string;
  nextNumber: number;
  padLength: number;
  resetAnnually: boolean;
  lastResetDate?: string;
}

export interface POSSettings {
  paymentMethods: {
    CASH: boolean;
    CARD: boolean;
    BANK_TRANSFER: boolean;
    OTHER: boolean;
  };
  paymentMethodNames: {
    CASH: string;
    CARD: string;
    BANK_TRANSFER: string;
    OTHER: string;
  };
  allowDiscount: boolean;
  maxDiscountPercent: number;
  allowPriceOverride: boolean;
  requireShiftOpen: boolean;
  allowNegativeStock: boolean;
}

export interface InventorySettings {
  defaultLowStockThreshold: number;
  expiryWarningDays: number;
  allowNegativeStock: boolean;
  trackBatches: boolean;
  autoReserveStock: boolean;
}

export interface CustomerSettings {
  defaultCreditLimit: number;
  requireCreditApproval: boolean;
  allowRecovery: boolean;
  maxCreditDays: number;
}

export interface CloudSettings {
  backupEnabled: boolean;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
}

export interface WhatsAppSettings {
  enabled: boolean;
  adminPhoneNumber?: string;
  shiftClosingNotifications: boolean;
  dailyReportNotifications: boolean;
}

export interface POSOfflineSettings {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  maxQueueSize: number;
  retryAttempts: number;
}

export interface POSScannerSettings {
  enabled: boolean;
  enterSuffix: boolean;
  prefix: string;
  suffix: string;
  inputDelay: number;
  unknownBarcodeBehavior: string;
  duplicateScanBehavior: string;
}

// ==========================================
// DEFAULT SETTINGS
// ==========================================

const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  name: 'My Business',
  currency: 'PKR',
  currencySymbol: 'Rs',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'HH:mm',
  timezone: 'Asia/Karachi',
  language: 'en',
  country: 'Pakistan',
};

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  paperSize: '80mm',
  showLogo: true,
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showWhatsApp: false,
  showEmail: false,
  showTaxNumber: false,
  showInvoiceNumber: true,
  showDateTime: true,
  showCashier: true,
  showBranch: true,
  showCustomer: true,
  showSKU: false,
  showBarcode: true,
  showVariant: true,
  showQuantity: true,
  showUnitPrice: true,
  showLineTotal: true,
  showSubtotal: true,
  showDiscount: true,
  showTax: true,
  showGrandTotal: true,
  showPaidAmount: true,
  showChange: true,
  showPaymentMethod: true,
  showCreditInfo: true,
  footerText: 'Thank you for your business!',
  thankYouMessage: 'Thank you for your purchase!',
};

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  prefix: 'INV',
  nextNumber: 1,
  padLength: 6,
  resetAnnually: false,
};

const DEFAULT_POS_SETTINGS: POSSettings = {
  paymentMethods: {
    CASH: true,
    CARD: true,
    BANK_TRANSFER: true,
    OTHER: false,
  },
  paymentMethodNames: {
    CASH: 'Cash',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer',
    OTHER: 'Other',
  },
  allowDiscount: true,
  maxDiscountPercent: 20,
  allowPriceOverride: false,
  requireShiftOpen: true,
  allowNegativeStock: false,
};

const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  defaultLowStockThreshold: 10,
  expiryWarningDays: 30,
  allowNegativeStock: false,
  trackBatches: true,
  autoReserveStock: false,
};

const DEFAULT_CUSTOMER_SETTINGS: CustomerSettings = {
  defaultCreditLimit: 0,
  requireCreditApproval: false,
  allowRecovery: true,
  maxCreditDays: 30,
};

const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  backupEnabled: true,
  autoBackup: true,
  backupFrequency: 'daily',
  retentionDays: 30,
};

const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  enabled: false,
  shiftClosingNotifications: true,
  dailyReportNotifications: false,
};

const DEFAULT_POS_OFFLINE_SETTINGS: POSOfflineSettings = {
  enabled: true,
  autoSync: true,
  syncInterval: 30,
  maxQueueSize: 100,
  retryAttempts: 3,
};

const DEFAULT_POS_SCANNER_SETTINGS: POSScannerSettings = {
  enabled: true,
  enterSuffix: true,
  prefix: '',
  suffix: '',
  inputDelay: 50,
  unknownBarcodeBehavior: 'SEARCH',
  duplicateScanBehavior: 'INCREMENT',
};

// ==========================================
// SETTINGS KEYS
// ==========================================

export const SETTINGS_KEYS = {
  BUSINESS_PROFILE: 'business_profile',
  RECEIPT: 'receipt_settings',
  INVOICE: 'invoice_settings',
  POS: 'pos_settings',
  INVENTORY: 'inventory_settings',
  CUSTOMER: 'customer_settings',
  CLOUD: 'cloud_settings',
  WHATSAPP: 'whatsapp_settings',
  POS_OFFLINE: 'pos_offline_settings',
  POS_SCANNER: 'pos_scanner_settings',
  POS_QUICK_KEYS: 'pos_quick_keys',
  POS_SHORTCUTS: 'pos_shortcuts',
} as const;

// ==========================================
// POS QUICK KEYS & SHORTCUTS TYPES
// ==========================================

export interface QuickKeyItem {
  id: string;
  productId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ShortcutItem {
  id: string;
  action: string;
  key: string;
  description: string;
  isCustom: boolean;
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: '1', action: 'new_order', key: 'F2', description: 'Start new order / clear cart', isCustom: false },
  { id: '2', action: 'payment', key: 'F4', description: 'Open checkout payment modal', isCustom: false },
  { id: '3', action: 'hold_sale', key: 'F5', description: 'Hold current active cart', isCustom: false },
  { id: '4', action: 'sales_history', key: 'F8', description: 'View sales receipt log', isCustom: false },
  { id: '5', action: 'close_modal', key: 'Escape', description: 'Close modal / cancel prompt', isCustom: false },
  { id: '6', action: 'search', key: 'Ctrl+F', description: 'Focus product search bar', isCustom: false },
  { id: '7', action: 'print', key: 'Ctrl+P', description: 'Trigger thermal receipt reprint', isCustom: false },
];

// ==========================================
// GET SETTINGS
// ==========================================

export async function getSettings<T>(
  businessId: string,
  key: string,
  defaultValue: T
): Promise<T> {
  try {
    const setting = await prisma.setting.findUnique({
      where: {
        businessId_key: { businessId, key },
      },
    });

    if (setting && setting.value) {
      return { ...defaultValue, ...(setting.value as any) };
    }
  } catch (error) {
    logger.error('Failed to get settings', { businessId, key, error: String(error) });
  }

  return defaultValue;
}

export async function getBusinessProfile(businessId: string): Promise<BusinessProfile> {
  const settings = await getSettings(businessId, SETTINGS_KEYS.BUSINESS_PROFILE, DEFAULT_BUSINESS_PROFILE);
  
  // Also get business name from Business model
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, logoUrl: true, address: true, phone: true, whatsapp: true, email: true, taxNumber: true, currency: true, timezone: true },
  });

  if (business) {
    return {
      ...settings,
      name: business.name,
      address: business.address || settings.address,
      phone: business.phone || settings.phone,
      whatsapp: business.whatsapp || settings.whatsapp,
      email: business.email || settings.email,
      taxNumber: business.taxNumber || settings.taxNumber,
      currency: business.currency || settings.currency,
      timezone: business.timezone || settings.timezone,
    };
  }

  return settings;
}

export async function getReceiptSettings(businessId: string): Promise<ReceiptSettings> {
  return getSettings(businessId, SETTINGS_KEYS.RECEIPT, DEFAULT_RECEIPT_SETTINGS);
}

export async function getInvoiceSettings(businessId: string): Promise<InvoiceSettings> {
  return getSettings(businessId, SETTINGS_KEYS.INVOICE, DEFAULT_INVOICE_SETTINGS);
}

export async function getPOSSettings(businessId: string): Promise<POSSettings> {
  return getSettings(businessId, SETTINGS_KEYS.POS, DEFAULT_POS_SETTINGS);
}

export async function getInventorySettings(businessId: string): Promise<InventorySettings> {
  return getSettings(businessId, SETTINGS_KEYS.INVENTORY, DEFAULT_INVENTORY_SETTINGS);
}

export async function getCustomerSettings(businessId: string): Promise<CustomerSettings> {
  return getSettings(businessId, SETTINGS_KEYS.CUSTOMER, DEFAULT_CUSTOMER_SETTINGS);
}

export async function getCloudSettings(businessId: string): Promise<CloudSettings> {
  return getSettings(businessId, SETTINGS_KEYS.CLOUD, DEFAULT_CLOUD_SETTINGS);
}

export async function getWhatsAppSettings(businessId: string): Promise<WhatsAppSettings> {
  return getSettings(businessId, SETTINGS_KEYS.WHATSAPP, DEFAULT_WHATSAPP_SETTINGS);
}

export async function getPOSOfflineSettings(businessId: string): Promise<POSOfflineSettings> {
  return getSettings(businessId, SETTINGS_KEYS.POS_OFFLINE, DEFAULT_POS_OFFLINE_SETTINGS);
}

export async function getPOSScannerSettings(businessId: string): Promise<POSScannerSettings> {
  return getSettings(businessId, SETTINGS_KEYS.POS_SCANNER, DEFAULT_POS_SCANNER_SETTINGS);
}

// ==========================================
// UPDATE SETTINGS
// ==========================================

export async function updateSettings<T>(
  businessId: string,
  userId: string,
  key: string,
  value: T,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const existing = await prisma.setting.findUnique({
    where: {
      businessId_key: { businessId, key },
    },
  });

  const oldValue = existing?.value;

  await prisma.setting.upsert({
    where: {
      businessId_key: { businessId, key },
    },
    update: {
      value: value as any,
    },
    create: {
      businessId,
      key,
      value: value as any,
    },
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: 'SETTING_UPDATED',
    entityType: 'Setting',
    entityId: key,
    oldValues: oldValue ? { value: oldValue } : undefined,
    newValues: { value },
    ipAddress,
    userAgent,
  });

  logger.info('Settings updated', { businessId, key, userId });
}

export async function updateBusinessProfile(
  businessId: string,
  userId: string,
  profile: Partial<BusinessProfile>,
  ipAddress?: string,
  userAgent?: string
): Promise<BusinessProfile> {
  // Validate
  if (profile.name && profile.name.trim().length === 0) {
    throw new Error('Business name cannot be empty');
  }

  if (profile.phone && !isValidPhone(profile.phone)) {
    throw new Error('Invalid phone number format');
  }

  if (profile.whatsapp && !isValidPhone(profile.whatsapp)) {
    throw new Error('Invalid WhatsApp number format');
  }

  if (profile.email && !isValidEmail(profile.email)) {
    throw new Error('Invalid email format');
  }

  // Update Business model for core fields
  const businessUpdate: any = {};
  if (profile.name) businessUpdate.name = profile.name;
  if (profile.address !== undefined) businessUpdate.address = profile.address;
  if (profile.phone !== undefined) businessUpdate.phone = profile.phone;
  if (profile.whatsapp !== undefined) businessUpdate.whatsapp = profile.whatsapp;
  if (profile.email !== undefined) businessUpdate.email = profile.email;
  if (profile.taxNumber !== undefined) businessUpdate.taxNumber = profile.taxNumber;
  if (profile.currency) businessUpdate.currency = profile.currency;
  if (profile.timezone) businessUpdate.timezone = profile.timezone;

  if (Object.keys(businessUpdate).length > 0) {
    await prisma.business.update({
      where: { id: businessId },
      data: businessUpdate,
    });
  }

  // Update settings for extended fields
  const currentProfile = await getBusinessProfile(businessId);
  const updatedProfile = { ...currentProfile, ...profile };

  await updateSettings(businessId, userId, SETTINGS_KEYS.BUSINESS_PROFILE, updatedProfile, ipAddress, userAgent);

  return updatedProfile;
}

export async function updateReceiptSettings(
  businessId: string,
  userId: string,
  settings: Partial<ReceiptSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<ReceiptSettings> {
  // Validate
  if (settings.paperSize && !['58mm', '80mm'].includes(settings.paperSize)) {
    throw new Error('Invalid paper size. Must be 58mm or 80mm');
  }

  if (settings.headerText && settings.headerText.length > 200) {
    throw new Error('Header text cannot exceed 200 characters');
  }

  if (settings.footerText && settings.footerText.length > 500) {
    throw new Error('Footer text cannot exceed 500 characters');
  }

  // Sanitize text fields
  if (settings.headerText) settings.headerText = sanitizeText(settings.headerText);
  if (settings.footerText) settings.footerText = sanitizeText(settings.footerText);
  if (settings.thankYouMessage) settings.thankYouMessage = sanitizeText(settings.thankYouMessage);
  if (settings.returnPolicy) settings.returnPolicy = sanitizeText(settings.returnPolicy);

  const current = await getReceiptSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.RECEIPT, updated, ipAddress, userAgent);

  return updated;
}

export async function updateInvoiceSettings(
  businessId: string,
  userId: string,
  settings: Partial<InvoiceSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<InvoiceSettings> {
  // Validate
  if (settings.nextNumber !== undefined) {
    if (settings.nextNumber < 1) {
      throw new Error('Invoice number must be at least 1');
    }
    if (!Number.isInteger(settings.nextNumber)) {
      throw new Error('Invoice number must be an integer');
    }
  }

  if (settings.padLength !== undefined) {
    if (settings.padLength < 4 || settings.padLength > 10) {
      throw new Error('Pad length must be between 4 and 10');
    }
  }

  if (settings.prefix && settings.prefix.length > 10) {
    throw new Error('Prefix cannot exceed 10 characters');
  }

  const current = await getInvoiceSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.INVOICE, updated, ipAddress, userAgent);

  return updated;
}

export async function updatePOSSettings(
  businessId: string,
  userId: string,
  settings: Partial<POSSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<POSSettings> {
  // Validate
  if (settings.maxDiscountPercent !== undefined) {
    if (settings.maxDiscountPercent < 0 || settings.maxDiscountPercent > 100) {
      throw new Error('Max discount must be between 0 and 100');
    }
  }

  const current = await getPOSSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.POS, updated, ipAddress, userAgent);

  return updated;
}

export async function updateInventorySettings(
  businessId: string,
  userId: string,
  settings: Partial<InventorySettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<InventorySettings> {
  // Validate
  if (settings.defaultLowStockThreshold !== undefined && settings.defaultLowStockThreshold < 0) {
    throw new Error('Low stock threshold cannot be negative');
  }

  if (settings.expiryWarningDays !== undefined && settings.expiryWarningDays < 0) {
    throw new Error('Expiry warning days cannot be negative');
  }

  const current = await getInventorySettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.INVENTORY, updated, ipAddress, userAgent);

  return updated;
}

export async function updateCustomerSettings(
  businessId: string,
  userId: string,
  settings: Partial<CustomerSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<CustomerSettings> {
  // Validate
  if (settings.defaultCreditLimit !== undefined && settings.defaultCreditLimit < 0) {
    throw new Error('Credit limit cannot be negative');
  }

  if (settings.maxCreditDays !== undefined && settings.maxCreditDays < 0) {
    throw new Error('Max credit days cannot be negative');
  }

  const current = await getCustomerSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.CUSTOMER, updated, ipAddress, userAgent);

  return updated;
}

export async function updateCloudSettings(
  businessId: string,
  userId: string,
  settings: Partial<CloudSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<CloudSettings> {
  // Validate
  if (settings.retentionDays !== undefined && settings.retentionDays < 1) {
    throw new Error('Retention days must be at least 1');
  }

  if (settings.backupFrequency && !['daily', 'weekly', 'monthly'].includes(settings.backupFrequency)) {
    throw new Error('Invalid backup frequency');
  }

  const current = await getCloudSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.CLOUD, updated, ipAddress, userAgent);

  return updated;
}

export async function updateWhatsAppSettings(
  businessId: string,
  userId: string,
  settings: Partial<WhatsAppSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<WhatsAppSettings> {
  // Validate
  if (settings.adminPhoneNumber && !isValidPhone(settings.adminPhoneNumber)) {
    throw new Error('Invalid phone number format. Use +92XXXXXXXXXX format');
  }

  const current = await getWhatsAppSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.WHATSAPP, updated, ipAddress, userAgent);

  // Also update WhatsAppConfig model if enabled/phone changed
  if (settings.enabled !== undefined || settings.adminPhoneNumber !== undefined) {
    await prisma.whatsAppConfig.upsert({
      where: { businessId },
      update: {
        enabled: updated.enabled,
        adminPhoneNumber: updated.adminPhoneNumber,
      },
      create: {
        businessId,
        enabled: updated.enabled,
        adminPhoneNumber: updated.adminPhoneNumber,
      },
    });
  }

  return updated;
}

export async function updatePOSOfflineSettings(
  businessId: string,
  userId: string,
  settings: Partial<POSOfflineSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<POSOfflineSettings> {
  // Validate
  if (settings.syncInterval !== undefined && settings.syncInterval < 5) {
    throw new Error('Sync interval must be at least 5 seconds');
  }

  if (settings.maxQueueSize !== undefined && (settings.maxQueueSize < 1 || settings.maxQueueSize > 10000)) {
    throw new Error('Max queue size must be between 1 and 10000');
  }

  if (settings.retryAttempts !== undefined && (settings.retryAttempts < 0 || settings.retryAttempts > 10)) {
    throw new Error('Retry attempts must be between 0 and 10');
  }

  const current = await getPOSOfflineSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_OFFLINE, updated, ipAddress, userAgent);

  return updated;
}

export async function updatePOSScannerSettings(
  businessId: string,
  userId: string,
  settings: Partial<POSScannerSettings>,
  ipAddress?: string,
  userAgent?: string
): Promise<POSScannerSettings> {
  // Validate
  if (settings.inputDelay !== undefined && (settings.inputDelay < 0 || settings.inputDelay > 1000)) {
    throw new Error('Input delay must be between 0 and 1000 ms');
  }

  const current = await getPOSScannerSettings(businessId);
  const updated = { ...current, ...settings };

  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_SCANNER, updated, ipAddress, userAgent);

  return updated;
}

// ==========================================
// POS QUICK KEYS
// ==========================================

function sortQuickKeys(keys: QuickKeyItem[]): QuickKeyItem[] {
  return [...keys].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getQuickKeys(businessId: string): Promise<QuickKeyItem[]> {
  const keys = await getSettings<QuickKeyItem[]>(businessId, SETTINGS_KEYS.POS_QUICK_KEYS, []);
  return sortQuickKeys(Array.isArray(keys) ? keys : []);
}

export async function getQuickKeysEnriched(businessId: string) {
  const keys = await getQuickKeys(businessId);
  if (keys.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { businessId, id: { in: keys.map(k => k.productId) } },
    select: { id: true, name: true, sellingPrice: true },
  });
  const byId = new Map(products.map((p: any) => [p.id, p]));

  // Drop keys whose product no longer exists (keeps UI crash-free)
  return keys
    .filter(k => byId.has(k.productId))
    .map(k => ({ ...k, product: byId.get(k.productId)! }));
}

export async function createQuickKey(
  businessId: string,
  userId: string,
  input: { productId: string; label?: string; sortOrder?: number; isActive?: boolean },
  ipAddress?: string,
  userAgent?: string
): Promise<QuickKeyItem[]> {
  if (!input.productId) throw new Error('Product is required');

  const product = await prisma.product.findFirst({
    where: { id: input.productId, businessId },
    select: { id: true },
  });
  if (!product) throw new Error('Product not found');

  const keys = await getQuickKeys(businessId);
  const nextOrder = input.sortOrder ?? (keys.length > 0 ? Math.max(...keys.map(k => k.sortOrder)) + 1 : 0);

  const item: QuickKeyItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    productId: input.productId,
    label: (input.label || '').trim(),
    sortOrder: nextOrder,
    isActive: input.isActive ?? true,
  };

  const updated = sortQuickKeys([...keys, item]);
  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_QUICK_KEYS, updated, ipAddress, userAgent);
  return updated;
}

export async function updateQuickKey(
  businessId: string,
  userId: string,
  id: string,
  input: { label?: string; isActive?: boolean },
  ipAddress?: string,
  userAgent?: string
): Promise<QuickKeyItem[]> {
  const keys = await getQuickKeys(businessId);
  const idx = keys.findIndex(k => k.id === id);
  if (idx === -1) throw new Error('Quick key not found');

  if (input.label !== undefined) keys[idx].label = input.label.trim();
  if (input.isActive !== undefined) keys[idx].isActive = input.isActive;

  const updated = sortQuickKeys(keys);
  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_QUICK_KEYS, updated, ipAddress, userAgent);
  return updated;
}

export async function deleteQuickKey(
  businessId: string,
  userId: string,
  id: string,
  ipAddress?: string,
  userAgent?: string
): Promise<QuickKeyItem[]> {
  const keys = await getQuickKeys(businessId);
  const updated = sortQuickKeys(keys.filter(k => k.id !== id));
  if (updated.length === keys.length) throw new Error('Quick key not found');

  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_QUICK_KEYS, updated, ipAddress, userAgent);
  return updated;
}

export async function reorderQuickKeys(
  businessId: string,
  userId: string,
  ids: string[],
  ipAddress?: string,
  userAgent?: string
): Promise<QuickKeyItem[]> {
  const keys = await getQuickKeys(businessId);
  const byId = new Map(keys.map(k => [k.id, k]));
  const reordered: QuickKeyItem[] = [];

  ids.forEach((id, index) => {
    const item = byId.get(id);
    if (item) {
      item.sortOrder = index;
      reordered.push(item);
      byId.delete(id);
    }
  });
  // Append any keys missing from the id list (defensive)
  byId.forEach(item => {
    item.sortOrder = reordered.length;
    reordered.push(item);
  });

  const updated = sortQuickKeys(reordered);
  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_QUICK_KEYS, updated, ipAddress, userAgent);
  return updated;
}

export async function resetQuickKeys(
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<QuickKeyItem[]> {
  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_QUICK_KEYS, [], ipAddress, userAgent);
  return [];
}

// ==========================================
// POS SHORTCUTS
// ==========================================

export async function getShortcuts(businessId: string): Promise<ShortcutItem[]> {
  const stored = await getSettings<ShortcutItem[]>(businessId, SETTINGS_KEYS.POS_SHORTCUTS, DEFAULT_SHORTCUTS);
  return Array.isArray(stored) && stored.length > 0 ? stored : [...DEFAULT_SHORTCUTS];
}

export async function updateShortcut(
  businessId: string,
  userId: string,
  id: string,
  key: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ShortcutItem[]> {
  if (!key || !key.trim()) throw new Error('Key is required');

  const shortcuts = await getShortcuts(businessId);
  const item = shortcuts.find(sc => sc.id === id);
  if (!item) throw new Error('Shortcut not found');

  const conflict = shortcuts.find(sc => sc.key === key.trim() && sc.id !== id);
  if (conflict) throw new Error(`Key "${key.trim()}" is already assigned to "${conflict.description}"`);

  item.key = key.trim();
  item.isCustom = true;

  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_SHORTCUTS, shortcuts, ipAddress, userAgent);
  return shortcuts;
}

export async function resetShortcuts(
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ShortcutItem[]> {
  const defaults = [...DEFAULT_SHORTCUTS];
  await updateSettings(businessId, userId, SETTINGS_KEYS.POS_SHORTCUTS, defaults, ipAddress, userAgent);
  return defaults;
}

// ==========================================
// LOGO MANAGEMENT
// ==========================================

export async function uploadLogo(
  businessId: string,
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  // Validate file
  validateLogoFile(fileBuffer, fileName, mimeType);

  // Generate storage key
  const extension = fileName.split('.').pop()?.toLowerCase() || 'png';
  const key = `business/${businessId}/logo.${extension}`;

  // Upload to storage
  const storage = getStorageProvider();
  await storage.upload(key, fileBuffer, mimeType);

  // Generate URL (for local storage, use relative path; for S3, use full URL)
  const logoUrl = `/storage/${key}`;

  // Update business
  const oldLogoUrl = await prisma.business.findUnique({
    where: { id: businessId },
    select: { logoUrl: true },
  });

  await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl },
  });

  // Delete old logo if exists
  if (oldLogoUrl?.logoUrl) {
    try {
      const oldKey = oldLogoUrl.logoUrl.replace('/storage/', '');
      await storage.delete(oldKey);
    } catch (error) {
      logger.warn('Failed to delete old logo', { error: String(error) });
    }
  }

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: 'LOGO_UPLOADED',
    entityType: 'Business',
    entityId: businessId,
    oldValues: oldLogoUrl?.logoUrl ? { logoUrl: oldLogoUrl.logoUrl } : undefined,
    newValues: { logoUrl },
    ipAddress,
    userAgent,
  });

  logger.info('Logo uploaded', { businessId, userId, fileName });

  return logoUrl;
}

export async function removeLogo(
  businessId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { logoUrl: true },
  });

  if (!business?.logoUrl) {
    return; // No logo to remove
  }

  // Delete from storage
  try {
    const storage = getStorageProvider();
    const key = business.logoUrl.replace('/storage/', '');
    await storage.delete(key);
  } catch (error) {
    logger.warn('Failed to delete logo from storage', { error: String(error) });
  }

  // Update business
  await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: null },
  });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: 'LOGO_REMOVED',
    entityType: 'Business',
    entityId: businessId,
    oldValues: { logoUrl: business.logoUrl },
    newValues: { logoUrl: null },
    ipAddress,
    userAgent,
  });

  logger.info('Logo removed', { businessId, userId });
}

// ==========================================
// GET ALL SETTINGS (for offline sync)
// ==========================================

export async function getAllSettings(businessId: string) {
  const [businessProfile, receipt, invoice, pos, posOffline, posScanner, inventory, customer, cloud, whatsapp] = await Promise.all([
    getBusinessProfile(businessId),
    getReceiptSettings(businessId),
    getInvoiceSettings(businessId),
    getPOSSettings(businessId),
    getPOSOfflineSettings(businessId),
    getPOSScannerSettings(businessId),
    getInventorySettings(businessId),
    getCustomerSettings(businessId),
    getCloudSettings(businessId),
    getWhatsAppSettings(businessId),
  ]);

  return {
    businessProfile,
    receipt,
    invoice,
    pos,
    posOffline,
    posScanner,
    inventory,
    customer,
    cloud,
    whatsapp,
  };
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

function isValidPhone(phone: string): boolean {
  // Pakistan format: +92XXXXXXXXXX or 0XXXXXXXXXX
  return /^\+?92[0-9]{10}$|^0[0-9]{10}$/.test(phone.replace(/\s/g, ''));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeText(text: string): string {
  // Remove potential script/HTML injection
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function validateLogoFile(buffer: Buffer, fileName: string, mimeType: string): void {
  // Size validation (max 2MB)
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('Logo file size cannot exceed 2MB');
  }

  // Type validation
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
  }

  // Extension validation
  const extension = fileName.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error('Invalid file extension');
  }

  // Empty file check
  if (buffer.length === 0) {
    throw new Error('File is empty');
  }
}

// ==========================================
// INVOICE NUMBER GENERATION
// ==========================================

export async function generateInvoiceNumber(
  businessId: string,
  deps?: {
    prisma?: typeof prisma;
    audit?: typeof createAuditLog;
  }
): Promise<string> {
  const db = deps?.prisma ?? prisma;
  const audit = deps?.audit ?? createAuditLog;
  const allocation = await db.$transaction(async (tx) => {
    // Lock only this business's invoice counter boundary. Unlike a process
    // mutex, this works across workers and releases as soon as the small
    // settings transaction commits.
    await (tx as any).$queryRaw`
      SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE
    `;

    const existing = await tx.setting.findUnique({
      where: {
        businessId_key: { businessId, key: SETTINGS_KEYS.INVOICE },
      },
    });

    const previousSettings: InvoiceSettings = {
      ...DEFAULT_INVOICE_SETTINGS,
      ...((existing?.value as Partial<InvoiceSettings> | null) ?? {}),
    };
    const settings: InvoiceSettings = { ...previousSettings };
    const now = new Date();

    // Check if annual reset is needed while holding the same database lock as
    // the increment, so the reset cannot race with an allocation.
    if (settings.resetAnnually && settings.lastResetDate) {
      const lastReset = new Date(settings.lastResetDate);
      if (now.getFullYear() > lastReset.getFullYear()) {
        settings.nextNumber = 1;
        settings.lastResetDate = now.toISOString();
      }
    }

    const number = String(settings.nextNumber).padStart(settings.padLength, '0');
    const invoiceNumber = `${settings.prefix}${number}`;
    settings.nextNumber += 1;

    await tx.setting.upsert({
      where: {
        businessId_key: { businessId, key: SETTINGS_KEYS.INVOICE },
      },
      update: { value: settings as any },
      create: {
        businessId,
        key: SETTINGS_KEYS.INVOICE,
        value: settings as any,
      },
    });

    return { invoiceNumber, previousSettings, settings };
  });

  // Keep the existing system audit trail. The number allocation itself has
  // already committed atomically before this non-financial audit write.
  await audit({
    businessId,
    userId: 'system',
    action: 'SETTING_UPDATED',
    entityType: 'Setting',
    entityId: SETTINGS_KEYS.INVOICE,
    oldValues: { value: allocation.previousSettings },
    newValues: { value: allocation.settings },
  });

  logger.info('Invoice number generated', {
    businessId,
    invoiceNumber: allocation.invoiceNumber,
  });

  return allocation.invoiceNumber;
}
