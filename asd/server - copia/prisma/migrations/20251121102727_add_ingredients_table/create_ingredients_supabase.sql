-- SQL para ejecutar directamente en Supabase SQL Editor
-- Este formato usa UUID nativo de PostgreSQL (más estándar)

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

