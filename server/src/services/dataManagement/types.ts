/**
 * Phase 21: Data Management Types
 */

// ==========================================
// Import Types
// ==========================================

export type ImportEntityType = 'PRODUCT' | 'CATEGORY' | 'UNIT' | 'CUSTOMER' | 'VENDOR' | 'PRODUCT_VARIANT';

export type ImportStatus = 'PENDING' | 'VALIDATING' | 'PREVIEW_READY' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type ImportMode = 'CREATE_ONLY' | 'UPDATE_EXISTING' | 'CREATE_UPDATE';

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, unknown>;
  isValid: boolean;
  errors: ImportRowError[];
  warnings: string[];
  action: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
  existingId?: string;
}

export interface ImportPreviewResult {
  operationId: string;
  entityType: ImportEntityType;
  importMode: ImportMode;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ImportPreviewRow[];
  summary: {
    toCreate: number;
    toUpdate: number;
    toSkip: number;
    errors: number;
  };
}

export interface ImportResult {
  operationId: string;
  status: ImportStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: ImportRowError[];
  completedAt: Date;
}

// ==========================================
// Export Types
// ==========================================

export type ExportEntityType = 
  | 'PRODUCT' 
  | 'CATEGORY' 
  | 'UNIT' 
  | 'CUSTOMER' 
  | 'VENDOR' 
  | 'INVENTORY' 
  | 'SALE' 
  | 'PURCHASE';

export type ExportFormat = 'CSV' | 'XLSX';

export type ExportStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export interface ExportFilters extends Record<string, unknown> {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  categoryId?: string;
  status?: string;
  isActive?: boolean;
}

export interface ExportResult {
  operationId: string;
  status: ExportStatus;
  fileName: string;
  fileFormat: ExportFormat;
  recordCount: number;
  fileSize: number;
  filePath: string;
  fileData?: string; // base64 encoded file content
  completedAt: Date;
}

// ==========================================
// Template Types
// ==========================================

export interface TemplateColumn {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'date';
  example?: string;
  description?: string;
}

export interface TemplateDefinition {
  entityType: ImportEntityType;
  fileName: string;
  columns: TemplateColumn[];
}

// ==========================================
// Validation Types
// ==========================================

export interface ValidationResult {
  isValid: boolean;
  errors: ImportRowError[];
  warnings: string[];
  cleanedData: Record<string, unknown>;
}

export interface DuplicateCheck {
  isDuplicate: boolean;
  existingId?: string;
  matchField?: string;
  matchValue?: string;
}
