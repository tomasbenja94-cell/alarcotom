-- SQL para corregir la tabla ingredients y que sea compatible con Prisma
-- Ejecuta esto en Supabase SQL Editor

-- Eliminar la tabla si existe (CUIDADO: esto borrará los datos)
DROP TABLE IF EXISTS ingredients;

-- Crear la tabla con el formato correcto que Prisma espera
-- PostgreSQL usa TIMESTAMP, no DATETIME
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "purchase_price" REAL NOT NULL,
    "current_stock" REAL NOT NULL DEFAULT 0,
    "min_stock" REAL NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL
);

