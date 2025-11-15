# 🔧 Configuración de URLs de API

## 📌 Importante: Diferencias entre URLs

Tu proyecto usa **2 tipos de URLs diferentes**:

### 1. 🗄️ **Supabase (Base de Datos)**
- **URL:** `https://fnpzoqjnisgkhgnlwzic.supabase.co`
- **Uso:** Solo para la base de datos
- **Variable:** `VITE_PUBLIC_SUPABASE_URL` o `VITE_SUPABASE_URL`
- **Archivo:** `src/lib/supabase.ts`

### 2. 🚀 **Servidor Backend (API REST)**
- **URL:** Depende de dónde esté desplegado tu servidor backend
- **Uso:** Para todos los endpoints `/api/*` (special-hours, no-stock, checklist, etc.)
- **Variable:** `VITE_API_URL`
- **Archivo:** `src/lib/api.ts`

## ❌ Problema Actual

Los errores 404 que estás viendo:
```
Failed to load resource: the server responded with a status of 404 (Not Found)
:5000/api/system/special-hours
:5000/api/system/no-stock-state
```

**Significado:** El frontend está intentando conectarse a `localhost:5000` pero el servidor backend no está corriendo o no está accesible en esa URL.

## ✅ Soluciones

### Opción 1: Servidor Backend Local (Desarrollo)

Si estás desarrollando localmente:

1. **Inicia el servidor backend:**
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **Crea archivo `.env` en la raíz del proyecto:**
   ```env
   VITE_API_URL=http://localhost:5000/api
   VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_de_supabase
   ```

3. **Reinicia el servidor de desarrollo del frontend:**
   ```bash
   npm run dev
   ```

### Opción 2: Servidor Backend Desplegado (Producción)

Si tu servidor backend está desplegado en un servidor:

1. **Obtén la URL de tu servidor backend** (ejemplo: `https://api.elbuemenu.com` o `https://tu-proyecto.railway.app`)

2. **Crea/Actualiza archivo `.env` en la raíz:**
   ```env
   VITE_API_URL=https://tu-servidor-backend.com/api
   VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_de_supabase
   ```

3. **Recompila el frontend:**
   ```bash
   npm run build
   ```

### Opción 3: Supabase Functions (Si usas Supabase)

Si estás usando Supabase Functions para el backend:

1. **Los endpoints deben estar en:** `supabase/functions/`
2. **La URL sería:** `https://fnpzoqjnisgkhgnlwzic.supabase.co/functions/v1/`
3. **Actualiza `.env`:**
   ```env
   VITE_API_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co/functions/v1
   ```

## 🔍 Cómo Verificar

1. **Verifica que el servidor backend esté corriendo:**
   - Abre: `http://localhost:5000/api/system/special-hours`
   - Debe responder con JSON (no 404)

2. **Verifica las variables de entorno:**
   ```javascript
   console.log('API URL:', import.meta.env.VITE_API_URL);
   console.log('Supabase URL:', import.meta.env.VITE_PUBLIC_SUPABASE_URL);
   ```

3. **Revisa la consola del navegador:**
   - Los errores 404 indican que `VITE_API_URL` no está configurado correctamente
   - O el servidor backend no está accesible en esa URL

## 📝 Nota Importante

**Supabase solo proporciona la base de datos.** Los endpoints como `/api/system/special-hours` son de tu servidor backend Node.js/Express que debe estar corriendo en algún lugar (localmente o desplegado).

Si solo tienes Supabase y no tienes un servidor backend desplegado, necesitas:
1. Desplegar el servidor backend en Railway, Render, Fly.io, etc.
2. O usar Supabase Functions para crear esos endpoints

