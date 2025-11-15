# ✅ Configuración Completa - El Buen Menú

## 📋 Resumen de Configuración

### 🗄️ Base de Datos: Supabase PostgreSQL

**DATABASE_URL:**
```
postgresql://postgres:cloudVps78862!m@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public
```

**Supabase Config:**
- URL: `https://fnpzoqjnisgkhgnlwzic.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY`

---

## 🌐 Dominio de Producción

**Dominio:** `elbuenmenu.store`

---

## 🔧 Configuración en la VPS

### Backend (`server/.env`)

```env
# Base de Datos - Supabase
DATABASE_URL="postgresql://postgres:cloudVps78862!m@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public"

# Servidor
PORT=5000
NODE_ENV=production

# Seguridad - GENERA ESTOS VALORES ÚNICOS
JWT_SECRET=genera_un_secreto_muy_largo_y_aleatorio_aqui_minimo_32_caracteres
INTERNAL_API_KEY=genera_otra_api_key_segura_aqui

# URLs de Producción
FRONTEND_URL=https://elbuenmenu.store
BOT_WEBHOOK_URL=http://localhost:3001
CORS_ORIGIN=https://elbuenmenu.store

# Supabase
SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY

# Mercado Pago (si lo tienes)
MERCADOPAGO_ACCESS_TOKEN=tu_access_token_de_mercadopago

# URLs Mercado Pago
MERCADOPAGO_SUCCESS_URL=https://elbuenmenu.store/success
MERCADOPAGO_FAILURE_URL=https://elbuenmenu.store/failure
MERCADOPAGO_PENDING_URL=https://elbuenmenu.store/pending
MERCADOPAGO_WEBHOOK_URL=https://elbuenmenu.store/api/payments/mercadopago/webhook
```

### WhatsApp Bot (`whatsapp-bot/.env`)

```env
# Backend API
API_URL=https://elbuenmenu.store/api

# Números de administrador
ADMIN_NUMBERS=5493487207406

# Webhook URL
BOT_WEBHOOK_URL=https://elbuenmenu.store

# Logging
LOG_LEVEL=info
```

### Frontend (Variables en CPANEL o build local)

```env
VITE_API_URL=https://elbuenmenu.store/api
VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY
```

---

## 🚀 Pasos de Despliegue en VPS

### 1. Clonar Repositorio
```bash
cd /opt
git clone https://github.com/tomasbenja94-cell/alarcotom.git elbuenmenu
cd elbuenmenu
```

### 2. Configurar Backend
```bash
cd server
cp env.production.example .env
nano .env  # Editar y configurar según arriba
npm install
npx prisma generate
npx prisma migrate deploy
npm run create-admin  # Crear primer usuario admin
```

### 3. Configurar Bot WhatsApp
```bash
cd ../whatsapp-bot
cp env.production.example .env
nano .env  # Editar y configurar según arriba
npm install
npm start  # Primera vez para escanear QR
```

### 4. Ejecutar con PM2
```bash
# Backend
cd /opt/elbuenmenu/server
pm2 start index.js --name backend

# Bot WhatsApp
cd /opt/elbuenmenu/whatsapp-bot
pm2 start src/bot.js --name whatsapp-bot

# Guardar configuración
pm2 save
pm2 startup
```

### 5. Frontend en CPANEL
- Subir todo el contenido de la carpeta `out/` a `public_html/`
- Asegurarse de que el `.htaccess` esté incluido

---

## ✅ Checklist Final

- [ ] Backend configurado con DATABASE_URL de Supabase
- [ ] Bot WhatsApp configurado con API_URL
- [ ] Frontend construido con variables de producción
- [ ] Admin creado con `npm run create-admin`
- [ ] Migraciones ejecutadas en Supabase
- [ ] PM2 configurado para ambos procesos
- [ ] Frontend subido a CPANEL
- [ ] CORS configurado en backend
- [ ] SSL configurado en dominio

---

¡Todo listo para producción! 🎉

