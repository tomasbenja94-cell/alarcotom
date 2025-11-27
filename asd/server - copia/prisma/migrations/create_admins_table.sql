-- Crear tabla admins si no existe
-- Ejecutar este SQL en Supabase SQL Editor si la tabla no existe

CREATE TABLE IF NOT EXISTS "admins" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL UNIQUE,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "store_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admins_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS "admins_store_id_idx" ON "admins"("store_id");
CREATE INDEX IF NOT EXISTS "admins_email_idx" ON "admins"("email");

-- Verificar que se creó correctamente
DO $$
BEGIN
    RAISE NOTICE '✅ Tabla admins creada/verificada correctamente';
END $$;

