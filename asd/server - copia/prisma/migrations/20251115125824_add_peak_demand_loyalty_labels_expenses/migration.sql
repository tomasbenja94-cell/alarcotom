-- CreateTable
CREATE TABLE "peak_demand_modes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "estimated_time_minutes" INTEGER NOT NULL DEFAULT 20,
    "max_orders_per_hour" INTEGER,
    "price_multiplier" REAL NOT NULL DEFAULT 1.0,
    "disabled_product_ids" TEXT,
    "activated_at" DATETIME,
    "deactivated_at" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "customer_loyalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'regular',
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" REAL NOT NULL DEFAULT 0,
    "last_order_date" DATETIME,
    "favorite_products" TEXT,
    "discount_percentage" REAL NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "product_labels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "labels" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "business_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "supplier_id" TEXT,
    "notes" TEXT,
    "receipt_url" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "daily_cost_analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysis_date" DATETIME NOT NULL,
    "total_sales" REAL NOT NULL DEFAULT 0,
    "total_expenses" REAL NOT NULL DEFAULT 0,
    "ingredient_cost" REAL NOT NULL DEFAULT 0,
    "labor_cost" REAL NOT NULL DEFAULT 0,
    "waste_cost" REAL NOT NULL DEFAULT 0,
    "total_cost" REAL NOT NULL DEFAULT 0,
    "net_profit" REAL NOT NULL DEFAULT 0,
    "profitability" REAL NOT NULL DEFAULT 0,
    "hours_worked" REAL NOT NULL DEFAULT 0,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "average_ticket" REAL NOT NULL DEFAULT 0,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_customer_id_key" ON "customer_loyalty"("customer_id");

-- CreateIndex
CREATE INDEX "customer_loyalty_customer_id_idx" ON "customer_loyalty"("customer_id");

-- CreateIndex
CREATE INDEX "customer_loyalty_tier_idx" ON "customer_loyalty"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "product_labels_product_id_key" ON "product_labels"("product_id");

-- CreateIndex
CREATE INDEX "product_labels_product_id_idx" ON "product_labels"("product_id");

-- CreateIndex
CREATE INDEX "business_expenses_date_idx" ON "business_expenses"("date");

-- CreateIndex
CREATE INDEX "business_expenses_category_idx" ON "business_expenses"("category");

-- CreateIndex
CREATE UNIQUE INDEX "daily_cost_analyses_analysis_date_key" ON "daily_cost_analyses"("analysis_date");

-- CreateIndex
CREATE INDEX "daily_cost_analyses_analysis_date_idx" ON "daily_cost_analyses"("analysis_date");
