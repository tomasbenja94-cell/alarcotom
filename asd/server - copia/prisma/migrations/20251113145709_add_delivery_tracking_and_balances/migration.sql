/*
  Warnings:

  - A unique constraint covering the columns `[tracking_token]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN "customer_lat" REAL;
ALTER TABLE "orders" ADD COLUMN "customer_lng" REAL;
ALTER TABLE "orders" ADD COLUMN "tracking_token" TEXT;

-- CreateTable
CREATE TABLE "driver_balance_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driver_id" TEXT NOT NULL,
    "order_id" TEXT,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reference" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_balance_transactions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "delivery_persons" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "driver_balance_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_delivery_persons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "total_deliveries" INTEGER NOT NULL DEFAULT 0,
    "last_lat" REAL,
    "last_lng" REAL,
    "last_seen_at" DATETIME,
    "balance" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_delivery_persons" ("created_at", "id", "is_active", "name", "phone", "total_deliveries", "updated_at") SELECT "created_at", "id", "is_active", "name", "phone", "total_deliveries", "updated_at" FROM "delivery_persons";
DROP TABLE "delivery_persons";
ALTER TABLE "new_delivery_persons" RENAME TO "delivery_persons";
CREATE UNIQUE INDEX "delivery_persons_phone_key" ON "delivery_persons"("phone");
CREATE UNIQUE INDEX "delivery_persons_username_key" ON "delivery_persons"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token");
