/**
 * Phase 21: File Parser Service
 * Handles CSV and XLSX file parsing
 */

import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { logger } from '../../lib/logger.js';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

/**
 * Parse uploaded file (CSV or XLSX)
 */
export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedFile> {
  const extension = fileName.toLowerCase().split('.').pop();

  if (mimeType === 'text/csv' || extension === 'csv') {
    return parseCSV(buffer);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    extension === 'xlsx' ||
    extension === 'xls'
  ) {
    return parseExcel(buffer);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Parse CSV file
 */
function parseCSV(buffer: Buffer): ParsedFile {
  try {
    const content = buffer.toString('utf-8');
    
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];

    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = Object.keys(records[0] as Record<string, unknown>);
    
    logger.info('CSV parsed successfully', {
      headers: headers.length,
      rows: records.length,
    });

    return {
      headers,
      rows: records,
      totalRows: records.length,
    };
  } catch (error) {
    logger.error('CSV parsing failed', { error: String(error) });
    throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse Excel file
 */
function parseExcel(buffer: Buffer): ParsedFile {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with headers
    const records = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false,
    }) as Record<string, unknown>[];

    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('Excel file is empty or has no data rows');
    }

    const headers = Object.keys(records[0] as Record<string, unknown>);

    logger.info('Excel parsed successfully', {
      sheet: sheetName,
      headers: headers.length,
      rows: records.length,
    });

    return {
      headers,
      rows: records,
      totalRows: records.length,
    };
  } catch (error) {
    logger.error('Excel parsing failed', { error: String(error) });
    throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSizeMB: number = 10): void {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (size > maxSizeBytes) {
    throw new Error(`File size (${(size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size (${maxSizeMB} MB)`);
  }

  if (size === 0) {
    throw new Error('File is empty');
  }
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string, fileName: string): void {
  const extension = fileName.toLowerCase().split('.').pop();
  
  const allowedTypes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  const allowedExtensions = ['csv', 'xlsx', 'xls'];

  if (!allowedTypes.includes(mimeType) && !allowedExtensions.includes(extension || '')) {
    throw new Error(`Unsupported file type: ${mimeType}. Allowed types: CSV, XLSX, XLS`);
  }
}

/**
 * Clean cell value
 */
export function cleanCellValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return null;
  }

  return str;
}

/**
 * Parse decimal value
 */
export function parseDecimal(value: unknown): number | null {
  const cleaned = cleanCellValue(value);
  
  if (cleaned === null) {
    return null;
  }

  // Remove currency symbols, commas (thousands separator), and whitespace
  // Keep decimal point
  const numeric = cleaned.replace(/[₨Rs,\s]/gi, '').trim();
  
  const parsed = parseFloat(numeric);
  
  if (isNaN(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Parse boolean value
 */
export function parseBoolean(value: unknown): boolean | null {
  const cleaned = cleanCellValue(value);
  
  if (cleaned === null) {
    return null;
  }

  const lower = cleaned.toLowerCase();
  
  if (['true', 'yes', '1', 'active', 'enabled'].includes(lower)) {
    return true;
  }
  
  if (['false', 'no', '0', 'inactive', 'disabled'].includes(lower)) {
    return false;
  }

  return null;
}

/**
 * Parse integer value
 */
export function parseInteger(value: unknown): number | null {
  const decimal = parseDecimal(value);
  
  if (decimal === null) {
    return null;
  }

  return Math.round(decimal);
}
