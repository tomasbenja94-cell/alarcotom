# 🚀 Guía de Hosting para El Buen Menú

## 📋 ¿Qué necesitas?

Tu aplicación tiene **3 componentes** que necesitan hosting:

1. **Frontend (React/Vite)** - Interfaz web
2. **Backend (Node.js/Express)** - API REST
3. **WhatsApp Bot (Baileys)** - Bot de WhatsApp

## 🎯 Opciones de Hosting

### ✅ Opción 1: Hosting Todo-en-Uno (Recomendado para empezar)

#### **Railway.app** ⭐ (MÁS FÁCIL)
- ✅ **GRATIS** durante 1 mes ($5 después)
- ✅ Hosting para Frontend, Backend y Bot
- ✅ Base de datos PostgreSQL incluida
- ✅ Despliegue automático desde GitHub
- ✅ Variables de entorno fáciles de configurar
- ✅ SSL automático
- ✅ **Perfecto para proyectos pequeños/medianos**

**Pasos:**
1. Crear cuenta en [railway.app](https://railway.app)
2. Conectar repositorio de GitHub
3. Crear 3 servicios:
   - Frontend (Vite)
   - Backend (Node.js)
   - WhatsApp Bot (Node.js)
4. Configurar variables de entorno
5. ¡Listo!

#### **Render.com** ⭐ (Alternativa)
- ✅ **GRATIS** (con limitaciones)
- ✅ Hosting para Frontend, Backend y Bot
- ✅ Base de datos PostgreSQL gratuita
- ✅ Despliegue automático desde GitHub
- ✅ SSL automático
- ⚠️ Los servicios gratuitos se "duermen" después de 15 minutos de inactividad (no ideal para el bot)

**Pasos:**
1. Crear cuenta en [render.com](https://render.com)
2. Conectar repositorio de GitHub
3. Crear 3 servicios:
   - Frontend (Static Site)
   - Backend (Web Service)
   - WhatsApp Bot (Web Service)
4. Configurar variables de entorno
5. ¡Listo!

#### **Fly.io** ⭐ (Alternativa)
- ✅ **GRATIS** (con limitaciones)
- ✅ Hosting para Frontend, Backend y Bot
- ✅ Base de datos PostgreSQL
- ✅ Despliegue automático desde GitHub
- ✅ SSL automático
- ✅ Buena para aplicaciones globales

---

### ✅ Opción 2: Hosting Separado (Más flexible)

#### **Frontend:**
- **Vercel** (Recomendado) - Gratis, perfecto para React
- **Netlify** - Gratis, perfecto para React
- **Cloudflare Pages** - Gratis, muy rápido

#### **Backend + Bot:**
- **DigitalOcean** - $5/mes (VPS)
- **Linode** - $5/mes (VPS)
- **AWS EC2** - Variable (más complejo)
- **Google Cloud Run** - Pago por uso

#### **Base de Datos:**
- **Supabase** - Ya lo estás usando (Gratis hasta 500MB)
- **Railway PostgreSQL** - Gratis (500MB)
- **Render PostgreSQL** - Gratis (90 días, luego $7/mes)

---

### ✅ Opción 3: VPS (Más control, más trabajo)

#### **DigitalOcean Droplet** 💰 $5-12/mes
- ✅ Control total
- ✅ Puedes instalar todo en un solo servidor
- ✅ Necesitas configurar Nginx, PM2, SSL, etc.
- ✅ Más trabajo de mantenimiento

#### **Linode** 💰 $5-12/mes
- ✅ Similar a DigitalOcean
- ✅ Buena documentación
- ✅ Soporte 24/7

---

## 🎯 Recomendación según tu caso

### 🟢 **Para empezar (Recomendado):**
**Railway.app** - Todo en un solo lugar, fácil de configurar, $5/mes después del primer mes gratis.

### 🟡 **Para producción (Más robusto):**
**Frontend en Vercel** (Gratis) + **Backend/Bot en Railway** ($5/mes) + **Supabase** (Gratis)

### 🔴 **Para máxima flexibilidad:**
**VPS de DigitalOcean** ($5/mes) - Control total pero más trabajo

---

## 📝 Pasos para desplegar en Railway (Recomendado)

### 1. Preparar el proyecto

Crea estos archivos en la raíz del proyecto:

#### `railway.json` (opcional)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100
  }
}
```

#### `.railwayignore` (opcional)
```
node_modules
.git
.env
*.log
```

### 2. Crear servicios en Railway

#### **Servicio 1: Frontend**
1. Crear nuevo servicio "Frontend"
2. Conectar repositorio de GitHub
3. Configurar:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run preview` (o usar servidor estático)
   - **Root Directory:** `/`

#### **Servicio 2: Backend**
1. Crear nuevo servicio "Backend"
2. Conectar repositorio de GitHub
3. Configurar:
   - **Root Directory:** `/server`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `npm start`
   - **Variables de entorno:**
     ```
     DATABASE_URL=postgresql://...
     PORT=5000
     JWT_SECRET=tu_secret_key
     INTERNAL_API_KEY=tu_api_key
     FRONTEND_URL=https://tu-frontend.railway.app
     BOT_WEBHOOK_URL=https://tu-bot.railway.app
     ```

#### **Servicio 3: WhatsApp Bot**
1. Crear nuevo servicio "WhatsApp Bot"
2. Conectar repositorio de GitHub
3. Configurar:
   - **Root Directory:** `/whatsapp-bot`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`                                                                 
nnpm 
  - **Variables de entorno:**
     ```
     API_URL=https://tu-backend.railway.app/api
     ADMIN_NUMBERS=5493487207406
     BOT_WEBHOOK_URL=https://tu-backend.railway.app
     ```

### 3. Configurar Base de Datos

1. Crear servicio "PostgreSQL" en Railway
2. Obtener `DATABASE_URL` de las variables de entorno
3. Agregar `DATABASE_URL` a los servicios que la necesiten
4. Ejecutar migraciones:
   ```bash
   cd server
   npx prisma migrate deploy
   ```

### 4. Configurar Variables de Entorno

En cada servicio, agregar:
- **Frontend:**
  ```
  VITE_API_URL=https://tu-backend.railway.app/api
  VITE_PUBLIC_SUPABASE_URL=tu_supabase_url
  VITE_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_key
  ```

- **Backend:**
  ```
  DATABASE_URL=postgresql://...
  PORT=5000
  JWT_SECRET=tu_secret_key_aqui
  INTERNAL_API_KEY=tu_api_key_aqui
  FRONTEND_URL=https://tu-frontend.railway.app
  BOT_WEBHOOK_URL=https://tu-bot.railway.app
  CORS_ORIGIN=https://tu-frontend.railway.app
  ```

- **WhatsApp Bot:**
  ```
  API_URL=https://tu-backend.railway.app/api
  ADMIN_NUMBERS=5493487207406
  BOT_WEBHOOK_URL=https://tu-backend.railway.app
  ```

### 5. Desplegar

1. Hacer push a GitHub
2. Railway detectará los cambios automáticamente
3. Esperar a que se complete el despliegue
4. ¡Listo! 🎉

---

## 📝 Pasos para desplegar en Vercel (Frontend) + Railway (Backend/Bot)

### Frontend en Vercel:

1. Crear cuenta en [vercel.com](https://vercel.com)
2. Conectar repositorio de GitHub
3. Configurar:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Variables de entorno:**
     ```
     VITE_API_URL=https://tu-backend.railway.app/api
     VITE_PUBLIC_SUPABASE_URL=tu_supabase_url
     VITE_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_key
     ```
4. Desplegar

### Backend y Bot en Railway:

Seguir los pasos de la sección anterior.

---

## 🔧 Configuración adicional necesaria

### 1. Actualizar CORS en el backend

En `server/index.js`, asegúrate de que CORS permita tu dominio de producción:

```javascript
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://tu-frontend.vercel.app', // Agregar tu dominio de producción
    'https://tu-frontend.railway.app'
  ],
  credentials: true
};
```

### 2. Actualizar variables de entorno

Asegúrate de actualizar todas las URLs en las variables de entorno:
- `FRONTEND_URL` → URL de tu frontend en producción
- `BOT_WEBHOOK_URL` → URL de tu backend en producción
- `API_URL` → URL de tu backend en producción

### 3. Configurar SSL

Railway, Vercel y Render proporcionan SSL automáticamente. No necesitas configurar nada adicional.

### 4. Configurar dominio personalizado (Opcional)

1. Comprar dominio (ej: `elbuenmenu.com`)
2. Configurar DNS:
   - Frontend: CNAME → `tu-frontend.vercel.app`
   - Backend: CNAME → `tu-backend.railway.app`
3. Configurar en Railway/Vercel

---

## 💰 Costos estimados

### Opción 1: Railway (Todo en uno)
- **Gratis:** 1 mes
- **Después:** $5/mes (Backend + Bot) + $0 (Frontend estático)
- **Total:** ~$5/mes

### Opción 2: Vercel + Railway
- **Vercel (Frontend):** Gratis
- **Railway (Backend + Bot):** $5/mes
- **Supabase (Base de datos):** Gratis (hasta 500MB)
- **Total:** ~$5/mes

### Opción 3: VPS (DigitalOcean)
- **Droplet:** $5-12/mes
- **Total:** ~$5-12/mes (más trabajo de mantenimiento)

---

## 🚨 Consideraciones importantes

### 1. WhatsApp Bot
- ⚠️ El bot necesita estar **siempre corriendo** (24/7)
- ⚠️ No puede "dormirse" como los servicios gratuitos de Render
- ✅ Railway y Fly.io mantienen los servicios activos
- ❌ Render gratuito "duerme" después de 15 minutos (no recomendado para el bot)

### 2. Base de datos
- ✅ Supabase es gratuito hasta 500MB
- ✅ Railway PostgreSQL es gratuito hasta 500MB
- ⚠️ Render PostgreSQL es gratuito solo 90 días

### 3. Archivos estáticos (imágenes de comprobantes)
- ⚠️ Necesitas almacenamiento para las imágenes de comprobantes
- ✅ Opciones:
  - **Railway Volumes** (gratis hasta 1GB)
  - **Supabase Storage** (gratis hasta 1GB)
  - **Cloudflare R2** (gratis hasta 10GB)
  - **AWS S3** (pago por uso)

### 4. Variables de entorno
- ✅ No subir `.env` a GitHub
- ✅ Usar variables de entorno del servicio de hosting
- ✅ Configurar todas las variables necesarias

---

## 📚 Recursos útiles

- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)
- [Render Docs](https://render.com/docs)
- [Fly.io Docs](https://fly.io/docs)
- [DigitalOcean Docs](https://www.digitalocean.com/docs)

---

## 🆘 Problemas comunes

### El bot se desconecta
- ✅ Usar Railway o Fly.io (mantienen servicios activos)
- ❌ No usar Render gratuito (se duerme)

### Error de CORS
- ✅ Verificar que `CORS_ORIGIN` incluya tu dominio de producción
- ✅ Verificar que `FRONTEND_URL` esté configurado correctamente

### Error de base de datos
- ✅ Verificar que `DATABASE_URL` esté configurado correctamente
- ✅ Ejecutar migraciones: `npx prisma migrate deploy`

### Error de variables de entorno
- ✅ Verificar que todas las variables estén configuradas
- ✅ Verificar que los nombres de las variables sean correctos

---

## ✅ Checklist antes de desplegar

- [ ] Configurar variables de entorno
- [ ] Actualizar CORS en el backend
- [ ] Actualizar URLs en las variables de entorno
- [ ] Ejecutar migraciones de base de datos
- [ ] Probar el bot localmente
- [ ] Probar el frontend localmente
- [ ] Probar el backend localmente
- [ ] Configurar dominio personalizado (opcional)
- [ ] Configurar SSL (automático en Railway/Vercel)
- [ ] Configurar almacenamiento para imágenes (opcional)

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu aplicación estará en producción y accesible desde cualquier lugar del mundo.

**¿Necesitas ayuda?** Puedo ayudarte a configurar el despliegue paso a paso.

