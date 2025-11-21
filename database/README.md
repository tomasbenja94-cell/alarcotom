# 🗄️ Configuración de Base de Datos

Este proyecto usa **Supabase** como base de datos PostgreSQL.

## 📋 Pasos para Configurar

### 1. Crear Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Crea una cuenta o inicia sesión
3. Crea un nuevo proyecto
4. Anota la **URL del proyecto** y la **anon key**

### 2. Ejecutar el Schema SQL

1. En el dashboard de Supabase, ve a **SQL Editor**
2. Abre el archivo `database/schema.sql`
3. Copia todo el contenido
4. Pégalo en el SQL Editor de Supabase
5. Ejecuta el script (botón "Run")

Esto creará todas las tablas necesarias:
- `categories` - Categorías de productos
- `products` - Productos del menú
- `product_option_categories` - Categorías de opciones (ej: "Tamaño", "Extras")
- `product_options` - Opciones específicas (ej: "Grande", "Queso extra")
- `orders` - Pedidos
- `order_items` - Items de cada pedido
- `bot_messages` - Mensajes del bot de WhatsApp
- `whatsapp_messages` - Historial de mensajes
- `pending_transfers` - Transferencias pendientes de verificación

### 3. Configurar Variables de Entorno

1. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` y agrega tus credenciales de Supabase:
   ```env
   VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
   ```

3. Para el bot de WhatsApp, también configura:
   ```env
   ADMIN_NUMBERS=5493487207406
   ```

### 4. Configurar Políticas de Seguridad (RLS)

Las políticas básicas ya están en el schema, pero puedes ajustarlas en:
- Supabase Dashboard → Authentication → Policies

**Recomendación para producción:**
- Configurar autenticación adecuada
- Limitar acceso de escritura solo a usuarios autenticados
- Mantener lectura pública para el menú

### 5. Datos Iniciales (Opcional)

Puedes agregar datos de ejemplo ejecutando:

```sql
-- Ejemplo: Insertar una categoría
INSERT INTO categories (name, description, display_order) 
VALUES ('Hamburguesas', 'Deliciosas hamburguesas artesanales', 1);

-- Ejemplo: Insertar un producto
INSERT INTO products (category_id, name, description, price, display_order)
SELECT id, 'Hamburguesa Clásica', 'Carne, lechuga, tomate, cebolla', 2500, 1
FROM categories WHERE name = 'Hamburguesas';
```

## 🔍 Verificar la Configuración

1. En Supabase Dashboard → Table Editor, deberías ver todas las tablas
2. Prueba hacer una consulta desde el frontend
3. Verifica que los datos se guarden correctamente

## 📝 Notas

- El schema incluye índices para mejorar el rendimiento
- Los triggers actualizan automáticamente `updated_at`
- RLS está habilitado pero con políticas permisivas para desarrollo
- Para producción, ajusta las políticas de seguridad según tus necesidades

## 🆘 Problemas Comunes

**Error: "relation does not exist"**
- Verifica que ejecutaste el schema.sql completo
- Revisa que todas las tablas se crearon en Supabase Dashboard

**Error: "permission denied"**
- Revisa las políticas RLS en Supabase Dashboard
- Verifica que las keys en `.env` sean correctas

**Error: "connection refused"**
- Verifica la URL de Supabase en `.env`
- Asegúrate de que el proyecto de Supabase esté activo

