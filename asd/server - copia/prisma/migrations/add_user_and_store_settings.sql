-- Migración: Agregar modelos User y StoreSettings
-- Ejecutar este SQL directamente en Supabase SQL Editor si Prisma Migrate no funciona

-- ============================================
-- 1. Crear tabla "users"
-- ============================================
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "provider" TEXT,
    "provider_id" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para users
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_provider_provider_id_idx" ON "users"("provider", "provider_id");

-- ============================================
-- 2. Crear tabla "store_settings"
-- ============================================
CREATE TABLE IF NOT EXISTS "store_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "store_id" TEXT NOT NULL UNIQUE,
    "address" TEXT,
    "hours" TEXT,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "cash_enabled" BOOLEAN NOT NULL DEFAULT true,
    "transfer_enabled" BOOLEAN NOT NULL DEFAULT true,
    "transfer_alias" TEXT,
    "transfer_cvu" TEXT,
    "transfer_titular" TEXT,
    "mercado_pago_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mercado_pago_token" TEXT,
    "mercado_pago_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================
-- 3. Agregar columna "user_id" a tabla "orders"
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "user_id" TEXT;
    END IF;
END $$;

-- Agregar foreign key constraint para user_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_user_id_fkey'
    ) THEN
        ALTER TABLE "orders" 
        ADD CONSTRAINT "orders_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Índice para user_id en orders
CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders"("user_id");

-- ============================================
-- 4. Verificar que todo se creó correctamente
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migración completada';
    RAISE NOTICE 'Tablas creadas: users, store_settings';
    RAISE NOTICE 'Columna agregada: orders.user_id';
END $$;

