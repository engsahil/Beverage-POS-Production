/**
 * C3: Focused backup restore tests.
 *
 * Strategy (honest about sandbox limits):
 *  - Payload validation, ordering, plan building and execution control flow
 *    are tested directly (pure logic + injected test doubles).
 *  - Archive integrity paths use REAL gzip + SHA-256 artifacts stored through
 *    the REAL LocalStorageProvider (same as phase19 tests).
 *  - The declared table ordering is cross-checked against the REAL foreign-key
 *    graph by loading the committed baseline migration into PostgreSQL
 *    (@electric-sql/pglite WASM) when that package is importable. It is NOT a
 *    repo dependency, so the cross-check skips gracefully elsewhere.
 *  - The Prisma client itself cannot execute in this sandbox (engine binaries
 *    unavailable), so a real end-to-end PostgreSQL write is NOT claimed here;
 *    the execution layer is exercised through the same transaction-client
 *    interface Prisma provides (see RESTORE-DB-VERIFICATION note in the step
 *    report).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { gzip as gzipCb } from 'zlib';
import { fileURLToPath } from 'url';

import {
  SNAPSHOT_TABLES,
  WIPE_ONLY_TABLES,
  EXCLUDED_TABLES,
  computeInsertOrder,
  computeWipeOrder,
  validateBackupPayload,
  buildRestorePlan,
  executeRestorePlan,
  performRestore,
  RestoreError,
  type BackupPayload,
  type RestorePlan,
} from '../src/services/backupRestore.js';
import { LocalStorageProvider } from '../src/services/storage/localProvider.js';

const gzip = promisify(gzipCb);

const BIZ = '0b8f9d6a-1111-4111-8111-111111111111';
const LIVE_HASH = '$2a$10$existingpasswordhashvalue1234567890123456789012345';

function validSnapshot(): Record<string, unknown> {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    schemaVersion: 'phase19',
    data: {
      business: { id: BIZ, name: 'Restored Biz', currency: 'PKR', timezone: 'Asia/Karachi' },
      branches: [{ id: 'br1', businessId: BIZ, name: 'Main', code: 'MAIN' }],
      users: [
        { id: 'u1', businessId: BIZ, branchId: 'br1', username: 'admin', fullName: 'Admin' },
        { id: 'u2', businessId: BIZ, branchId: 'br1', username: 'snapshot-only', fullName: 'Old User' },
      ],
      roles: [{ id: 'r1', businessId: BIZ, name: 'Admin' }],
      rolePermissions: [{ roleId: 'r1', permissionId: 'perm-1' }],
      settings: [{ id: 's1', businessId: BIZ, key: 'k', value: { v: 1 } }],
      categories: [{ id: 'c1', businessId: BIZ, name: 'Drinks' }],
      units: [{ id: 'un1', businessId: BIZ, name: 'Carton', shortCode: 'CTN' }],
      products: [{ id: 'p1', businessId: BIZ, categoryId: 'c1', name: 'Cola' }],
      productVariants: [{ id: 'pv1', productId: 'p1', unitId: 'un1', name: 'Can' }],
      customers: [{ id: 'cust1', businessId: BIZ, name: 'Walk-in', createdBy: 'u1' }],
      cashierShifts: [{ id: 'sh1', businessId: BIZ, branchId: 'br1', cashierId: 'u1', openedBy: 'u1' }],
      sales: [{ id: 'sale1', businessId: BIZ, branchId: 'br1', saleNumber: 'SALE-000001', cashierId: 'u1', customerId: 'cust1', shiftId: 'sh1' }],
      saleItems: [{ id: 'si1', saleId: 'sale1', productId: 'p1', variantId: 'pv1' }],
      payments: [{ id: 'pay1', saleId: 'sale1', paymentMethod: 'CASH' }],
      expenseCategories: [{ id: 'ec1', businessId: BIZ, name: 'Utilities' }],
      expenses: [{ id: 'ex1', businessId: BIZ, branchId: 'br1', categoryId: 'ec1', createdBy: 'u1' }],
      auditLogs: [{ id: 'al1', businessId: BIZ, action: 'USER_LOGIN', entityType: 'user', userId: 'u1' }],
    },
  };
}

async function makeArchive(payload: unknown): Promise<{ buffer: Buffer; checksum: string }> {
  const compressed = (await gzip(Buffer.from(JSON.stringify(payload), 'utf-8'))) as Buffer;
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  return { buffer: compressed, checksum };
}

// ---------- test doubles ----------

interface RecordedCall { op: string; model: string; args: unknown }

function makeRecorderTx(record: RecordedCall[], failOnModel: string | null = null) {
  return new Proxy({}, {
    get(_target, model: string) {
      return {
        deleteMany: async (args: unknown) => {
          record.push({ op: 'deleteMany', model, args });
          return { count: 3 };
        },
        createMany: async (args: { data: unknown[] }) => {
          if (failOnModel && model === failOnModel) throw new Error('Simulated DB failure');
          record.push({ op: 'createMany', model, args });
          return { count: args.data.length };
        },
        update: async (args: unknown) => {
          record.push({ op: 'update', model, args });
          return {};
        },
      };
    },
  });
}

function makeStubClient(opts: {
  backup?: Record<string, unknown>;
  failOnModel?: string | null;
} = {}) {
  const state = {
    backup: { ...opts.backup },
    cloudBackupUpdates: [] as Array<Record<string, unknown>>,
    tx: [] as RecordedCall[],
  };
  const client = {
    cloudBackup: {
      findFirst: async () => ({ ...state.backup }),
      update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.cloudBackupUpdates.push(args);
        return {};
      },
    },
    user: {
      findMany: async () => [{ id: 'u1', passwordHash: LIVE_HASH }],
    },
    $transaction: async <T>(fn: (tx: never) => Promise<T>) => fn(makeRecorderTx(state.tx, opts.failOnModel ?? null) as never),
  };
  return { client, state };
}

function opIndex(state: { tx: RecordedCall[] }, op: string, model: string): number {
  const idx = state.tx.findIndex((c) => c.op === op && c.model === model);
  assert.notEqual(idx, -1, `expected a recorded ${op} for ${model}`);
  return idx;
}

// ---------- validation ----------

describe('C3: backup payload validation', () => {
  it('accepts a structurally valid snapshot for the owning business', () => {
    const payload = validSnapshot() as unknown;
    assert.doesNotThrow(() => validateBackupPayload(payload, BIZ));
  });

  it('rejects non-object payloads', () => {
    assert.throws(() => validateBackupPayload('not-an-object', BIZ), (e: RestoreError) => e.code === 'INVALID_BACKUP_FORMAT');
    assert.throws(() => validateBackupPayload([1, 2], BIZ), (e: RestoreError) => e.code === 'INVALID_BACKUP_FORMAT');
  });

  it('rejects missing data section', () => {
    assert.throws(() => validateBackupPayload({ version: '1.0.0' }, BIZ), (e: RestoreError) => e.code === 'INVALID_BACKUP_FORMAT');
  });

  it('rejects unsupported schema versions', () => {
    const payload = { ...validSnapshot(), schemaVersion: 'phase18' };
    assert.throws(() => validateBackupPayload(payload, BIZ), (e: RestoreError) => e.code === 'UNSUPPORTED_SCHEMA_VERSION');
  });

  it('rejects a backup belonging to a different business', () => {
    const payload = validSnapshot();
    (payload.data as Record<string, unknown>).business = { id: 'other-business' };
    assert.throws(() => validateBackupPayload(payload, BIZ), (e: RestoreError) => e.code === 'BUSINESS_MISMATCH');
  });

  it('rejects non-array row sections', () => {
    const payload = validSnapshot();
    (payload.data as Record<string, unknown>).sales = { oops: true };
    assert.throws(() => validateBackupPayload(payload, BIZ), (e: RestoreError) => e.code === 'INVALID_BACKUP_FORMAT');
  });
});

// ---------- ordering ----------

describe('C3: restore table ordering', () => {
  const insertOrder = computeInsertOrder();
  const wipeOrder = computeWipeOrder();

  it('covers every snapshot table exactly once', () => {
    assert.equal(insertOrder.length, SNAPSHOT_TABLES.length);
    assert.equal(new Set(insertOrder.map((s) => s.key)).size, SNAPSHOT_TABLES.length);
  });

  it('inserts parents before children (declared dependencies)', () => {
    const idx = new Map(insertOrder.map((s, i) => [s.key, i]));
    for (const spec of insertOrder) {
      for (const parent of spec.parents) {
        if (!idx.has(parent)) continue;
        assert.ok(idx.get(parent)! < idx.get(spec.key)!, `${parent} must be inserted before ${spec.key}`);
      }
    }
  });

  it('wipes children before parents (reverse order)', () => {
    const idx = new Map(wipeOrder.map((s, i) => [s.key, i]));
    for (const spec of wipeOrder) {
      for (const parent of spec.parents) {
        if (!idx.has(parent)) continue;
        assert.ok(idx.get(spec.key)! < idx.get(parent)!, `${spec.key} must be wiped before ${parent}`);
      }
    }
  });

  it('wipes only-tables (sessions, sync queues, import/export ops, whatsapp messages) and never the excluded tables', () => {
    const wipedKeys = new Set(wipeOrder.map((s) => s.key));
    for (const t of WIPE_ONLY_TABLES) assert.ok(wipedKeys.has(t.key), `${t.key} must be wiped`);
    const wipedTables = new Set(wipeOrder.map((s) => s.table));
    for (const t of EXCLUDED_TABLES) assert.ok(!wipedTables.has(t), `${t} must never be wiped`);
  });

  it('full wiped coverage = snapshot tables + wipe-only tables (no table forgotten)', () => {
    const all = new Set([...wipeOrder.map((s) => s.table), ...EXCLUDED_TABLES]);
    assert.equal(all.size, SNAPSHOT_TABLES.length + WIPE_ONLY_TABLES.length + EXCLUDED_TABLES.length);
  });
});

// ---------- plan building ----------

describe('C3: restore plan building', () => {
  it('merges live password hashes and assigns an unusable fallback for snapshot-only users', () => {
    const payload = validSnapshot() as BackupPayload;
    validateBackupPayload(payload, BIZ);
    const plan = buildRestorePlan(payload, BIZ, new Map([['u1', LIVE_HASH]]), 'FALLBACK-HASH');
    const usersEntry = plan.insert.find((e) => e.spec.key === 'users');
    assert.ok(usersEntry);
    const rows = usersEntry.rows as Array<Record<string, unknown>>;
    assert.equal(rows.find((r) => r.id === 'u1')!.passwordHash, LIVE_HASH, 'existing user keeps current password');
    assert.equal(rows.find((r) => r.id === 'u2')!.passwordHash, 'FALLBACK-HASH', 'snapshot-only user gets locked-out fallback hash');
  });

  it('omits empty sections from the insert plan but wipes every table', () => {
    const payload = validSnapshot();
    const data = payload.data as Record<string, unknown>;
    data.expenses = [];
    data.expenseCategories = [];
    validateBackupPayload(payload as BackupPayload, BIZ);
    const plan = buildRestorePlan(payload as BackupPayload, BIZ, new Map(), 'FB');
    assert.ok(!plan.insert.some((e) => e.spec.key === 'expenses'));
    assert.ok(plan.insert.some((e) => e.spec.key === 'sales'));
    assert.ok(plan.wipe.some((w) => w.spec.key === 'expenses'), 'empty sections are still wiped');
  });

  it('scopes wipes to the business being restored', () => {
    const payload = validSnapshot() as BackupPayload;
    validateBackupPayload(payload, BIZ);
    const plan = buildRestorePlan(payload, BIZ, new Map(), 'FB');
    const branchWipe = plan.wipe.find((w) => w.spec.key === 'branches');
    assert.deepEqual(branchWipe!.where, { businessId: BIZ });
    const saleItemWipe = plan.wipe.find((w) => w.spec.key === 'saleItems');
    assert.deepEqual(saleItemWipe!.where, { sale: { businessId: BIZ } }, 'child tables wipe via their business-scoped parent relation');
  });

  it('extracts whitelisted business fields for the business row update', () => {
    const payload = validSnapshot() as BackupPayload;
    validateBackupPayload(payload, BIZ);
    const plan = buildRestorePlan(payload, BIZ, new Map(), 'FB');
    assert.equal(plan.businessUpdate.name, 'Restored Biz');
    assert.ok(!('id' in plan.businessUpdate) && !('createdAt' in plan.businessUpdate));
  });
});

// ---------- execution control flow ----------

describe('C3: restore plan execution (transaction client control flow)', () => {
  function smallPlan(): RestorePlan {
    const payload = validSnapshot() as BackupPayload;
    validateBackupPayload(payload, BIZ);
    return buildRestorePlan(payload, BIZ, new Map([['u1', LIVE_HASH]]), 'FB');
  }

  it('wipes child rows before parent rows and inserts parent rows before child rows', async () => {
    const record: RecordedCall[] = [];
    const report = await executeRestorePlan(makeRecorderTx(record) as never, smallPlan());
    // FK-critical ordering spot checks
    assert.ok(opIndex({ tx: record }, 'deleteMany', 'saleItem') < opIndex({ tx: record }, 'deleteMany', 'sale'));
    assert.ok(opIndex({ tx: record }, 'deleteMany', 'sale') < opIndex({ tx: record }, 'deleteMany', 'customer'));
    assert.ok(opIndex({ tx: record }, 'deleteMany', 'customer') < opIndex({ tx: record }, 'deleteMany', 'user'));
    assert.ok(opIndex({ tx: record }, 'createMany', 'user') < opIndex({ tx: record }, 'createMany', 'customer'));
    assert.ok(opIndex({ tx: record }, 'createMany', 'customer') < opIndex({ tx: record }, 'createMany', 'sale'));
    assert.ok(opIndex({ tx: record }, 'createMany', 'product') < opIndex({ tx: record }, 'createMany', 'saleItem'));
    // business row is updated, not deleted/recreated
    assert.ok(opIndex({ tx: record }, 'update', 'business') < opIndex({ tx: record }, 'createMany', 'branch'));
    assert.equal(record.filter((c) => c.op === 'deleteMany' && c.model === 'business').length, 0);
    assert.ok(report.restoredRows > 0);
  });

  it('propagates execution errors so the surrounding transaction rolls back', async () => {
    const record: RecordedCall[] = [];
    await assert.rejects(
      () => executeRestorePlan(makeRecorderTx(record, 'sale') as never, smallPlan()),
      /Simulated DB failure/
    );
    // The failing createMany aborted execution — nothing after it ran.
    assert.equal(record.findIndex((c) => c.op === 'createMany' && c.model === 'saleItem'), -1);
    assert.equal(record.findIndex((c) => c.op === 'createMany' && c.model === 'payment'), -1);
    // but real wipe/insert work had already started before the failure
    assert.ok(record.some((c) => c.op === 'deleteMany' && c.model === 'saleItem'), 'wipes had started before the failure');
    assert.ok(record.some((c) => c.op === 'createMany' && c.model === 'customer'), 'parent inserts had completed before the failure');
  });
});

// ---------- full restore orchestration (real archives + provider) ----------

describe('C3: performRestore (real archive verification, injected DB)', () => {
  let storageDir: string;
  let storage: LocalStorageProvider;

  before(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bevpos-restore-test-'));
    storage = new LocalStorageProvider(storageDir);
  });

  after(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  async function seedBackup(archive: { buffer: Buffer; checksum: string }, overrides: Record<string, unknown> = {}) {
    const key = await storage.upload(`${crypto.randomUUID()}.json.gz`, archive.buffer, 'application/gzip');
    return {
      id: 'backup-1',
      businessId: BIZ,
      backupNumber: 'BKP-000001',
      status: 'COMPLETED',
      filePath: key.key,
      checksum: archive.checksum,
      ...overrides,
    };
  }

  it('refuses to run without explicit confirmation and touches nothing', async () => {
    const archive = await makeArchive(validSnapshot());
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup });
    let downloads = 0;
    const countingStorage = Object.create(storage, { download: { value: async () => { downloads++; return storage.download((await seedBackup(archive)).filePath as string); } } });

    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: false, deps: { storage: countingStorage as LocalStorageProvider, client: client as never } }),
      (e: RestoreError) => e.code === 'CONFIRMATION_REQUIRED'
    );
    assert.equal(downloads, 0, 'no download without confirmation');
    assert.equal(state.tx.length, 0, 'no database changes without confirmation');
    assert.equal(state.cloudBackupUpdates.length, 0);
  });

  it('restores a valid backup: real data plan executed, backup marked restored, truthful success', async () => {
    const archive = await makeArchive(validSnapshot());
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup });

    const result = await performRestore({
      backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true,
      deps: { storage, client: client as never },
    });

    assert.equal(result.restored, true);
    assert.equal(result.checksumVerified, true);
    assert.equal(result.restoreCompleted, true);
    assert.ok(result.restoredRows > 0);
    assert.equal(result.tableCounts.users, 2);
    assert.ok(result.restoredAt);

    // The data plan actually ran: sales/customers/users rows recorded
    const usersInsert = state.tx.find((c) => c.op === 'createMany' && c.model === 'user');
    assert.ok(usersInsert, 'user rows were written');
    const salesInsert = state.tx.find((c) => c.op === 'createMany' && c.model === 'sale');
    assert.ok(salesInsert, 'sale rows were written');
    // backup record marked restored only after the transaction committed
    assert.equal(state.cloudBackupUpdates.length, 1);
    assert.ok((state.cloudBackupUpdates[0].data as Record<string, unknown>).restoredAt);
  });

  it('rejects a corrupted archive (checksum mismatch) and does NOT mark restored', async () => {
    const archive = await makeArchive(validSnapshot());
    const tampered = Buffer.from(archive.buffer);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff; // flip a byte
    const tamperedChecksum = crypto.createHash('sha256').update(tampered).digest('hex');
    const key = await storage.upload(`${crypto.randomUUID()}.json.gz`, tampered, 'application/gzip');
    const backup = {
      id: 'backup-1', businessId: BIZ, backupNumber: 'BKP-000002', status: 'COMPLETED',
      filePath: key.key, checksum: tamperedChecksum === archive.checksum ? archive.checksum + '0' : archive.checksum,
    };
    const { client, state } = makeStubClient({ backup });

    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true, deps: { storage, client: client as never } }),
      (e: RestoreError) => e.code === 'CHECKSUM_MISMATCH'
    );
    assert.equal(state.tx.length, 0, 'no database changes for corrupted backup');
    assert.equal(state.cloudBackupUpdates.length, 0, 'backup not marked restored');
  });

  it('rejects invalid structure (wrong schema version) without touching the database', async () => {
    const bad = validSnapshot();
    bad.schemaVersion = 'phase18';
    const archive = await makeArchive(bad);
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup });

    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true, deps: { storage, client: client as never } }),
      (e: RestoreError) => e.code === 'UNSUPPORTED_SCHEMA_VERSION'
    );
    assert.equal(state.tx.length, 0);
    assert.equal(state.cloudBackupUpdates.length, 0);
  });

  it('rejects a backup belonging to a different business', async () => {
    const payload = validSnapshot();
    (payload.data as Record<string, unknown>).business = { id: 'some-other-business' };
    const archive = await makeArchive(payload);
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup });

    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true, deps: { storage, client: client as never } }),
      (e: RestoreError) => e.code === 'BUSINESS_MISMATCH'
    );
    assert.equal(state.tx.length, 0);
    assert.equal(state.cloudBackupUpdates.length, 0);
  });

  it('reports failure and does NOT mark restored when the transaction fails (rollback semantics)', async () => {
    const archive = await makeArchive(validSnapshot());
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup, failOnModel: 'sale' });

    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true, deps: { storage, client: client as never } }),
      (e: RestoreError) => e.code === 'RESTORE_FAILED' && /rolled back/i.test(e.message)
    );
    assert.equal(state.cloudBackupUpdates.length, 0, 'failed restore must not be marked restored');
    assert.ok(state.tx.some((c) => c.op === 'createMany' && c.model === 'customer'), 'work had started before the failure');
  });

  it('falls back to a user-less restore marker when the restoring admin no longer exists', async () => {
    const archive = await makeArchive(validSnapshot());
    const backup = await seedBackup(archive);
    const { client, state } = makeStubClient({ backup });
    let calls = 0;
    client.cloudBackup.update = async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      calls++;
      if (calls === 1) throw new Error('FK violation - restored_by no longer exists');
      state.cloudBackupUpdates.push(args);
      return {};
    };

    const result = await performRestore({
      backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true,
      deps: { storage, client: client as never },
    });
    assert.equal(result.restored, true, 'data restore outcome is unaffected by the marker fallback');
    assert.equal(calls, 2, 'first attempt with user ref, fallback without');
    assert.equal(state.cloudBackupUpdates[0].data.restoredBy, null, 'fallback marker recorded without user reference');
    assert.ok(state.cloudBackupUpdates[0].data.restoredAt);
  });

  it('refuses backups that are not in a restorable state', async () => {
    const archive = await makeArchive(validSnapshot());
    const backup = await seedBackup(archive, { status: 'FAILED' });
    const { client, state } = makeStubClient({ backup });
    await assert.rejects(
      () => performRestore({ backupId: 'backup-1', businessId: BIZ, userId: 'admin-1', confirm: true, deps: { storage, client: client as never } }),
      (e: RestoreError) => e.code === 'NOT_RESTORABLE_STATE'
    );
    assert.equal(state.tx.length, 0);
  });
});

// ---------- REAL PostgreSQL FK cross-check (runs when PGlite is available) ----------

describe('C3: restore ordering vs REAL database foreign keys (PGlite)', () => {
  it('declared insert/wipe orders satisfy the actual FK graph of the committed baseline migration', async (t) => {
    let PGlite: unknown;
    try {
      ({ PGlite } = await import('@electric-sql/pglite'));
    } catch {
      t.skip('@electric-sql/pglite not available in this environment — cross-check skipped');
      return;
    }
    const sqlPath = fileURLToPath(new URL('../prisma/migrations/20260910000000_init_full_schema/migration.sql', import.meta.url));
    const ddl = await fs.readFile(sqlPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new (PGlite as new () => { exec: (s: string) => Promise<unknown>; query: <T>(s: string) => Promise<{ rows: T[] }> })();
    await db.exec(ddl);

    const edges = (await db.query<{ child: string; parent: string }>(
      `SELECT con.conrelid::regclass::text AS child, con.confrelid::regclass::text AS parent
       FROM pg_constraint con WHERE con.contype='f' AND con.connamespace='public'::regnamespace`
    )).rows;
    assert.ok(edges.length >= 150, `expected the full FK graph, got ${edges.length} edges`);

    const tables = (await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public'`
    )).rows.map((r) => r.tablename);

    const insertOrder = computeInsertOrder();
    const wipeOrder = computeWipeOrder();
    const insertIdx = new Map(insertOrder.map((s, i) => [s.table, i]));
    const wipeIdx = new Map(wipeOrder.map((s, i) => [s.table, i]));
    const wiped = new Set(wipeOrder.map((s) => s.table));
    const excluded = new Set<string>(EXCLUDED_TABLES);
    const insertTables = new Set(insertOrder.map((s) => s.table));

    // Complete coverage: every physical table is either wiped or explicitly excluded
    for (const table of tables) {
      assert.ok(wiped.has(table) || excluded.has(table), `table ${table} is neither wiped nor excluded`);
    }

    // Every FK edge must be satisfied by the computed orders
    for (const { child, parent } of edges) {
      const c = child.replace(/^"?"|"/g, '');
      const p = parent.replace(/^"?"|"/g, '');
      if (insertTables.has(c) && insertTables.has(p)) {
        assert.ok(insertIdx.get(p)! < insertIdx.get(c)!, `insert order violates FK ${c} -> ${p}`);
      }
      if (wiped.has(c) && wiped.has(p)) {
        assert.ok(wipeIdx.get(c)! < wipeIdx.get(p)!, `wipe order violates FK ${c} -> ${p}`);
      }
    }
  });
});
