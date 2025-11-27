-- SQL FINAL para crear la tabla ingredients
-- PostgreSQL usa TIMESTAMP, no DATETIME
-- Ejecuta esto en Supabase SQL Editor

-- Eliminar la tabla si existe (CUIDADO: esto borrará los datos si hay alguno)
DROP TABLE IF EXISTS "ingredients";

-- Crear la tabla con TIMESTAMP (tipo correcto para PostgreSQL)
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

