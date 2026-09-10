/**
 * Phase 21: Export Service
 * Handles data export with proper formatting and file generation
 */

import prisma from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import * as XLSX from 'xlsx';
import { createAuditLog } from '../auditService.js';
import { ExportEntityType, ExportFormat, ExportFilters, ExportResult } from './types.js';

/**
 * Export data with filters
 */
export async function exportData(
  businessId: string,
  userId: string,
  entityType: ExportEntityType,
  fileFormat: ExportFormat,
  filters?: ExportFilters,
  ipAddress?: string,
  userAgent?: string
): Promise<ExportResult & { fileData: string }> {
  const operation = await prisma.exportOperation.create({
    data: {
      businessId,
      userId,
      entityType,
      fileName: generateFileName(entityType, fileFormat),
      fileFormat,
      filters: (filters || {}) as any,
      status: 'GENERATING',
      startedAt: new Date(),
    },
  });

  try {
    const data = await fetchExportData(businessId, entityType, filters);
    const formattedRows = data.map(row => formatExportRow(row, entityType));
    const buffer = generateFile(formattedRows, entityType, fileFormat);
    
    const result: ExportResult & { fileData: string } = {
      operationId: operation.id,
      status: 'COMPLETED',
      fileName: operation.fileName,
      fileFormat,
      recordCount: formattedRows.length,
      fileSize: buffer.length,
      filePath: `/exports/${operation.id}.${fileFormat.toLowerCase()}`,
      fileData: buffer.toString('base64'),
      completedAt: new Date(),
    };

    await prisma.exportOperation.update({
      where: { id: operation.id },
      data: {
        status: 'COMPLETED',
        recordCount: result.recordCount,
        fileSize: result.fileSize,
        filePath: result.filePath,
        completedAt: result.completedAt,
      },
    });

    await createAuditLog({
      businessId,
      userId,
      action: 'DATA_EXPORTED',
      entityType,
      entityId: operation.id,
      newValues: { fileName: result.fileName, recordCount: result.recordCount },
      ipAddress,
      userAgent,
    });

    logger.info('Export completed', {
      operationId: operation.id,
      entityType,
      recordCount: result.recordCount,
    });

    return result;
  } catch (error) {
    await prisma.exportOperation.update({
      where: { id: operation.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Export failed',
      },
    });

    logger.error('Export failed', { operationId: operation.id, error: String(error) });
    throw error;
  }
}

/**
 * Fetch data for export based on entity type and filters
 */
async function fetchExportData(
  businessId: string,
  entityType: ExportEntityType,
  filters?: ExportFilters
): Promise<any[]> {
  const where: any = { businessId };

  // Apply common filters
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;
  if (filters?.status) where.status = filters.status;
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  switch (entityType) {
    case 'PRODUCT':
      if (filters?.categoryId) where.categoryId = filters.categoryId;
      return prisma.product.findMany({
        where,
        include: { 
          category: { select: { name: true } },
          variants: { include: { unit: { select: { name: true } } } },
        },
        orderBy: { name: 'asc' },
      });

    case 'CATEGORY':
      return prisma.category.findMany({ where, orderBy: { name: 'asc' } });

    case 'UNIT':
      return prisma.unit.findMany({ where, orderBy: { name: 'asc' } });

    case 'CUSTOMER':
      return prisma.customer.findMany({ where, orderBy: { name: 'asc' } });

    case 'VENDOR':
      return prisma.vendor.findMany({ where, orderBy: { name: 'asc' } });

    case 'INVENTORY':
      return prisma.inventory.findMany({
        where: {
          product: { businessId },
          ...(filters?.branchId && { branchId: filters.branchId }),
        },
        include: {
          product: { select: { name: true, sku: true } },
          variant: { select: { name: true, sku: true } },
          branch: { select: { name: true } },
        },
      });

    case 'SALE':
      return prisma.sale.findMany({
        where: {
          businessId,
          ...(filters?.branchId && { branchId: filters.branchId }),
          ...(filters?.dateFrom || filters?.dateTo ? {
            createdAt: {
              ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
              ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
            },
          } : {}),
        },
        include: {
          customer: { select: { name: true } },
          branch: { select: { name: true } },
          items: {
            include: {
              product: { select: { name: true, sku: true } },
              variant: { select: { name: true } },
            },
          },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      });

    case 'PURCHASE':
      return prisma.purchase.findMany({
        where: {
          businessId,
          ...(filters?.dateFrom || filters?.dateTo ? {
            createdAt: {
              ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
              ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
            },
          } : {}),
        },
        include: {
          vendor: { select: { name: true } },
          items: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

    default:
      return [];
  }
}

/**
 * Format a single export row based on entity type
 */
function formatExportRow(row: any, entityType: ExportEntityType): Record<string, any> {
  switch (entityType) {
    case 'PRODUCT':
      return {
        'Product Name': row.name,
        'SKU': row.sku || '',
        'Barcode': row.barcode || '',
        'Category': row.category?.name || '',
        'Purchase Price': row.purchasePrice?.toString() || '0',
        'Selling Price': row.sellingPrice?.toString() || '0',
        'Tax Enabled': row.taxEnabled ? 'Yes' : 'No',
        'Tax Rate (%)': row.taxRate?.toString() || '',
        'Discount Allowed': row.discountAllowed ? 'Yes' : 'No',
        'Max Discount (%)': row.maxDiscountPercent?.toString() || '',
        'Min Stock': row.minStockThreshold?.toString() || '',
        'Max Stock': row.maxStockThreshold?.toString() || '',
        'Expiry Tracking': row.expiryTrackingEnabled ? 'Yes' : 'No',
        'Expiry Warning (Days)': row.expiryWarningDays?.toString() || '',
        'Status': row.isActive ? 'Active' : 'Inactive',
      };

    case 'CATEGORY':
      return {
        'Category Name': row.name,
        'Description': row.description || '',
        'Status': row.isActive ? 'Active' : 'Inactive',
      };

    case 'UNIT':
      return {
        'Unit Name': row.name,
        'Short Code': row.shortCode,
        'Status': row.isActive ? 'Active' : 'Inactive',
      };

    case 'CUSTOMER':
      return {
        'Customer ID': row.id,
        'Name': row.name,
        'Phone': row.phone || '',
        'WhatsApp': row.whatsapp || '',
        'Email': row.email || '',
        'Address': row.address || '',
        'City': row.city || '',
        'Credit Limit': row.creditLimit?.toString() || '0',
        'Outstanding Balance': row.currentBalance?.toString() || '0',
        'Status': row.status,
      };

    case 'VENDOR':
      return {
        'Vendor Name': row.name,
        'Company': row.companyName || '',
        'Contact Person': row.contactPerson || '',
        'Phone': row.phone || '',
        'WhatsApp': row.whatsapp || '',
        'Email': row.email || '',
        'Address': row.address || '',
        'City': row.city || '',
        'Opening Balance': row.openingBalance?.toString() || '0',
        'Payment Terms (Days)': row.paymentTerms?.toString() || '',
        'Status': row.isActive ? 'Active' : 'Inactive',
      };

    case 'INVENTORY':
      return {
        'Product': row.product?.name || '',
        'Product SKU': row.product?.sku || '',
        'Variant': row.variant?.name || '',
        'Variant SKU': row.variant?.sku || '',
        'Branch': row.branch?.name || '',
        'Current Stock': row.currentQuantity?.toString() || '0',
        'Reserved': row.reservedQuantity?.toString() || '0',
        'Available': ((Number(row.currentQuantity || 0)) - (Number(row.reservedQuantity || 0))).toString(),
      };

    case 'SALE':
      return {
        'Sale Number': row.saleNumber || '',
        'Date': row.saleDate ? new Date(row.saleDate).toISOString().split('T')[0] : '',
        'Time': row.saleDate ? new Date(row.saleDate).toTimeString().split(' ')[0] : '',
        'Customer': row.customer?.name || 'Walk-in',
        'Branch': row.branch?.name || '',
        'Items': row.items?.length || 0,
        'Subtotal': row.subtotal?.toString() || '0',
        'Tax': row.taxAmount?.toString() || '0',
        'Discount': row.discountAmount?.toString() || '0',
        'Total': row.total?.toString() || '0',
        'Amount Paid': row.amountPaid?.toString() || '0',
        'Outstanding': row.outstandingAmount?.toString() || '0',
        'Payment Method': row.payments?.[0]?.paymentMethod || '',
        'Status': row.status || '',
      };

    case 'PURCHASE':
      return {
        'Purchase Number': row.purchaseNumber || '',
        'Date': row.purchaseDate ? new Date(row.purchaseDate).toISOString().split('T')[0] : '',
        'Vendor': row.vendor?.name || '',
        'Items': row.items?.length || 0,
        'Subtotal': row.subtotal?.toString() || '0',
        'Tax': row.tax?.toString() || '0',
        'Discount': row.discount?.toString() || '0',
        'Total': row.total?.toString() || '0',
        'Amount Paid': row.amountPaid?.toString() || '0',
        'Amount Due': row.amountDue?.toString() || '0',
        'Payment Status': row.paymentStatus || '',
        'Status': row.status || '',
      };

    default:
      return row;
  }
}

/**
 * Generate file buffer (CSV or XLSX)
 */
function generateFile(rows: Record<string, any>[], entityType: ExportEntityType, format: ExportFormat): Buffer {
  if (format === 'CSV') {
    const csv = convertToCSV(rows);
    return Buffer.from(csv, 'utf-8');
  } else {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, entityType);
    
    // Auto-size columns
    const cols = Object.keys(rows[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
    worksheet['!cols'] = cols;
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

/**
 * Convert rows to CSV string
 */
function convertToCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Generate file name for export
 */
function generateFileName(entityType: ExportEntityType, format: ExportFormat): string {
  const timestamp = new Date().toISOString().split('T')[0];
  return `${entityType.toLowerCase()}_export_${timestamp}.${format.toLowerCase()}`;
}

/**
 * List export operations
 */
export async function listExportOperations(
  businessId: string,
  params: { page?: number; limit?: number }
) {
  const { page = 1, limit = 20 } = params;
  
  const [operations, total] = await Promise.all([
    prisma.exportOperation.findMany({
      where: { businessId },
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.exportOperation.count({ where: { businessId } }),
  ]);
  
  return {
    data: operations,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
