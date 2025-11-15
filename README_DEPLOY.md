# 🚀 Guía de Despliegue - El Buen Menú

## 📋 Desplegar Frontend (Web)

### Opción 1: Vercel (Recomendado - Gratis)

1. **Crear cuenta en Vercel:**
   - Ve a [vercel.com](https://vercel.com)
   - Inicia sesión con GitHub

2. **Conectar repositorio:**
   - Click en "Add New Project"
   - Selecciona tu repositorio: `tomasbenja94-cell/asdasd`
   - Framework: **Vite** (se detecta automáticamente)

3. **Configurar variables de entorno:**
   En la sección "Environment Variables", agrega:
   ```
   VITE_API_URL=https://elbuenmenu.store/api
   VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY
   ```

4. **Configurar Build:**
   - Build Command: `npm run build`
   - Output Directory: `out`
   - Install Command: `npm install`

5. **Desplegar:**
   - Click en "Deploy"
   - Espera a que termine el build
   - ¡Listo! Tu web estará en `tu-proyecto.vercel.app`

6. **Configurar dominio personalizado (opcional):**
   - Ve a Settings → Domains
   - Agrega: `elbuenmenu.store`
   - Configura los DNS según las instrucciones de Vercel

---

### Opción 2: Netlify (Alternativa - Gratis)

1. **Crear cuenta en Netlify:**
   - Ve a [netlify.com](https://netlify.com)
   - Inicia sesión con GitHub

2. **Conectar repositorio:**
   - Click en "Add new site" → "Import an existing project"
   - Selecciona tu repositorio de GitHub

3. **Configurar Build:**
   - Build command: `npm run build`
   - Publish directory: `out`
   - El archivo `netlify.toml` ya está configurado

4. **Configurar variables de entorno:**
   En Site settings → Environment variables:
   ```
   VITE_API_URL=https://elbuenmenu.store/api
   VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY
   ```

5. **Desplegar:**
   - Click en "Deploy site"
   - ¡Listo! Tu web estará en `tu-proyecto.netlify.app`

---

### Opción 3: Cloudflare Pages (Alternativa - Gratis)

1. **Crear cuenta en Cloudflare:**
   - Ve a [cloudflare.com](https://cloudflare.com)
   - Inicia sesión

2. **Conectar repositorio:**
   - Ve a Pages → Create a project
   - Conecta tu repositorio de GitHub

3. **Configurar Build:**
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `out`

4. **Configurar variables de entorno:**
   En Settings → Environment variables:
   ```
   VITE_API_URL=https://elbuenmenu.store/api
   VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY
   ```

5. **Desplegar:**
   - Click en "Save and Deploy"
   - ¡Listo!

---

## ⚙️ Configuración del Backend

Asegúrate de que el backend tenga configurado CORS para permitir tu dominio:

En `server/index.js` o en el middleware de CORS, debe incluir:
```javascript
origin: [
  'https://elbuenmenu.store',
  'https://tu-proyecto.vercel.app', // o tu dominio de Netlify/Cloudflare
  'http://localhost:5173' // para desarrollo local
]
```

---

## ✅ Checklist antes de desplegar

- [ ] Variables de entorno configuradas en el servicio de hosting
- [ ] CORS del backend actualizado con el dominio de producción
- [ ] Backend desplegado y funcionando en `elbuenmenu.store`
- [ ] Bot de WhatsApp configurado y funcionando
- [ ] Probar que el frontend puede conectarse al backend
- [ ] Probar que el frontend puede conectarse a Supabase

---

## 🔗 URLs de Producción

- **Frontend:** `https://elbuenmenu.store` (o tu dominio de Vercel/Netlify)
- **Backend:** `https://elbuenmenu.store/api` (o tu URL del backend)
- **Bot WhatsApp:** Configurado en la VPS

---

## 🆘 Problemas comunes

### Error de CORS
- Verificar que el backend permita tu dominio en CORS
- Verificar que `VITE_API_URL` esté configurado correctamente

### Error 404 en rutas
- Verificar que el archivo `vercel.json` o `netlify.toml` tenga la configuración de rewrites

### Variables de entorno no funcionan
- Verificar que las variables empiecen con `VITE_`
- Verificar que se hayan configurado en el panel del hosting
- Hacer un nuevo deploy después de agregar variables

---

¡Listo! Tu frontend estará en producción. 🎉

