# 🚀 Guía Rápida de Despliegue

## 📋 Resumen

**SÍ, necesitas un servicio de hosting**, pero hay opciones **GRATIS** para empezar.

Tu aplicación tiene 3 componentes:
1. **Frontend** (React) - Puede ir en Vercel/Netlify (GRATIS)
2. **Backend** (Node.js) - Necesita estar siempre corriendo
3. **WhatsApp Bot** (Node.js) - Necesita estar siempre corriendo

## 🎯 Opción Recomendada: Railway.app

### ✅ Ventajas:
- **GRATIS** durante 1 mes
- **$5/mes** después (muy económico)
- Todo en un solo lugar (Frontend + Backend + Bot)
- Despliegue automático desde GitHub
- SSL automático
- Base de datos PostgreSQL incluida
- **Perfecto para proyectos pequeños/medianos**

### 📝 Pasos Rápidos:

1. **Crear cuenta en Railway:**
   - Ve a [railway.app](https://railway.app)
   - Crea cuenta con GitHub

2. **Crear 3 servicios:**
   - **Frontend:** Servicio estático (React)
   - **Backend:** Servicio Node.js (puerto 5000)
   - **WhatsApp Bot:** Servicio Node.js

3. **Configurar variables de entorno:**
   - Ver sección "Variables de Entorno" más abajo

4. **Desplegar:**
   - Conectar repositorio de GitHub
   - Railway detectará automáticamente los cambios
   - ¡Listo! 🎉

## 🔧 Configuración Necesaria

### Variables de Entorno para Backend:

```env
# Base de datos
DATABASE_URL=postgresql://usuario:password@host:5432/database

# Servidor
PORT=5000
NODE_ENV=production

# Seguridad
JWT_SECRET=tu_secret_key_muy_seguro_aqui
INTERNAL_API_KEY=tu_api_key_segura_aqui

# URLs
FRONTEND_URL=https://tu-frontend.railway.app
BOT_WEBHOOK_URL=https://tu-bot.railway.app
CORS_ORIGIN=https://tu-frontend.railway.app

# Supabase (si lo usas)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
```

### Variables de Entorno para Frontend:

```env
VITE_API_URL=https://tu-backend.railway.app/api
VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### Variables de Entorno para WhatsApp Bot:

```env
API_URL=https://tu-backend.railway.app/api
ADMIN_NUMBERS=5493487207406
BOT_WEBHOOK_URL=https://tu-backend.railway.app
```

## 💰 Costos

### Opción 1: Railway (Todo en uno)
- **Gratis:** 1 mes
- **Después:** $5/mes
- **Total:** ~$5/mes

### Opción 2: Vercel (Frontend) + Railway (Backend/Bot)
- **Vercel:** Gratis
- **Railway:** $5/mes
- **Total:** ~$5/mes

### Opción 3: VPS (DigitalOcean)
- **Droplet:** $5-12/mes
- **Total:** ~$5-12/mes (más trabajo)

## ⚠️ Consideraciones Importantes

### 1. WhatsApp Bot
- ⚠️ El bot necesita estar **siempre corriendo** (24/7)
- ✅ Railway mantiene los servicios activos
- ❌ Render gratuito "duerme" después de 15 minutos (no recomendado)

### 2. Base de Datos
- ✅ Supabase es gratuito hasta 500MB
- ✅ Railway PostgreSQL es gratuito hasta 500MB
- ⚠️ Render PostgreSQL es gratuito solo 90 días

### 3. Archivos Estáticos
- ✅ Usar Railway Volumes (gratis hasta 1GB)
- ✅ O Supabase Storage (gratis hasta 1GB)
- ✅ O Cloudflare R2 (gratis hasta 10GB)

## 🚀 Pasos Detallados

Ver el archivo `GUIA_HOSTING.md` para instrucciones detalladas paso a paso.

## 🆘 ¿Necesitas Ayuda?

Puedo ayudarte a:
1. Configurar Railway paso a paso
2. Configurar variables de entorno
3. Configurar base de datos
4. Configurar dominio personalizado
5. Resolver problemas de despliegue

**¡Dime qué opción prefieres y te ayudo a configurarla!** 🚀

