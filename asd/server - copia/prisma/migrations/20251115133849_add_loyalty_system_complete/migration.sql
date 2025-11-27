/*
  Warnings:

  - You are about to drop the column `points` on the `customer_loyalty` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "points_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "order_id" TEXT,
    "referral_id" TEXT,
    "promo_code_id" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "points_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_loyalty" ("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "points_history_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrer_id" TEXT NOT NULL,
    "referred_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validated_at" DATETIME,
    "validation_order_id" TEXT,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "customer_loyalty" ("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "description" TEXT,
    "product_id" TEXT,
    "level_restriction" TEXT,
    "max_total_uses" INTEGER,
    "max_uses_per_customer" INTEGER NOT NULL DEFAULT 1,
    "total_uses" INTEGER NOT NULL DEFAULT 0,
    "valid_from" DATETIME NOT NULL,
    "valid_until" DATETIME NOT NULL,
    "valid_hours" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "promo_code_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promo_code_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "redeemed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_code_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "promo_code_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_loyalty" ("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loyalty_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "pending_referrals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referred_id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "visited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customer_loyalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" REAL NOT NULL DEFAULT 0,
    "last_order_date" DATETIME,
    "favorite_products" TEXT,
    "discount_percentage" REAL NOT NULL DEFAULT 0,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "referred_by" TEXT,
    "total_referrals" INTEGER NOT NULL DEFAULT 0,
    "birthday" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_customer_loyalty" ("created_at", "customer_id", "discount_percentage", "favorite_products", "id", "last_order_date", "priority", "tier", "total_orders", "total_spent", "updated_at") SELECT "created_at", "customer_id", "discount_percentage", "favorite_products", "id", "last_order_date", "priority", "tier", "total_orders", "total_spent", "updated_at" FROM "customer_loyalty";
DROP TABLE "customer_loyalty";
ALTER TABLE "new_customer_loyalty" RENAME TO "customer_loyalty";
CREATE UNIQUE INDEX "customer_loyalty_customer_id_key" ON "customer_loyalty"("customer_id");
CREATE INDEX "customer_loyalty_customer_id_idx" ON "customer_loyalty"("customer_id");
CREATE INDEX "customer_loyalty_tier_idx" ON "customer_loyalty"("tier");
CREATE INDEX "customer_loyalty_total_points_idx" ON "customer_loyalty"("total_points");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "points_history_customer_id_idx" ON "points_history"("customer_id");

-- CreateIndex
CREATE INDEX "points_history_created_at_idx" ON "points_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_id_key" ON "referrals"("referred_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_validation_order_id_key" ON "referrals"("validation_order_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_referred_id_idx" ON "referrals"("referred_id");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes"("is_active");

-- CreateIndex
CREATE INDEX "promo_code_redemptions_promo_code_id_idx" ON "promo_code_redemptions"("promo_code_id");

-- CreateIndex
CREATE INDEX "promo_code_redemptions_customer_id_idx" ON "promo_code_redemptions"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_redemptions_promo_code_id_customer_id_order_id_key" ON "promo_code_redemptions"("promo_code_id", "customer_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_config_key_key" ON "loyalty_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pending_referrals_referred_id_key" ON "pending_referrals"("referred_id");

-- CreateIndex
CREATE INDEX "pending_referrals_referred_id_idx" ON "pending_referrals"("referred_id");

-- CreateIndex
CREATE INDEX "pending_referrals_referrer_id_idx" ON "pending_referrals"("referrer_id");
