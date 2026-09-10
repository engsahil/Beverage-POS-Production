// Shared TypeScript types for Beverage POS System

// ==========================================
// User & Authentication Types
// ==========================================

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  business: BusinessInfo;
  branch: BranchInfo | null;
  role: RoleInfo | null;
  permissions: PermissionInfo[];
}

export interface BusinessInfo {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

export interface BranchInfo {
  id: string;
  name: string;
  code: string;
}

export interface RoleInfo {
  id: string;
  name: string;
  description: string | null;
}

export interface PermissionInfo {
  id: string;
  name: string;
  module: string;
  action: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
  businessId?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ==========================================
// Role & Permission Types
// ==========================================

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: RolePermission[];
  _count: {
    users: number;
  };
}

export interface RolePermission {
  roleId: string;
  permissionId: string;
  permission: Permission;
}

export interface Permission {
  id: string;
  name: string;
  module: string;
  action: string;
  description: string | null;
}

// ==========================================
// API Response Types
// ==========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ==========================================
// Audit Log Types
// ==========================================

export interface AuditLog {
  id: string;
  businessId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    fullName: string;
  } | null;
}

// ==========================================
// Common Types
// ==========================================

export type SortOrder = 'asc' | 'desc';

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ==========================================
// Form Types
// ==========================================

export interface CreateUserForm {
  username: string;
  email?: string;
  phone?: string;
  password: string;
  fullName: string;
  roleId: string;
  branchId?: string;
  isActive: boolean;
}

export interface UpdateUserForm {
  email?: string;
  phone?: string | null;
  fullName?: string;
  roleId?: string;
  branchId?: string | null;
  isActive?: boolean;
}

export interface CreateRoleForm {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleForm {
  name?: string;
  description?: string | null;
  permissionIds?: string[];
}

export interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordForm {
  userId: string;
  newPassword: string;
}
