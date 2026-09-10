/**
 * Phase 21: Import Validation Service
 * Validates imported data against business rules
 */

import prisma from '../../lib/prisma.js';
import { logger as _logger } from '../../lib/logger.js';
import { 
  ImportEntityType, 
  ImportMode, 
  ValidationResult, 
  ImportRowError, 
  DuplicateCheck 
} from './types.js';
import { cleanCellValue, parseDecimal, parseBoolean, parseInteger } from './fileParser.js';

/**
 * Validate import row based on entity type
 */
export async function validateImportRow(
  entityType: ImportEntityType,
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  try {
    switch (entityType) {
      case 'PRODUCT':
        return await validateProductRow(businessId, rowNumber, data, importMode);
      case 'CATEGORY':
        return await validateCategoryRow(businessId, rowNumber, data, importMode);
      case 'UNIT':
        return await validateUnitRow(businessId, rowNumber, data, importMode);
      case 'CUSTOMER':
        return await validateCustomerRow(businessId, rowNumber, data, importMode);
      case 'VENDOR':
        return await validateVendorRow(businessId, rowNumber, data, importMode);
      case 'PRODUCT_VARIANT':
        return await validateProductVariantRow(businessId, rowNumber, data, importMode);
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  } catch (error) {
    errors.push({
      rowNumber,
      message: error instanceof Error ? error.message : 'Validation failed',
    });

    return {
      isValid: false,
      errors,
      warnings,
      cleanedData,
    };
  }
}

/**
 * Validate product row
 */
async function validateProductRow(
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  // Required fields
  const name = cleanCellValue(data.name || data.Name || data['Product Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Product name is required' });
  } else {
    cleanedData.name = name;
  }

  const categoryId = cleanCellValue(data.categoryId || data.CategoryId || data['Category ID']);
  const categoryName = cleanCellValue(data.categoryName || data.Category || data['Category Name']);
  
  if (!categoryId && !categoryName) {
    errors.push({ rowNumber, field: 'category', message: 'Category ID or Category Name is required' });
  } else if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, businessId },
    });
    if (!category) {
      errors.push({ rowNumber, field: 'categoryId', message: 'Category not found', value: categoryId });
    } else {
      cleanedData.categoryId = categoryId;
    }
  } else if (categoryName) {
    const category = await prisma.category.findFirst({
      where: { name: categoryName, businessId },
    });
    if (!category) {
      errors.push({ rowNumber, field: 'categoryName', message: 'Category not found', value: categoryName });
    } else {
      cleanedData.categoryId = category.id;
    }
  }

  // Optional fields
  const sku = cleanCellValue(data.sku || data.SKU);
  if (sku) {
    const duplicate = await checkProductDuplicate(businessId, 'sku', sku, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'sku', message: 'SKU already exists', value: sku });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`SKU ${sku} already exists - will be updated`);
    }
    cleanedData.sku = sku;
  }

  const barcode = cleanCellValue(data.barcode || data.Barcode);
  if (barcode) {
    const duplicate = await checkProductDuplicate(businessId, 'barcode', barcode, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'barcode', message: 'Barcode already exists', value: barcode });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Barcode ${barcode} already exists - will be updated`);
    }
    cleanedData.barcode = barcode;
  }

  const purchasePrice = parseDecimal(data.purchasePrice || data['Purchase Price']);
  if (purchasePrice === null || purchasePrice < 0) {
    errors.push({ rowNumber, field: 'purchasePrice', message: 'Valid purchase price is required' });
  } else {
    cleanedData.purchasePrice = purchasePrice;
  }

  const sellingPrice = parseDecimal(data.sellingPrice || data['Selling Price']);
  if (sellingPrice === null || sellingPrice < 0) {
    errors.push({ rowNumber, field: 'sellingPrice', message: 'Valid selling price is required' });
  } else {
    cleanedData.sellingPrice = sellingPrice;
    if (purchasePrice !== null && sellingPrice < purchasePrice) {
      warnings.push('Selling price is lower than purchase price');
    }
  }

  // Optional fields
  cleanedData.description = cleanCellValue(data.description || data.Description);
  cleanedData.isActive = parseBoolean(data.isActive || data['Active']) ?? true;
  cleanedData.taxEnabled = parseBoolean(data.taxEnabled || data['Tax Enabled']) ?? false;
  
  const taxRate = parseDecimal(data.taxRate || data['Tax Rate']);
  if (taxRate !== null) {
    if (taxRate < 0 || taxRate > 100) {
      errors.push({ rowNumber, field: 'taxRate', message: 'Tax rate must be between 0 and 100' });
    } else {
      cleanedData.taxRate = taxRate;
    }
  }

  cleanedData.discountAllowed = parseBoolean(data.discountAllowed || data['Discount Allowed']) ?? true;
  
  const maxDiscount = parseDecimal(data.maxDiscountPercent || data['Max Discount %']);
  if (maxDiscount !== null) {
    if (maxDiscount < 0 || maxDiscount > 100) {
      errors.push({ rowNumber, field: 'maxDiscountPercent', message: 'Max discount must be between 0 and 100' });
    } else {
      cleanedData.maxDiscountPercent = maxDiscount;
    }
  }

  const minThreshold = parseInteger(data.minStockThreshold || data['Min Stock']);
  if (minThreshold !== null) {
    if (minThreshold < 0) {
      errors.push({ rowNumber, field: 'minStockThreshold', message: 'Min stock threshold cannot be negative' });
    } else {
      cleanedData.minStockThreshold = minThreshold;
    }
  }

  const maxThreshold = parseInteger(data.maxStockThreshold || data['Max Stock']);
  if (maxThreshold !== null) {
    if (maxThreshold < 0) {
      errors.push({ rowNumber, field: 'maxStockThreshold', message: 'Max stock threshold cannot be negative' });
    } else {
      cleanedData.maxStockThreshold = maxThreshold;
    }
  }

  cleanedData.expiryTrackingEnabled = parseBoolean(data.expiryTrackingEnabled || data['Expiry Tracking']) ?? false;
  
  const expiryDays = parseInteger(data.expiryWarningDays || data['Expiry Warning Days']);
  if (expiryDays !== null) {
    if (expiryDays < 0) {
      errors.push({ rowNumber, field: 'expiryWarningDays', message: 'Expiry warning days cannot be negative' });
    } else {
      cleanedData.expiryWarningDays = expiryDays;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

/**
 * Validate category row
 */
async function validateCategoryRow(
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  const name = cleanCellValue(data.name || data.Name || data['Category Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Category name is required' });
  } else {
    const duplicate = await checkCategoryDuplicate(businessId, name, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'name', message: 'Category already exists', value: name });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Category ${name} already exists - will be updated`);
    }
    cleanedData.name = name;
  }

  cleanedData.description = cleanCellValue(data.description || data.Description);
  cleanedData.isActive = parseBoolean(data.isActive || data.Active) ?? true;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

/**
 * Validate unit row
 */
async function validateUnitRow(
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  const name = cleanCellValue(data.name || data.Name || data['Unit Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Unit name is required' });
  } else {
    const duplicate = await checkUnitDuplicate(businessId, 'name', name, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'name', message: 'Unit already exists', value: name });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Unit ${name} already exists - will be updated`);
    }
    cleanedData.name = name;
  }

  const shortCode = cleanCellValue(data.shortCode || data['Short Code'] || data.Code);
  if (!shortCode) {
    errors.push({ rowNumber, field: 'shortCode', message: 'Short code is required' });
  } else {
    const duplicate = await checkUnitDuplicate(businessId, 'shortCode', shortCode, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'shortCode', message: 'Short code already exists', value: shortCode });
    } else if (duplicate.isDuplicate && !cleanedData.existingId) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Short code ${shortCode} already exists - will be updated`);
    }
    cleanedData.shortCode = shortCode;
  }

  cleanedData.isActive = parseBoolean(data.isActive || data.Active) ?? true;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

/**
 * Validate customer row
 */
async function validateCustomerRow(
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  const name = cleanCellValue(data.name || data.Name || data['Customer Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Customer name is required' });
  } else {
    cleanedData.name = name;
  }

  const phone = cleanCellValue(data.phone || data.Phone);
  if (phone) {
    // Validate Pakistani phone format
    if (!/^\+?92[0-9]{10}$/.test(phone.replace(/\s/g, ''))) {
      warnings.push('Phone number should be in +92 format');
    }
    
    const duplicate = await checkCustomerDuplicate(businessId, 'phone', phone, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'phone', message: 'Phone already exists', value: phone });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Phone ${phone} already exists - will be updated`);
    }
    cleanedData.phone = phone;
  }

  const whatsapp = cleanCellValue(data.whatsapp || data.WhatsApp);
  if (whatsapp) {
    cleanedData.whatsapp = whatsapp;
  }

  cleanedData.email = cleanCellValue(data.email || data.Email);
  cleanedData.address = cleanCellValue(data.address || data.Address);
  cleanedData.city = cleanCellValue(data.city || data.City);
  cleanedData.notes = cleanCellValue(data.notes || data.Notes);

  const creditLimit = parseDecimal(data.creditLimit || data['Credit Limit']);
  if (creditLimit !== null) {
    if (creditLimit < 0) {
      errors.push({ rowNumber, field: 'creditLimit', message: 'Credit limit cannot be negative' });
    } else {
      cleanedData.creditLimit = creditLimit;
    }
  } else {
    cleanedData.creditLimit = 0;
  }

  const status = cleanCellValue(data.status || data.Status);
  if (status && !['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
    errors.push({ rowNumber, field: 'status', message: 'Status must be ACTIVE or INACTIVE' });
  } else {
    cleanedData.status = status?.toUpperCase() || 'ACTIVE';
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

/**
 * Validate vendor row
 */
async function validateVendorRow(
  _businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  _importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  const name = cleanCellValue(data.name || data.Name || data['Vendor Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Vendor name is required' });
  } else {
    cleanedData.name = name;
  }

  cleanedData.companyName = cleanCellValue(data.companyName || data['Company Name']);
  cleanedData.contactPerson = cleanCellValue(data.contactPerson || data['Contact Person']);
  cleanedData.phone = cleanCellValue(data.phone || data.Phone);
  cleanedData.whatsapp = cleanCellValue(data.whatsapp || data.WhatsApp);
  cleanedData.email = cleanCellValue(data.email || data.Email);
  cleanedData.address = cleanCellValue(data.address || data.Address);
  cleanedData.city = cleanCellValue(data.city || data.City);
  cleanedData.notes = cleanCellValue(data.notes || data.Notes);

  const openingBalance = parseDecimal(data.openingBalance || data['Opening Balance']);
  if (openingBalance !== null) {
    cleanedData.openingBalance = openingBalance;
  } else {
    cleanedData.openingBalance = 0;
  }

  const paymentTerms = parseInteger(data.paymentTerms || data['Payment Terms']);
  if (paymentTerms !== null) {
    if (paymentTerms < 0) {
      errors.push({ rowNumber, field: 'paymentTerms', message: 'Payment terms cannot be negative' });
    } else {
      cleanedData.paymentTerms = paymentTerms;
    }
  }

  cleanedData.isActive = parseBoolean(data.isActive || data.Active) ?? true;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

/**
 * Validate product variant row
 */
async function validateProductVariantRow(
  businessId: string,
  rowNumber: number,
  data: Record<string, unknown>,
  importMode: ImportMode
): Promise<ValidationResult> {
  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const cleanedData: Record<string, unknown> = {};

  // Product reference
  const productId = cleanCellValue(data.productId || data['Product ID']);
  const productSku = cleanCellValue(data.productSku || data['Product SKU']);
  const productName = cleanCellValue(data.productName || data['Product Name']);

  if (!productId && !productSku && !productName) {
    errors.push({ rowNumber, field: 'product', message: 'Product ID, SKU, or Name is required' });
  } else if (productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) {
      errors.push({ rowNumber, field: 'productId', message: 'Product not found', value: productId });
    } else {
      cleanedData.productId = productId;
    }
  } else if (productSku) {
    const product = await prisma.product.findFirst({
      where: { sku: productSku, businessId },
    });
    if (!product) {
      errors.push({ rowNumber, field: 'productSku', message: 'Product not found', value: productSku });
    } else {
      cleanedData.productId = product.id;
    }
  } else if (productName) {
    const product = await prisma.product.findFirst({
      where: { name: productName, businessId },
    });
    if (!product) {
      errors.push({ rowNumber, field: 'productName', message: 'Product not found', value: productName });
    } else {
      cleanedData.productId = product.id;
    }
  }

  // Variant name
  const name = cleanCellValue(data.name || data.Name || data['Variant Name']);
  if (!name) {
    errors.push({ rowNumber, field: 'name', message: 'Variant name is required' });
  } else {
    cleanedData.name = name;
  }

  // Unit reference
  const unitId = cleanCellValue(data.unitId || data['Unit ID']);
  const unitName = cleanCellValue(data.unitName || data.Unit || data['Unit Name']);

  if (!unitId && !unitName) {
    errors.push({ rowNumber, field: 'unit', message: 'Unit ID or Unit Name is required' });
  } else if (unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, businessId },
    });
    if (!unit) {
      errors.push({ rowNumber, field: 'unitId', message: 'Unit not found', value: unitId });
    } else {
      cleanedData.unitId = unitId;
    }
  } else if (unitName) {
    const unit = await prisma.unit.findFirst({
      where: { name: unitName, businessId },
    });
    if (!unit) {
      errors.push({ rowNumber, field: 'unitName', message: 'Unit not found', value: unitName });
    } else {
      cleanedData.unitId = unit.id;
    }
  }

  // Quantity
  const quantity = parseDecimal(data.quantity || data.Quantity);
  if (quantity === null || quantity <= 0) {
    errors.push({ rowNumber, field: 'quantity', message: 'Valid quantity is required' });
  } else {
    cleanedData.quantity = quantity;
  }

  // SKU
  const sku = cleanCellValue(data.sku || data.SKU);
  if (sku) {
    const duplicate = await checkVariantDuplicate(businessId, 'sku', sku, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'sku', message: 'SKU already exists', value: sku });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`SKU ${sku} already exists - will be updated`);
    }
    cleanedData.sku = sku;
  }

  // Barcode
  const barcode = cleanCellValue(data.barcode || data.Barcode);
  if (barcode) {
    const duplicate = await checkVariantDuplicate(businessId, 'barcode', barcode, importMode);
    if (duplicate.isDuplicate && importMode === 'CREATE_ONLY') {
      errors.push({ rowNumber, field: 'barcode', message: 'Barcode already exists', value: barcode });
    } else if (duplicate.isDuplicate) {
      cleanedData.existingId = duplicate.existingId;
      warnings.push(`Barcode ${barcode} already exists - will be updated`);
    }
    cleanedData.barcode = barcode;
  }

  // Prices
  const purchasePrice = parseDecimal(data.purchasePrice || data['Purchase Price']);
  if (purchasePrice === null || purchasePrice < 0) {
    errors.push({ rowNumber, field: 'purchasePrice', message: 'Valid purchase price is required' });
  } else {
    cleanedData.purchasePrice = purchasePrice;
  }

  const sellingPrice = parseDecimal(data.sellingPrice || data['Selling Price']);
  if (sellingPrice === null || sellingPrice < 0) {
    errors.push({ rowNumber, field: 'sellingPrice', message: 'Valid selling price is required' });
  } else {
    cleanedData.sellingPrice = sellingPrice;
  }

  cleanedData.isActive = parseBoolean(data.isActive || data.Active) ?? true;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    cleanedData,
  };
}

// ==========================================
// Duplicate Check Helpers
// ==========================================

async function checkProductDuplicate(
  businessId: string,
  field: 'sku' | 'barcode',
  value: string,
  importMode: ImportMode
): Promise<DuplicateCheck> {
  if (importMode === 'CREATE_ONLY') {
    const existing = await prisma.product.findFirst({
      where: { businessId, [field]: value },
    });
    return {
      isDuplicate: !!existing,
      existingId: existing?.id,
      matchField: field,
      matchValue: value,
    };
  }

  const existing = await prisma.product.findFirst({
    where: { businessId, [field]: value },
  });

  return {
    isDuplicate: !!existing,
    existingId: existing?.id,
    matchField: field,
    matchValue: value,
  };
}

async function checkCategoryDuplicate(
  businessId: string,
  name: string,
  _importMode: ImportMode
): Promise<DuplicateCheck> {
  const existing = await prisma.category.findFirst({
    where: { businessId, name },
  });

  return {
    isDuplicate: !!existing,
    existingId: existing?.id,
    matchField: 'name',
    matchValue: name,
  };
}

async function checkUnitDuplicate(
  businessId: string,
  field: 'name' | 'shortCode',
  value: string,
  _importMode: ImportMode
): Promise<DuplicateCheck> {
  const existing = await prisma.unit.findFirst({
    where: { businessId, [field]: value },
  });

  return {
    isDuplicate: !!existing,
    existingId: existing?.id,
    matchField: field,
    matchValue: value,
  };
}

async function checkCustomerDuplicate(
  businessId: string,
  field: 'phone',
  value: string,
  _importMode: ImportMode
): Promise<DuplicateCheck> {
  const existing = await prisma.customer.findFirst({
    where: { businessId, [field]: value },
  });

  return {
    isDuplicate: !!existing,
    existingId: existing?.id,
    matchField: field,
    matchValue: value,
  };
}

async function checkVariantDuplicate(
  businessId: string,
  field: 'sku' | 'barcode',
  value: string,
  _importMode: ImportMode
): Promise<DuplicateCheck> {
  const existing = await prisma.productVariant.findFirst({
    where: { [field]: value, product: { businessId } },
  });

  return {
    isDuplicate: !!existing,
    existingId: existing?.id,
    matchField: field,
    matchValue: value,
  };
}
