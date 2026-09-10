/**
 * C3: Real backup restore service.
 *
 * Restores the business data contained in a cloud backup (created by
 * backupService.exportBusinessData) back into PostgreSQL using the existing
 * Prisma architecture.
 *
 * Guarantees:
 *  - success:true is returned ONLY after the data was actually restored
 *    inside a committed database transaction (previous behavior only
 *    verified the archive and reported success).
 *  - The backup is downloaded, checksum-verified, decompressed and
 *    structurally validated BEFORE any database change is attempted.
 *  - Restoration is destructive and therefore requires an explicit
 *    `confirm: true` flag from the caller (enforced here and in the API).
 *  - Execution runs in a single Prisma transaction: any failure rolls back
 *    every change; the backup record is marked restored only AFTER a
 *    successful commit.
 *  - Backup contents are treated as untrusted input: rows are only ever
 *    written through Prisma model delegates (no raw SQL), and the business
 *    identity in the payload must match the backup record's business.
 *
 * Snapshot format (phase19): { version, exportedAt, schemaVersion:'phase19',
 * data: { business: {...}, branches: [...], users: [...], ... } } — database
 * rows only, serialized by JSON.stringify (Decimal → string, DateTime → ISO
 * string, Json → object). BigInt columns exist only in the excluded backup
 * bookkeeping tables, so JSON number precision is not a concern here.
 */

import { promisify } from 'util';
import { gunzip as gunzipCallback } from 'zlib';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createAuditLog } from './auditService.js';
import type { StorageProvider } from './storage/types.js';
import { getStorageProvider } from './storage/index.js';

const gunzip = promisify(gunzipCallback);

export const BACKUP_SCHEMA_VERSION = 'phase19';

// ==========================================
// Restore error types (never leak secret/material values)
// ==========================================

export type RestoreErrorCode =
  | 'BACKUP_NOT_FOUND'
  | 'NOT_RESTORABLE_STATE'
  | 'MISSING_FILE_INFO'
  | 'CONFIRMATION_REQUIRED'
  | 'CHECKSUM_MISMATCH'
  | 'BACKUP_DECOMPRESSION_FAILED'
  | 'INVALID_BACKUP_FORMAT'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'BUSINESS_MISMATCH'
  | 'RESTORE_FAILED';

export class RestoreError extends Error {
  constructor(public code: RestoreErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = 'RestoreError';
  }
}

// ==========================================
// Snapshot table specifications
// ==========================================
//
// `parents` lists snapshot tables whose rows must exist before this table's
// rows can be inserted (derived from the FK constraints in
// server/prisma/migrations/20260910000000_init_full_schema/migration.sql).
// `wipeWhere` scopes the destructive delete to this business's rows only.

export interface SnapshotTableSpec {
  /** Key inside backup `data` (as produced by exportBusinessData). */
  key: string;
  /** Prisma model delegate name. */
  model: string;
  /** Physical table name (documentation / cross-checks). */
  table: string;
  /** Snapshot tables that must be restored before this one. */
  parents: string[];
  /** Prisma where-clause scoping the wipe to this business. */
  wipeWhere: (businessId: string) => Record<string, unknown>;
}

const byBusiness = (businessId: string) => ({ businessId });

export const SNAPSHOT_TABLES: SnapshotTableSpec[] = [
  { key: 'roles', model: 'role', table: 'roles', parents: [], wipeWhere: byBusiness },
  { key: 'branches', model: 'branch', table: 'branches', parents: [], wipeWhere: byBusiness },
  { key: 'users', model: 'user', table: 'users', parents: ['branches', 'roles'], wipeWhere: byBusiness },
  { key: 'settings', model: 'setting', table: 'settings', parents: [], wipeWhere: byBusiness },
  { key: 'categories', model: 'category', table: 'categories', parents: [], wipeWhere: byBusiness },
  { key: 'units', model: 'unit', table: 'units', parents: [], wipeWhere: byBusiness },
  { key: 'expenseCategories', model: 'expenseCategory', table: 'expense_categories', parents: [], wipeWhere: byBusiness },
  { key: 'vendors', model: 'vendor', table: 'vendors', parents: ['users'], wipeWhere: byBusiness },
  { key: 'customers', model: 'customer', table: 'customers', parents: ['users'], wipeWhere: byBusiness },
  { key: 'cashierShifts', model: 'cashierShift', table: 'cashier_shifts', parents: ['branches', 'users'], wipeWhere: byBusiness },
  { key: 'products', model: 'product', table: 'products', parents: ['categories'], wipeWhere: byBusiness },
  { key: 'productVariants', model: 'productVariant', table: 'product_variants', parents: ['products', 'units'], wipeWhere: (b) => ({ product: { businessId: b } }) },
  { key: 'inventories', model: 'inventory', table: 'inventories', parents: ['branches', 'products', 'productVariants'], wipeWhere: byBusiness },
  { key: 'stockMovements', model: 'stockMovement', table: 'stock_movements', parents: ['branches', 'inventories', 'products', 'productVariants', 'users'], wipeWhere: byBusiness },
  { key: 'purchases', model: 'purchase', table: 'purchases', parents: ['branches', 'vendors', 'users'], wipeWhere: byBusiness },
  { key: 'purchaseItems', model: 'purchaseItem', table: 'purchase_items', parents: ['products', 'productVariants', 'purchases'], wipeWhere: (b) => ({ purchase: { businessId: b } }) },
  { key: 'stockAdjustments', model: 'stockAdjustment', table: 'stock_adjustments', parents: ['branches', 'products', 'productVariants', 'stockMovements', 'users'], wipeWhere: byBusiness },
  { key: 'stockCounts', model: 'stockCount', table: 'stock_counts', parents: ['branches', 'users'], wipeWhere: byBusiness },
  { key: 'stockCountItems', model: 'stockCountItem', table: 'stock_count_items', parents: ['products', 'productVariants', 'stockCounts'], wipeWhere: (b) => ({ stockCount: { businessId: b } }) },
  { key: 'transfers', model: 'transfer', table: 'transfers', parents: ['branches', 'users'], wipeWhere: byBusiness },
  { key: 'transferItems', model: 'transferItem', table: 'transfer_items', parents: ['products', 'productVariants', 'stockMovements', 'transfers'], wipeWhere: (b) => ({ transfer: { businessId: b } }) },
  { key: 'stockBatches', model: 'stockBatch', table: 'stock_batches', parents: ['branches', 'products', 'productVariants', 'purchases'], wipeWhere: byBusiness },
  { key: 'sales', model: 'sale', table: 'sales', parents: ['branches', 'cashierShifts', 'customers', 'users'], wipeWhere: byBusiness },
  { key: 'saleItems', model: 'saleItem', table: 'sale_items', parents: ['products', 'productVariants', 'sales'], wipeWhere: (b) => ({ sale: { businessId: b } }) },
  { key: 'payments', model: 'payment', table: 'payments', parents: ['sales'], wipeWhere: (b) => ({ sale: { businessId: b } }) },
  { key: 'customerLedger', model: 'customerLedger', table: 'customer_ledger', parents: ['customers', 'users'], wipeWhere: byBusiness },
  { key: 'customerPayments', model: 'customerPayment', table: 'customer_payments', parents: ['customers', 'users'], wipeWhere: byBusiness },
  { key: 'expenses', model: 'expense', table: 'expenses', parents: ['branches', 'expenseCategories', 'users'], wipeWhere: byBusiness },
  { key: 'claims', model: 'claim', table: 'claims', parents: ['branches', 'purchases', 'users', 'vendors'], wipeWhere: byBusiness },
  { key: 'claimItems', model: 'claimItem', table: 'claim_items', parents: ['claims', 'products', 'productVariants', 'stockBatches', 'stockMovements'], wipeWhere: (b) => ({ claim: { businessId: b } }) },
  { key: 'salesTargets', model: 'salesTarget', table: 'sales_targets', parents: ['branches', 'categories', 'products', 'users'], wipeWhere: byBusiness },
  { key: 'commissionRules', model: 'commissionRule', table: 'commission_rules', parents: ['categories', 'products', 'users'], wipeWhere: byBusiness },
  { key: 'commissionRecords', model: 'commissionRecord', table: 'commission_records', parents: ['branches', 'commissionRules', 'salesTargets', 'users'], wipeWhere: byBusiness },
  { key: 'dailyRecords', model: 'dailyRecord', table: 'daily_records', parents: ['branches', 'users'], wipeWhere: byBusiness },
  { key: 'auditLogs', model: 'auditLog', table: 'audit_logs', parents: ['users'], wipeWhere: byBusiness },
  { key: 'rolePermissions', model: 'rolePermission', table: 'role_permissions', parents: ['roles'], wipeWhere: (b) => ({ role: { businessId: b } }) },
];

/**
 * Tables with FK chains into the business data that are NOT part of the
 * snapshot (exportBusinessData does not export them). They must still be
 * wiped for a correct point-in-time restore — e.g. import/export operation
 * rows hold RESTRICT foreign keys to users and would otherwise block the
 * wipe. Their live contents are intentionally replaced by "no rows" (the
 * state at backup time).
 */
export const WIPE_ONLY_TABLES: SnapshotTableSpec[] = [
  { key: 'whatsappMessages', model: 'whatsAppMessage', table: 'whatsapp_messages', parents: ['cashierShifts'], wipeWhere: byBusiness },
  { key: 'syncConflicts', model: 'syncConflict', table: 'sync_conflicts', parents: ['branches', 'users'], wipeWhere: byBusiness },
  { key: 'idempotencyRecords', model: 'idempotencyRecord', table: 'idempotency_records', parents: ['users'], wipeWhere: byBusiness },
  { key: 'importOperations', model: 'importOperation', table: 'import_operations', parents: ['users'], wipeWhere: byBusiness },
  { key: 'exportOperations', model: 'exportOperation', table: 'export_operations', parents: ['users'], wipeWhere: byBusiness },
  // Login sessions are wiped so that a restore invalidates all existing
  // sessions — everyone (including restored users) must re-authenticate
  // against the restored system state.
  { key: 'sessions', model: 'session', table: 'sessions', parents: ['users'], wipeWhere: byBusiness },
];

/**
 * Tables deliberately NOT touched by a restore:
 *  - `_prisma_migrations`   migration bookkeeping (not a Prisma model)
 *  - `businesses`           the business row itself is UPDATED, not replaced
 *                           (its id anchors permissions/CASCADE graph)
 *  - `permissions`          permission catalog is not part of snapshots and
 *                           must survive so restored role_permissions keep
 *                           valid foreign keys
 *  - `cloud_backups`,
 *    `cloud_storage_quotas` the backup catalog must survive a restore
 *                           (otherwise the restore record itself and newer
 *                           backups would be destroyed)
 *  - `whatsapp_configs`     integration configuration (not snapshot data);
 *                           preserved so configured integrations survive
 */
export const EXCLUDED_TABLES = [
  '_prisma_migrations',
  'businesses',
  'permissions',
  'cloud_backups',
  'cloud_storage_quotas',
  'whatsapp_configs',
] as const;

const ALL_WIPED_TABLES: SnapshotTableSpec[] = [...SNAPSHOT_TABLES, ...WIPE_ONLY_TABLES];

/**
 * Deterministic topological order (Kahn's algorithm, alphabetical
 * tie-breaking) so ordering is stable and unit-testable.
 */
export function topologicalOrder(specs: SnapshotTableSpec[]): SnapshotTableSpec[] {
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const spec of specs) {
    inDegree.set(spec.key, 0);
    children.set(spec.key, []);
  }
  for (const spec of specs) {
    for (const parent of spec.parents) {
      if (!byKey.has(parent)) continue; // parent not part of this ordering set
      inDegree.set(spec.key, (inDegree.get(spec.key) || 0) + 1);
      children.get(parent)!.push(spec.key);
    }
  }
  const ready = specs
    .filter((s) => (inDegree.get(s.key) || 0) === 0)
    .map((s) => s.key)
    .sort();
  const ordered: SnapshotTableSpec[] = [];
  while (ready.length > 0) {
    const key = ready.shift()!;
    ordered.push(byKey.get(key)!);
    for (const child of children.get(key)!) {
      const next = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, next);
      if (next === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  if (ordered.length !== specs.length) {
    const missing = specs.filter((s) => !ordered.includes(s)).map((s) => s.key);
    throw new RestoreError('INVALID_BACKUP_FORMAT', `Circular table dependency detected among: ${missing.join(', ')}`);
  }
  return ordered;
}

/** Parent-first order for inserting snapshot rows. */
export function computeInsertOrder(): SnapshotTableSpec[] {
  return topologicalOrder(SNAPSHOT_TABLES);
}

/** Child-first order for wiping live rows (exact reverse of a full-graph topo order). */
export function computeWipeOrder(): SnapshotTableSpec[] {
  return [...topologicalOrder(ALL_WIPED_TABLES)].reverse();
}

// ==========================================
// Backup payload validation (untrusted input)
// ==========================================

export interface BackupPayload {
  version?: unknown;
  schemaVersion?: unknown;
  data?: Record<string, unknown>;
}

export function validateBackupPayload(parsed: unknown, expectedBusinessId: string): asserts parsed is BackupPayload {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RestoreError('INVALID_BACKUP_FORMAT', 'Backup payload is not a JSON object');
  }
  const p = parsed as BackupPayload;
  if (!p.data || typeof p.data !== 'object' || Array.isArray(p.data)) {
    throw new RestoreError('INVALID_BACKUP_FORMAT', 'Backup is missing its data section');
  }
  if (p.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new RestoreError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Incompatible backup schema version: ${String(p.schemaVersion)}. Expected: ${BACKUP_SCHEMA_VERSION}`
    );
  }
  const business = p.data.business;
  if (typeof business !== 'object' || business === null || Array.isArray(business)) {
    throw new RestoreError('INVALID_BACKUP_FORMAT', 'Backup data is missing the business record');
  }
  const businessId = (business as Record<string, unknown>).id;
  if (typeof businessId !== 'string' || businessId.length === 0) {
    throw new RestoreError('INVALID_BACKUP_FORMAT', 'Backup business record has no id');
  }
  if (businessId !== expectedBusinessId) {
    throw new RestoreError('BUSINESS_MISMATCH', 'Backup does not belong to this business');
  }
  for (const spec of SNAPSHOT_TABLES) {
    const rows = p.data[spec.key];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new RestoreError('INVALID_BACKUP_FORMAT', `Backup section "${spec.key}" must be an array of rows`);
    }
  }
}

// ==========================================
// Restore plan
// ==========================================

export interface RestorePlanEntry {
  spec: SnapshotTableSpec;
  rows: Array<Record<string, unknown>>;
}

export interface RestorePlan {
  businessId: string;
  businessUpdate: Record<string, unknown>;
  /** Child-first wipe order (includes snapshot and wipe-only tables). */
  wipe: Array<{ spec: SnapshotTableSpec; where: Record<string, unknown> }>;
  /** Parent-first insert order (snapshot tables with rows only). */
  insert: RestorePlanEntry[];
}

const BUSINESS_FIELDS = [
  'name', 'logoUrl', 'address', 'phone', 'whatsapp', 'email',
  'taxNumber', 'currency', 'timezone', 'isActive',
] as const;

/**
 * Build the executable restore plan from a validated payload.
 *
 * `livePasswordHashes` maps user id → current password hash. The phase19
 * snapshot intentionally excludes password hashes, so restored users keep
 * their current passwords; snapshot users that no longer exist live get a
 * cryptographically random unusable hash (admin resets if needed).
 */
export function buildRestorePlan(
  payload: BackupPayload,
  businessId: string,
  livePasswordHashes: Map<string, string>,
  fallbackPasswordHash: string
): RestorePlan {
  const data = payload.data!;

  const business = data.business as Record<string, unknown>;
  const businessUpdate: Record<string, unknown> = {};
  for (const field of BUSINESS_FIELDS) {
    if (business[field] !== undefined) businessUpdate[field] = business[field];
  }

  const usersRaw = (data.users as Array<Record<string, unknown>> | undefined) ?? [];
  const users = usersRaw.map((row) => ({
    ...row,
    passwordHash: typeof row.passwordHash === 'string' && row.passwordHash.length > 0
      ? row.passwordHash
      : livePasswordHashes.get(String(row.id)) ?? fallbackPasswordHash,
    loginAttempts: typeof row.loginAttempts === 'number' ? row.loginAttempts : 0,
    lockedUntil: row.lockedUntil ?? null,
  }));

  const rowsByKey = new Map<string, Array<Record<string, unknown>>>();
  for (const spec of SNAPSHOT_TABLES) {
    const raw = spec.key === 'users' ? users : ((data[spec.key] as Array<Record<string, unknown>> | undefined) ?? []);
    rowsByKey.set(spec.key, raw);
  }

  const insert: RestorePlanEntry[] = [];
  for (const spec of computeInsertOrder()) {
    const rows = rowsByKey.get(spec.key) ?? [];
    if (rows.length > 0) insert.push({ spec, rows });
  }

  const wipe = computeWipeOrder().map((spec) => ({ spec, where: spec.wipeWhere(businessId) }));

  return { businessId, businessUpdate, wipe, insert };
}

// ==========================================
// Execution (inside a Prisma transaction)
// ==========================================

export interface RestoreModelDelegate {
  deleteMany: (args?: { where?: Record<string, unknown> }) => Promise<{ count: number }>;
  createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
}

/** Structural subset of the Prisma transaction client used here (also satisfied by test doubles). */
export type RestoreTxClient = Record<string, RestoreModelDelegate>;

export interface RestoreExecutionReport {
  wipedRows: number;
  restoredRows: number;
  tableCounts: Record<string, number>;
}

/**
 * Apply the plan to the database through the given transaction client.
 * Deletes happen child-first, inserts parent-first; any throw aborts the
 * surrounding Prisma transaction (full rollback).
 */
export async function executeRestorePlan(tx: RestoreTxClient, plan: RestorePlan): Promise<RestoreExecutionReport> {
  let wipedRows = 0;
  for (const { spec, where } of plan.wipe) {
    const delegate = tx[spec.model];
    if (!delegate) throw new RestoreError('RESTORE_FAILED', `Unknown model in restore plan: ${spec.model}`);
    const result = await delegate.deleteMany({ where });
    wipedRows += result?.count ?? 0;
  }

  if (plan.businessId && Object.keys(plan.businessUpdate).length > 0) {
    await tx.business.update({ where: { id: plan.businessId }, data: plan.businessUpdate });
  }

  let restoredRows = 0;
  const tableCounts: Record<string, number> = {};
  for (const entry of plan.insert) {
    const delegate = tx[entry.spec.model];
    if (!delegate) throw new RestoreError('RESTORE_FAILED', `Unknown model in restore plan: ${entry.spec.model}`);
    const result = await delegate.createMany({ data: entry.rows, skipDuplicates: false });
    const count = result?.count ?? entry.rows.length;
    tableCounts[entry.spec.key] = count;
    restoredRows += count;
  }

  return { wipedRows, restoredRows, tableCounts };
}

// ==========================================
// Orchestration
// ==========================================

export interface PerformRestoreInput {
  backupId: string;
  businessId: string;
  userId: string;
  /** Explicit destructive-action confirmation — restores are refused without it. */
  confirm: boolean;
  ipAddress?: string;
  userAgent?: string;
  /** Test seams (default to production singletons when omitted). */
  deps?: {
    storage?: StorageProvider;
    client?: {
      cloudBackup: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
      };
      user: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; passwordHash: string }>> };
      $transaction: <T>(fn: (tx: RestoreTxClient) => Promise<T>) => Promise<T>;
    };
  };
}

export interface RestoreResult {
  backupId: string;
  backupNumber: string;
  downloaded: true;
  checksumVerified: true;
  backupValidated: true;
  restoreStarted: true;
  restoreCompleted: true;
  restored: true;
  restoredAt: string;
  wipedRows: number;
  restoredRows: number;
  tableCount: number;
  tableCounts: Record<string, number>;
  excludedTables: readonly string[];
  message: string;
}

async function auditSafe(data: {
  businessId: string; userId: string; action: string; backupId: string; ipAddress?: string; userAgent?: string;
  newValues?: Record<string, unknown>;
}): Promise<void> {
  // Audit writes must never mask a restore result (DB may be unavailable).
  try {
    await createAuditLog({
      businessId: data.businessId,
      userId: data.userId,
      action: data.action,
      entityType: 'cloud_backup',
      entityId: data.backupId,
      newValues: data.newValues,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
  } catch (error) {
    logger.warn('Backup restore audit write failed', { backupId: data.backupId, action: data.action, error: String(error) });
  }
}

export async function performRestore(input: PerformRestoreInput): Promise<RestoreResult> {
  const { backupId, businessId, userId } = input;
  const client = input.deps?.client ?? (prisma as unknown as PerformRestoreInput['deps'] extends undefined ? never : NonNullable<NonNullable<PerformRestoreInput['deps']>['client']>);
  const storage = input.deps?.storage ?? getStorageProvider();

  if (input.confirm !== true) {
    throw new RestoreError(
      'CONFIRMATION_REQUIRED',
      'Restore refused: this operation replaces current business data and requires explicit confirmation (confirm: true).'
    );
  }

  // 1. Find backup and verify ownership
  const backup = await client.cloudBackup.findFirst({ where: { id: backupId, businessId } });
  if (!backup) throw new RestoreError('BACKUP_NOT_FOUND', 'Backup not found');
  if (!['COMPLETED', 'VERIFIED'].includes(String(backup.status))) {
    throw new RestoreError('NOT_RESTORABLE_STATE', `Backup is not in a restorable state (status: ${String(backup.status)})`);
  }
  if (!backup.filePath || !backup.checksum) {
    throw new RestoreError('MISSING_FILE_INFO', 'Backup file information missing');
  }

  // 2. Download + checksum + decompress + parse
  const compressed = await storage.download(String(backup.filePath));
  const actualChecksum = crypto.createHash('sha256').update(compressed).digest('hex');
  if (actualChecksum !== backup.checksum) {
    throw new RestoreError('CHECKSUM_MISMATCH', 'Backup integrity check failed: checksum mismatch');
  }

  let decompressed: Buffer;
  try {
    decompressed = (await gunzip(compressed)) as Buffer;
  } catch {
    throw new RestoreError('BACKUP_DECOMPRESSION_FAILED', 'Backup could not be decompressed (corrupted archive)');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decompressed.toString('utf-8'));
  } catch {
    throw new RestoreError('INVALID_BACKUP_FORMAT', 'Backup is not valid JSON');
  }

  // 3. Structural/schema/business validation — before touching the database
  validateBackupPayload(parsed, businessId);

  // 4. Capture current password hashes (snapshot excludes them) + prepare fallback
  const liveUsers = await client.user.findMany({ where: { businessId }, select: { id: true, passwordHash: true } });
  const livePasswordHashes = new Map(liveUsers.map((u) => [u.id, u.passwordHash]));
  const fallbackPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

  const plan = buildRestorePlan(parsed, businessId, livePasswordHashes, fallbackPasswordHash);

  await auditSafe({ businessId, userId, action: 'BACKUP_RESTORE_REQUESTED', backupId, ipAddress: input.ipAddress, userAgent: input.userAgent, newValues: { backupNumber: backup.backupNumber, mode: 'FULL_DATA_RESTORE' } });

  // 5. Transactional restore — any failure rolls back everything
  let report: RestoreExecutionReport;
  try {
    report = await client.$transaction((tx) => executeRestorePlan(tx, plan));
  } catch (error) {
    logger.error('Backup restore transaction failed — database rolled back', {
      backupId,
      error: error instanceof Error ? error.message : String(error),
    });
    await auditSafe({ businessId, userId, action: 'BACKUP_RESTORE_FAILED', backupId, ipAddress: input.ipAddress, userAgent: input.userAgent, newValues: { error: error instanceof Error ? error.message : String(error) } });
    throw new RestoreError('RESTORE_FAILED', `Restore failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 6. Mark restored + audit ONLY after a successful commit
  const restoredAt = new Date();
  let warning: string | undefined;
  try {
    await client.cloudBackup.update({
      where: { id: backupId },
      data: { restoredAt, restoredBy: userId },
    });
  } catch {
    // The restoring admin may no longer exist after the restore (users are
    // replaced by the snapshot) — restored_by would violate its FK. Record
    // the restore marker without the user reference so the audit trail on
    // the backup record is still accurate.
    try {
      await client.cloudBackup.update({
        where: { id: backupId },
        data: { restoredAt, restoredBy: null },
      });
    } catch (error) {
      warning = 'Data was restored successfully but recording the restore marker failed.';
      logger.error('Failed to record restore marker', { backupId, error: String(error) });
    }
  }
  await auditSafe({ businessId, userId, action: 'BACKUP_RESTORED', backupId, ipAddress: input.ipAddress, userAgent: input.userAgent, newValues: { action: 'RESTORE_COMPLETED', backupNumber: backup.backupNumber, restoredRows: report.restoredRows, wipedRows: report.wipedRows } });

  return {
    backupId,
    backupNumber: String(backup.backupNumber ?? ''),
    downloaded: true,
    checksumVerified: true,
    backupValidated: true,
    restoreStarted: true,
    restoreCompleted: true,
    restored: true,
    restoredAt: restoredAt.toISOString(),
    wipedRows: report.wipedRows,
    restoredRows: report.restoredRows,
    tableCount: Object.keys(report.tableCounts).length,
    tableCounts: report.tableCounts,
    excludedTables: EXCLUDED_TABLES,
    message: warning ?? `Restored ${report.restoredRows} rows across ${Object.keys(report.tableCounts).length} tables; ${report.wipedRows} live rows replaced.`,
  };
}
