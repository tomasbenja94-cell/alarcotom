/*
  Warnings:

  - A unique constraint covering the columns `[current_order_id]` on the table `delivery_persons` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "delivery_persons" ADD COLUMN "current_order_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "delivery_persons_current_order_id_key" ON "delivery_persons"("current_order_id");
