-- Phase 21: Import/Export Data Management

-- Import operations tracking
CREATE TABLE "import_operations" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "mime_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "import_mode" TEXT NOT NULL DEFAULT 'CREATE_ONLY',
  "total_rows" INTEGER,
  "valid_rows" INTEGER,
  "invalid_rows" INTEGER,
  "created_count" INTEGER,
  "updated_count" INTEGER,
  "skipped_count" INTEGER,
  "failed_count" INTEGER,
  "error_summary" JSONB,
  "idempotency_key" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "import_operations_pkey" PRIMARY KEY ("id")
);

-- Export operations tracking
CREATE TABLE "export_operations" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_format" TEXT NOT NULL DEFAULT 'CSV',
  "filters" JSONB,
  "record_count" INTEGER,
  "file_size" INTEGER,
  "file_path" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "export_operations_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "import_operations_business_id_idx" ON "import_operations"("business_id");
CREATE INDEX "import_operations_user_id_idx" ON "import_operations"("user_id");
CREATE INDEX "import_operations_status_idx" ON "import_operations"("status");
CREATE INDEX "import_operations_entity_type_idx" ON "import_operations"("entity_type");
CREATE INDEX "import_operations_idempotency_key_idx" ON "import_operations"("idempotency_key");
CREATE UNIQUE INDEX "import_operations_idempotency_key_business_id_key" ON "import_operations"("idempotency_key", "business_id");

CREATE INDEX "export_operations_business_id_idx" ON "export_operations"("business_id");
CREATE INDEX "export_operations_user_id_idx" ON "export_operations"("user_id");
CREATE INDEX "export_operations_status_idx" ON "export_operations"("status");
CREATE INDEX "export_operations_entity_type_idx" ON "export_operations"("entity_type");

-- Foreign keys
ALTER TABLE "import_operations" ADD CONSTRAINT "import_operations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_operations" ADD CONSTRAINT "import_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "export_operations" ADD CONSTRAINT "export_operations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "export_operations" ADD CONSTRAINT "export_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
