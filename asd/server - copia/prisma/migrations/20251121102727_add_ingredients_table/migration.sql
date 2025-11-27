-- CreateTable
-- Versión compatible con Prisma (usa TEXT para id)
CREATE TABLE IF NOT EXISTS "ingredients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "purchase_price" REAL NOT NULL,
    "current_stock" REAL NOT NULL DEFAULT 0,
    "min_stock" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- Alternativa: Si prefieres usar UUID nativo de PostgreSQL (más estándar)
-- Ejecuta esta versión en Supabase SQL Editor si no usas Prisma para generar IDs:
/*
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'unidad', 'litro', 'g')),
    purchase_price DECIMAL(10, 2) NOT NULL,
    current_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    min_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
*/

