-- Migración: Eliminar columna email y asegurar que username existe
-- Ejecutar este SQL en Supabase SQL Editor o usar el script Node.js

-- 1. Verificar y agregar columna username si no existe
ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Migrar datos de email a username si existe columna email
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admins' AND column_name = 'email'
    ) THEN
        -- Migrar email a username para registros que no tienen username
        UPDATE admins 
        SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-z0-9_]', '_', 'g'))
        WHERE email IS NOT NULL 
        AND (username IS NULL OR username = '');
        
        -- Generar username para admins que no tienen ni email ni username
        UPDATE admins 
        SET username = 'admin_' || SUBSTRING(id::TEXT, 1, 8)
        WHERE username IS NULL OR username = '';
    END IF;
END $$;

-- 3. Hacer username NOT NULL y UNIQUE
DO $$
BEGIN
    -- Asegurar que todos los admins tengan username
    UPDATE admins 
    SET username = 'admin_' || SUBSTRING(id::TEXT, 1, 8)
    WHERE username IS NULL OR username = '';
    
    -- Agregar constraint UNIQUE si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'admins_username_key'
    ) THEN
        ALTER TABLE admins ADD CONSTRAINT admins_username_key UNIQUE (username);
    END IF;
    
    -- Hacer username NOT NULL
    ALTER TABLE admins ALTER COLUMN username SET NOT NULL;
END $$;

-- 4. Eliminar constraint NOT NULL de email si existe
DO $$
BEGIN
    -- Hacer email nullable primero
    ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- Si no existe la columna o no tiene NOT NULL, ignorar
        NULL;
END $$;

-- 5. Eliminar la columna email completamente (opcional, comentado por seguridad)
-- ALTER TABLE admins DROP COLUMN IF EXISTS email;

-- 6. Crear índice en username si no existe
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

-- Verificar resultado
SELECT 
    id, 
    username, 
    email,
    role, 
    store_id,
    is_active
FROM admins
ORDER BY created_at DESC
LIMIT 10;

