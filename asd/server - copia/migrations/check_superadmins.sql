-- Consulta para ver todos los superadmins activos en Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Ver todos los superadmins activos
SELECT 
    id,
    username,
    role,
    store_id,
    is_active,
    created_at,
    updated_at
FROM admins
WHERE role = 'super_admin'
  AND is_active = true
ORDER BY created_at DESC;

-- Ver todos los superadmins (activos e inactivos)
SELECT 
    id,
    username,
    role,
    store_id,
    is_active,
    created_at,
    updated_at
FROM admins
WHERE role = 'super_admin'
ORDER BY is_active DESC, created_at DESC;

-- Ver todos los admins con sus roles (para verificar)
SELECT 
    id,
    username,
    role,
    store_id,
    is_active,
    created_at
FROM admins
ORDER BY role, is_active DESC, created_at DESC;

-- Contar superadmins activos
SELECT 
    COUNT(*) as total_superadmins_activos
FROM admins
WHERE role = 'super_admin'
  AND is_active = true;

