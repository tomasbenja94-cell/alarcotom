# ⚙️ Configurar archivo .env del Backend

## 📝 Contenido Completo del archivo `server/.env`

Copia este contenido en tu VPS en `/opt/elbuenmenu/server/.env`:

```env
# Base de Datos - Supabase PostgreSQL
DATABASE_URL="postgresql://postgres:cloudVps78862!m@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public"

# Servidor
PORT=5000
NODE_ENV=production

# Seguridad
JWT_SECRET=Qz8sIlMMZqSvcdEBoP4WOXCwroE4tHh+qVZvfbf2gelN5PoEqKsQaNjtTx6vthUXBVWsX2FhN3z6kLqM/EdxEg==
INTERNAL_API_KEY=668359c31083026603093da790d09c789bc8f45a6e14b06949c21bf92dd5d3e6

# URLs de Producción
FRONTEND_URL=https://elbuenmenu.store
BOT_WEBHOOK_URL=http://localhost:3001
CORS_ORIGIN=https://elbuenmenu.store

# Supabase
SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY

# Mercado Pago (si lo tienes configurado)
MERCADOPAGO_ACCESS_TOKEN=tu_access_token_de_mercadopago

# URLs Mercado Pago
MERCADOPAGO_SUCCESS_URL=https://elbuenmenu.store/success
MERCADOPAGO_FAILURE_URL=https://elbuenmenu.store/failure
MERCADOPAGO_PENDING_URL=https://elbuenmenu.store/pending
MERCADOPAGO_WEBHOOK_URL=https://elbuenmenu.store/api/payments/mercadopago/webhook

# Logging
LOG_LEVEL=info
```

---

## 🔧 Pasos en la VPS

```bash
cd /opt/elbuenmenu/server

# Crear archivo .env
nano .env

# Pega todo el contenido de arriba
# Guarda con: Ctrl + X, luego Y, luego Enter

# Verificar que se creó correctamente
cat .env
```

---

## ✅ Verificar Configuración

```bash
# Verificar que las variables están cargadas (no muestra valores por seguridad)
cat .env | grep -E "JWT_SECRET|INTERNAL_API_KEY|DATABASE_URL" | cut -d'=' -f1
```

Debería mostrar:
```
JWT_SECRET
INTERNAL_API_KEY
DATABASE_URL
```

---

¡Listo! Ya tienes todo configurado. 🎉

