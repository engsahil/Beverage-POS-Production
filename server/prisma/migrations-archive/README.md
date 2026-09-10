# Archived (pre-baseline) migration history — DO NOT DEPLOY

These 7 migration folders are the original commit history of
`server/prisma/migrations/`. They were moved here untouched (byte-for-byte)
on 2026-09-10 because **they can never produce the application schema on a
database, and therefore blocked fresh provisioning entirely** (baseline audit
finding **C1**).

## Why they were archived instead of kept in `migrations/`

1. **Incomplete:** they create only 12 of the 47 tables defined by
   `server/prisma/schema.prisma` (no `businesses`, `branches`, `users`,
   `roles`, `permissions`, `sessions`, `settings`, `inventories`, `sales`, …).
2. **Self-contradictory on an empty database:** the very first migration
   (`20260105_add_product_catalog`) declares foreign keys that reference
   `businesses` — a table no migration creates — so `prisma migrate deploy`
   fails at step 1 on any fresh database.
3. **Unfixable by appending:** because migration order is fixed, any new
   migration either runs before them (their `CREATE TABLE` statements then
   fail with "already exists") or after them (their FKs reference tables that
   still do not exist). No ordering of added files can make this history
   deployable.
4. **Drift from the schema:** several statements do not match
   `schema.prisma` (e.g. `UUID`/`TIMESTAMPTZ` columns where the schema defines
   `String`/`DateTime`, hand-named `idx_*` indexes, an
   `import_operations(status, created_at DESC)` index that is not in the
   schema, and `TEXT[]` columns added to `businesses` that the schema does not
   define). Two folders also contain seed-data `INSERT`s, which migrations
   should not.

## What replaced them

A single, complete, verified baseline migration:

```
server/prisma/migrations/20260910000000_init_full_schema/migration.sql
server/prisma/migrations/migration_lock.toml
```

It creates the full structure defined by `server/prisma/schema.prisma`
(47 tables, all primary keys, foreign keys with the exact referential
actions, unique constraints and indexes). It contains **no seed data** —
application data (roles, permissions, admin user, settings) is seeded
exclusively with `npm run db:seed` (`server/prisma/seed.ts`), which already
includes every permission the archived INSERT statements used to add
(including `pos.offline.sync`, seed.ts line 204).

## Fresh databases

Nothing to do — just run:

```bash
npx prisma migrate deploy
```

## Databases that already have the full schema (created via `prisma db push`, manually, or any non-migration path)

Mark the baseline as already applied — it will be recorded in
`_prisma_migrations` **without executing** (standard Prisma baselining):

```bash
npx prisma migrate resolve --applied 20260910000000_init_full_schema
```

Then `prisma migrate deploy` is a no-op until the schema changes again.

> A database that had recorded the old (archived) migrations is not a real
> scenario: as explained above, that history cannot complete on any database
> state. If you believe you have one, inspect `_prisma_migrations` first and
> ask before running anything destructive.

## Keeping this folder

These files are kept purely as historical reference. `prisma migrate` ignores
everything outside `server/prisma/migrations/`. Do not move them back, and do
not add new migrations here.
