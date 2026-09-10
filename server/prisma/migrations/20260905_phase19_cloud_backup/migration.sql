-- Phase 19: Cloud Backup & Storage
-- CreateIndex and CreateTable for backup system

-- CreateTable: cloud_backups
CREATE TABLE "cloud_backups" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "backup_number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "file_path" TEXT,
    "file_size" BIGINT,
    "checksum" TEXT,
    "metadata" JSONB,
    "error_message" TEXT,
    "created_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "restored_at" TIMESTAMP(3),
    "restored_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cloud_storage_quotas
CREATE TABLE "cloud_storage_quotas" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "quota_bytes" BIGINT NOT NULL DEFAULT 1073741824,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_end" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_storage_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_backups_backup_number_key" ON "cloud_backups"("backup_number");
CREATE INDEX "cloud_backups_business_id_idx" ON "cloud_backups"("business_id");
CREATE INDEX "cloud_backups_status_idx" ON "cloud_backups"("status");
CREATE INDEX "cloud_backups_type_idx" ON "cloud_backups"("type");
CREATE INDEX "cloud_backups_created_at_idx" ON "cloud_backups"("created_at");
CREATE INDEX "cloud_backups_business_id_status_idx" ON "cloud_backups"("business_id", "status");
CREATE INDEX "cloud_backups_business_id_created_at_idx" ON "cloud_backups"("business_id", "created_at");

CREATE UNIQUE INDEX "cloud_storage_quotas_business_id_key" ON "cloud_storage_quotas"("business_id");
CREATE INDEX "cloud_storage_quotas_business_id_idx" ON "cloud_storage_quotas"("business_id");

-- AddForeignKey
ALTER TABLE "cloud_backups" ADD CONSTRAINT "cloud_backups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cloud_backups" ADD CONSTRAINT "cloud_backups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cloud_backups" ADD CONSTRAINT "cloud_backups_restored_by_fkey" FOREIGN KEY ("restored_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cloud_storage_quotas" ADD CONSTRAINT "cloud_storage_quotas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
