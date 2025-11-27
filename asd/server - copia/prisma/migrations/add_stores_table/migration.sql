-- CreateTable: stores
CREATE TABLE IF NOT EXISTS "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "image_url" TEXT,
    "description" TEXT,
    "hours" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- Add store_id column to categories if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'categories' AND column_name = 'store_id') THEN
        ALTER TABLE "categories" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "categories_store_id_idx" ON "categories"("store_id");
        ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to products if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'store_id') THEN
        ALTER TABLE "products" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "products_store_id_idx" ON "products"("store_id");
        ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to orders if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'store_id') THEN
        ALTER TABLE "orders" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "orders_store_id_idx" ON "orders"("store_id");
        ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to pending_transfers if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pending_transfers' AND column_name = 'store_id') THEN
        ALTER TABLE "pending_transfers" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "pending_transfers_store_id_idx" ON "pending_transfers"("store_id");
        ALTER TABLE "pending_transfers" ADD CONSTRAINT "pending_transfers_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to admins if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'store_id') THEN
        ALTER TABLE "admins" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "admins_store_id_idx" ON "admins"("store_id");
        ALTER TABLE "admins" ADD CONSTRAINT "admins_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to bot_messages if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bot_messages' AND column_name = 'store_id') THEN
        ALTER TABLE "bot_messages" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "bot_messages_store_id_idx" ON "bot_messages"("store_id");
        ALTER TABLE "bot_messages" ADD CONSTRAINT "bot_messages_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to system_states if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_states' AND column_name = 'store_id') THEN
        ALTER TABLE "system_states" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "system_states_store_id_idx" ON "system_states"("store_id");
        ALTER TABLE "system_states" ADD CONSTRAINT "system_states_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to daily_checklist_tasks if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'daily_checklist_tasks' AND column_name = 'store_id') THEN
        ALTER TABLE "daily_checklist_tasks" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "daily_checklist_tasks_store_id_idx" ON "daily_checklist_tasks"("store_id");
        ALTER TABLE "daily_checklist_tasks" ADD CONSTRAINT "daily_checklist_tasks_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to system_notifications if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'system_notifications' AND column_name = 'store_id') THEN
        ALTER TABLE "system_notifications" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "system_notifications_store_id_idx" ON "system_notifications"("store_id");
        ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to ai_recommendations if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ai_recommendations' AND column_name = 'store_id') THEN
        ALTER TABLE "ai_recommendations" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "ai_recommendations_store_id_idx" ON "ai_recommendations"("store_id");
        ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to daily_closures if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'daily_closures' AND column_name = 'store_id') THEN
        ALTER TABLE "daily_closures" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "daily_closures_store_id_idx" ON "daily_closures"("store_id");
        ALTER TABLE "daily_closures" ADD CONSTRAINT "daily_closures_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to peak_demand_modes if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'peak_demand_modes' AND column_name = 'store_id') THEN
        ALTER TABLE "peak_demand_modes" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "peak_demand_modes_store_id_idx" ON "peak_demand_modes"("store_id");
        ALTER TABLE "peak_demand_modes" ADD CONSTRAINT "peak_demand_modes_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to product_labels if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'product_labels' AND column_name = 'store_id') THEN
        ALTER TABLE "product_labels" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "product_labels_store_id_idx" ON "product_labels"("store_id");
        ALTER TABLE "product_labels" ADD CONSTRAINT "product_labels_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to business_expenses if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'business_expenses' AND column_name = 'store_id') THEN
        ALTER TABLE "business_expenses" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "business_expenses_store_id_idx" ON "business_expenses"("store_id");
        ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to daily_cost_analyses if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'daily_cost_analyses' AND column_name = 'store_id') THEN
        ALTER TABLE "daily_cost_analyses" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "daily_cost_analyses_store_id_idx" ON "daily_cost_analyses"("store_id");
        ALTER TABLE "daily_cost_analyses" ADD CONSTRAINT "daily_cost_analyses_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add store_id column to special_hours if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'special_hours' AND column_name = 'store_id') THEN
        ALTER TABLE "special_hours" ADD COLUMN "store_id" TEXT;
        CREATE INDEX IF NOT EXISTS "special_hours_store_id_idx" ON "special_hours"("store_id");
        ALTER TABLE "special_hours" ADD CONSTRAINT "special_hours_store_id_fkey" 
            FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

