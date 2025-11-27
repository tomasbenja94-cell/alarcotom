-- AlterTable
ALTER TABLE "orders" ADD COLUMN "unique_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "orders_unique_code_key" ON "orders"("unique_code");

