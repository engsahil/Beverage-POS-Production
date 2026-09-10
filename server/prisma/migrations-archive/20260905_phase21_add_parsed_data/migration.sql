-- Add parsedData column to import_operations
ALTER TABLE "import_operations" ADD COLUMN "parsed_data" JSONB;

-- Add index for faster queries
CREATE INDEX "import_operations_status_created_at_idx" ON "import_operations"("status", "created_at" DESC);
