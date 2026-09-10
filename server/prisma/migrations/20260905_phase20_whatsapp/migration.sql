-- Phase 20: WhatsApp Integration
-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "admin_phone_number" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "provider_account_id" TEXT,
    "provider_phone_number_id" TEXT,
    "webhook_verify_token" TEXT,
    "last_test_sent_at" TIMESTAMP(3),
    "last_test_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "message_type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message_content" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "idempotency_key" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_business_id_key" ON "whatsapp_configs"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_configs_business_id_idx" ON "whatsapp_configs"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_idx" ON "whatsapp_messages"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_shift_id_idx" ON "whatsapp_messages"("shift_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_message_type_idx" ON "whatsapp_messages"("message_type");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_idempotency_key_key" ON "whatsapp_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "whatsapp_messages_idempotency_key_idx" ON "whatsapp_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_shift_id_idx" ON "whatsapp_messages"("business_id", "shift_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_status_idx" ON "whatsapp_messages"("business_id", "status");

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
