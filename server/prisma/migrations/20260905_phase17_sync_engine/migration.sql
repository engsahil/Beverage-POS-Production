-- Phase 17: Sync Engine & Conflict Resolution
-- Create IdempotencyRecord and SyncConflict tables

-- IdempotencyRecord: Prevents duplicate operation processing
CREATE TABLE "idempotency_records" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    "idempotency_key" TEXT NOT NULL UNIQUE,
    "operation_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "status_code" INTEGER NOT NULL DEFAULT 200,
    "response_body" JSONB,
    "device_id" TEXT,
    "user_id" UUID REFERENCES users(id) ON DELETE SET NULL,
    "branch_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_business ON idempotency_records(business_id);
CREATE INDEX idx_idempotency_key ON idempotency_records(idempotency_key);
CREATE INDEX idx_idempotency_expires ON idempotency_records(expires_at);
CREATE INDEX idx_idempotency_business_type ON idempotency_records(business_id, operation_type);

-- SyncConflict: Records synchronization conflicts for admin review
CREATE TABLE "sync_conflicts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    "branch_id" UUID REFERENCES branches(id) ON DELETE SET NULL,
    "operation_id" TEXT,
    "idempotency_key" TEXT,
    "operation_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "conflict_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "local_state" JSONB,
    "server_state" JSONB,
    "error_message" TEXT,
    "resolution_notes" TEXT,
    "resolved_by" UUID REFERENCES users(id) ON DELETE SET NULL,
    "resolved_at" TIMESTAMPTZ,
    "device_id" TEXT,
    "cashier_id" UUID REFERENCES users(id) ON DELETE SET NULL,
    "cashier_name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conflicts_business ON sync_conflicts(business_id);
CREATE INDEX idx_conflicts_branch ON sync_conflicts(branch_id);
CREATE INDEX idx_conflicts_status ON sync_conflicts(status);
CREATE INDEX idx_conflicts_type ON sync_conflicts(conflict_type);
CREATE INDEX idx_conflicts_severity ON sync_conflicts(severity);
CREATE INDEX idx_conflicts_idempotency ON sync_conflicts(idempotency_key);
CREATE INDEX idx_conflicts_business_status ON sync_conflicts(business_id, status);
CREATE INDEX idx_conflicts_business_branch_status ON sync_conflicts(business_id, branch_id, status);
CREATE INDEX idx_conflicts_created ON sync_conflicts(created_at);

-- Add pos.offline.sync permission
INSERT INTO permissions (id, name, module, action, description)
VALUES (
    gen_random_uuid()::text,
    'pos.offline.sync',
    'pos',
    'sync',
    'Process offline sync operations'
) ON CONFLICT (name) DO NOTHING;
