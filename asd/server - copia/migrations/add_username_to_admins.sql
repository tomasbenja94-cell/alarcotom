-- Migración: Agregar columna username a admins y migrar datos de email
-- Ejecutar este SQL en Supabase SQL Editor

-- 1. Agregar columna username si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admins' AND column_name = 'username'
    ) THEN
        ALTER TABLE admins ADD COLUMN username TEXT;
        RAISE NOTICE '✅ Columna username agregada';
    ELSE
        RAISE NOTICE '⚠️ Columna username ya existe';
    END IF;
END $$;

-- 2. Migrar datos de email a username (si existe columna email)
DO $$
DECLARE
    admin_record RECORD;
    new_username TEXT;
    counter INTEGER;
BEGIN
    -- Verificar si existe columna email
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admins' AND column_name = 'email'
    ) THEN
        -- Migrar cada admin que tenga email pero no username
        FOR admin_record IN 
            SELECT id, email 
            FROM admins 
            WHERE email IS NOT NULL 
            AND (username IS NULL OR username = '')
        LOOP
            -- Generar username desde email (parte antes del @)
            new_username := LOWER(SPLIT_PART(admin_record.email, '@', 1));
            -- Limpiar caracteres especiales
            new_username := REGEXP_REPLACE(new_username, '[^a-z0-9_]', '_', 'g');
            
            -- Verificar si el username ya existe
            counter := 1;
            WHILE EXISTS (SELECT 1 FROM admins WHERE username = new_username AND id != admin_record.id) LOOP
                new_username := new_username || '_' || counter;
                counter := counter + 1;
            END LOOP;
            
            -- Actualizar el admin
            UPDATE admins 
            SET username = new_username 
            WHERE id = admin_record.id;
            
            RAISE NOTICE '✅ Migrado: % → %', admin_record.email, new_username;
        END LOOP;
        
        RAISE NOTICE '✅ Migración de email a username completada';
    ELSE
        RAISE NOTICE '⚠️ No existe columna email, saltando migración';
    END IF;
END $$;

-- 3. Hacer username NOT NULL y UNIQUE después de migrar
DO $$
BEGIN
    -- Primero asegurar que todos los admins tengan username
    UPDATE admins 
    SET username = 'admin_' || SUBSTRING(id::TEXT, 1, 8)
    WHERE username IS NULL OR username = '';
    
    -- Agregar constraint UNIQUE si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'admins_username_key'
    ) THEN
        ALTER TABLE admins ADD CONSTRAINT admins_username_key UNIQUE (username);
        RAISE NOTICE '✅ Constraint UNIQUE agregado a username';
    END IF;
    
    -- Hacer NOT NULL si no lo es
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admins' 
        AND column_name = 'username' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE admins ALTER COLUMN username SET NOT NULL;
        RAISE NOTICE '✅ Columna username ahora es NOT NULL';
    END IF;
END $$;

-- 4. Crear índice si no existe
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

-- Verificar resultado
SELECT 
    id, 
    username, 
    role, 
    store_id,
    is_active
FROM admins
ORDER BY created_at DESC
LIMIT 10;

