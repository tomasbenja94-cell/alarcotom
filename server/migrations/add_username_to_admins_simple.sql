-- Migración simplificada: Agregar columna username a admins
-- Ejecutar este SQL en Supabase SQL Editor o usar run-username-migration-simple.js

-- 1. Agregar columna username si no existe
ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Migrar datos de email a username (si existe columna email)
-- Primero verificar si existe columna email
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admins' AND column_name = 'email'
    ) THEN
        -- Migrar email a username
        UPDATE admins 
        SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_]', '_', 'g'))
        WHERE email IS NOT NULL 
        AND (username IS NULL OR username = '');
    END IF;
END $$;

-- 3. Generar username para admins que no tienen ni email ni username
UPDATE admins 
SET username = 'admin_' || SUBSTRING(id::TEXT, 1, 8)
WHERE username IS NULL OR username = '';

-- 4. Agregar constraint UNIQUE si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'admins_username_key'
    ) THEN
        ALTER TABLE admins ADD CONSTRAINT admins_username_key UNIQUE (username);
    END IF;
END $$;

-- 5. Hacer username NOT NULL
ALTER TABLE admins ALTER COLUMN username SET NOT NULL;

-- 6. Crear índice si no existe
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

