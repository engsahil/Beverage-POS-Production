-- Sale numbers are generated per business. Keep the existing SALE-XXXXXX
-- format while making the database uniqueness boundary match that scope.
DROP INDEX "sales_sale_number_key";
CREATE UNIQUE INDEX "sales_business_id_sale_number_key"
  ON "sales"("business_id", "sale_number");
