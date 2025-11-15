# 📋 Instrucciones para Crear las Tablas en Supabase

## Paso 1: Acceder al SQL Editor de Supabase

1. Ve a [supabase.com](https://supabase.com) e inicia sesión
2. Selecciona tu proyecto (o créalo si no existe)
3. En el menú lateral, ve a **SQL Editor** (o **Editor SQL**)

## Paso 2: Ejecutar el Schema SQL

1. Haz clic en **New Query** (Nueva Consulta)
2. Abre el archivo `database/schema_completo.sql` desde tu proyecto
3. **Copia todo el contenido** del archivo
4. **Pega el contenido** en el editor SQL de Supabase
5. Haz clic en **Run** (Ejecutar) o presiona `Ctrl+Enter` (o `Cmd+Enter` en Mac)

## Paso 3: Verificar que las Tablas se Crearon

1. Ve a **Table Editor** (Editor de Tablas) en el menú lateral
2. Deberías ver todas estas tablas:
   - ✅ categories
   - ✅ products
   - ✅ product_option_categories
   - ✅ product_options
   - ✅ orders
   - ✅ order_items
   - ✅ customers
   - ✅ delivery_persons
   - ✅ driver_sessions
   - ✅ driver_balance_transactions
   - ✅ delivery_code_attempts
   - ✅ admins
   - ✅ refresh_tokens
   - ✅ audit_logs
   - ✅ bot_messages
   - ✅ whatsapp_messages
   - ✅ pending_transfers

## Paso 4: Configurar Variables de Entorno (si no lo has hecho)

Asegúrate de tener un archivo `.env` en la raíz del proyecto con:

```env
VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

## Paso 5: Reiniciar el Servidor de Vite

Después de crear las tablas:

1. Detén el servidor de Vite (si está corriendo)
2. Reinícialo con: `npm run dev`
3. Recarga el navegador

## ✅ Verificación Final

1. Abre el panel de administración: `http://localhost:5173/admin`
2. Intenta crear una categoría o producto
3. Deberías poder guardar sin errores

## 🔍 Si Hay Errores

### Error: "relation already exists"
- Las tablas ya existen. Puedes ignorar estos errores o eliminar las tablas existentes primero.

### Error: "permission denied"
- Verifica que estás usando la clave **anon key** correcta
- Verifica las políticas RLS en Supabase Dashboard → Authentication → Policies

### Error: "column does not exist"
- Asegúrate de ejecutar el SQL completo desde `schema_completo.sql`
- Algunas columnas pueden tener nombres diferentes en tu base de datos actual

## 📝 Notas Importantes

- El schema incluye columnas de compatibilidad (`order_index`, `display_order`) para funcionar con ambos sistemas
- Las políticas RLS están configuradas para permitir lectura pública y inserción de pedidos
- Para operaciones de escritura (UPDATE, DELETE), necesitarás configurar autenticación adicional

