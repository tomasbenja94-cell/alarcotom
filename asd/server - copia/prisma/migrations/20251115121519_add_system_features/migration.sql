-- CreateTable
CREATE TABLE "system_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emergency_mode" BOOLEAN NOT NULL DEFAULT false,
    "no_stock_mode" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" DATETIME,
    "deactivated_at" DATETIME,
    "activated_by" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "daily_checklist_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task_date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" DATETIME,
    "assigned_to" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "system_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" DATETIME,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT,
    "recommendation" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "day_generated" DATETIME NOT NULL,
    "is_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "daily_closures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "closure_date" DATETIME NOT NULL,
    "total_sales" REAL NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "average_ticket" REAL NOT NULL DEFAULT 0,
    "summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "daily_checklist_tasks_task_date_idx" ON "daily_checklist_tasks"("task_date");

-- CreateIndex
CREATE INDEX "system_notifications_is_read_idx" ON "system_notifications"("is_read");

-- CreateIndex
CREATE INDEX "system_notifications_type_idx" ON "system_notifications"("type");

-- CreateIndex
CREATE INDEX "system_notifications_created_at_idx" ON "system_notifications"("created_at");

-- CreateIndex
CREATE INDEX "ai_recommendations_day_generated_idx" ON "ai_recommendations"("day_generated");

-- CreateIndex
CREATE INDEX "ai_recommendations_type_idx" ON "ai_recommendations"("type");

-- CreateIndex
CREATE INDEX "ai_recommendations_is_acknowledged_idx" ON "ai_recommendations"("is_acknowledged");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closures_closure_date_key" ON "daily_closures"("closure_date");

-- CreateIndex
CREATE INDEX "daily_closures_closure_date_idx" ON "daily_closures"("closure_date");
