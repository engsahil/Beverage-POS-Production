/**
 * Phase 21: Template Service
 */

import * as XLSX from 'xlsx';
import { ImportEntityType } from './types.js';

interface TemplateColumn {
  name: string;
  required: boolean;
  example?: string;
}

const templates: Record<ImportEntityType, TemplateColumn[]> = {
  PRODUCT: [
    { name: 'name', required: true, example: 'Cola 500ml' },
    { name: 'categoryName', required: true, example: 'Beverages' },
    { name: 'sku', required: false, example: 'COLA-500' },
    { name: 'barcode', required: false, example: '1234567890123' },
    { name: 'purchasePrice', required: true, example: '50' },
    { name: 'sellingPrice', required: true, example: '80' },
    { name: 'isActive', required: false, example: 'true' },
  ],
  CATEGORY: [
    { name: 'name', required: true, example: 'Beverages' },
    { name: 'description', required: false, example: 'All types of beverages' },
    { name: 'isActive', required: false, example: 'true' },
  ],
  UNIT: [
    { name: 'name', required: true, example: 'Bottle' },
    { name: 'shortCode', required: true, example: 'BTL' },
    { name: 'isActive', required: false, example: 'true' },
  ],
  CUSTOMER: [
    { name: 'name', required: true, example: 'Ali Ahmed' },
    { name: 'phone', required: false, example: '+923001234567' },
    { name: 'whatsapp', required: false, example: '+923001234567' },
    { name: 'email', required: false, example: 'ali@example.com' },
    { name: 'address', required: false, example: '123 Main St, Karachi' },
    { name: 'creditLimit', required: false, example: '10000' },
    { name: 'status', required: false, example: 'ACTIVE' },
  ],
  VENDOR: [
    { name: 'name', required: true, example: 'ABC Distributors' },
    { name: 'companyName', required: false, example: 'ABC Pvt Ltd' },
    { name: 'phone', required: false, example: '+923001234567' },
    { name: 'email', required: false, example: 'contact@abc.com' },
    { name: 'address', required: false, example: '456 Business Ave, Lahore' },
    { name: 'isActive', required: false, example: 'true' },
  ],
  PRODUCT_VARIANT: [
    { name: 'productSku', required: true, example: 'COLA-500' },
    { name: 'name', required: true, example: '1 Liter' },
    { name: 'unitName', required: true, example: 'Bottle' },
    { name: 'quantity', required: true, example: '1' },
    { name: 'sku', required: false, example: 'COLA-1L' },
    { name: 'barcode', required: false, example: '1234567890124' },
    { name: 'purchasePrice', required: true, example: '90' },
    { name: 'sellingPrice', required: true, example: '150' },
    { name: 'isActive', required: false, example: 'true' },
  ],
};

export function generateTemplate(entityType: ImportEntityType, format: 'CSV' | 'XLSX'): Buffer {
  const columns = templates[entityType];
  if (!columns) {
    throw new Error(`No template for entity type: ${entityType}`);
  }

  const headers = columns.map(c => c.name);
  const exampleRow = columns.map(c => c.example || '');

  if (format === 'CSV') {
    const csv = [
      headers.join(','),
      exampleRow.map(v => v.includes(',') ? `"${v}"` : v).join(','),
    ].join('\n');
    return Buffer.from(csv, 'utf-8');
  } else {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, entityType);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

export function getTemplateFileName(entityType: ImportEntityType, format: 'CSV' | 'XLSX'): string {
  return `${entityType.toLowerCase()}_import_template.${format.toLowerCase()}`;
}
