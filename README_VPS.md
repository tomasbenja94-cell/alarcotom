# 🚀 Guía Rápida - Despliegue en VPS

## 📋 Resumen

Esta guía te ayudará a desplegar **El Buen Menú** en tu VPS con configuración para:
- **Backend** (Node.js/Express) en el VPS
- **WhatsApp Bot** (Baileys) en el VPS  
- **Frontend** (React) en tu Web Hosting

---

## 🎯 Arquitectura

```
┌─────────────────┐
│  Web Hosting    │ → Frontend (React) - Archivos estáticos
└─────────────────┘

┌─────────────────┐
│      VPS        │
├─────────────────┤
│  Nginx          │ → Proxy reverso + SSL
├─────────────────┤
│  PM2            │
│  ├─ Backend     │ → API REST (Puerto 5000)
│  └─ WhatsApp Bot│ → Bot de WhatsApp
├─────────────────┤
│  PostgreSQL     │ → Base de datos (opcional si usas Supabase)
└─────────────────┘
```

---

## ⚡ Inicio Rápido

### 1️⃣ Preparar el VPS

```bash
# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2
sudo npm install -g pm2

# Instalar Nginx
sudo apt install -y nginx

# Instalar Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### 2️⃣ Subir Código al VPS

```bash
# Opción A: Clonar desde Git
cd /root
git clone https://github.com/tu-usuario/whatsappkevein.git
cd whatsappkevein

# Opción B: Subir por SFTP (FileZilla, WinSCP, etc.)
```

### 3️⃣ Configurar Backend

```bash
cd server
cp env.production.example .env
nano .env  # Editar con tus valores
npm install --production
npx prisma generate
npx prisma migrate deploy
```

### 4️⃣ Configurar Bot

```bash
cd ../whatsapp-bot
cp env.production.example .env
nano .env  # Editar con tus valores
npm install --production
```

### 5️⃣ Configurar Frontend

```bash
cd ..
cp env.production.example .env
nano .env  # Editar con tus valores
npm install
npm run build
```

### 6️⃣ Desplegar Frontend en Web Hosting

Subir la carpeta `dist/` al directorio público de tu web hosting (ej: `public_html/`).

### 7️⃣ Iniciar con PM2

```bash
# Editar ecosystem.config.js con tu ruta
nano ecosystem.config.js

# Crear carpeta de logs
mkdir -p logs

# Iniciar servicios
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 8️⃣ Configurar Nginx

```bash
# Copiar y editar configuración
sudo cp nginx.conf.example /etc/nginx/sites-available/elbuenmenu
sudo nano /etc/nginx/sites-available/elbuenmenu
# Editar: server_name, rutas, etc.

# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/elbuenmenu /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t

# Configurar SSL (si tienes dominio)
sudo certbot --nginx -d tu-dominio.com

# Reiniciar Nginx
sudo systemctl reload nginx
```

---

## 📝 Variables de Entorno Necesarias

### Backend (`server/.env`)

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/elbuenmenu"
PORT=5000
NODE_ENV=production
JWT_SECRET=tu_secret_key_seguro_minimo_32_caracteres
INTERNAL_API_KEY=tu_api_key_segura
FRONTEND_URL=https://tu-dominio.com
BOT_WEBHOOK_URL=https://tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com
```

### Bot (`whatsapp-bot/.env`)

```env
API_URL=https://tu-dominio.com/api
ADMIN_NUMBERS=5493487207406
BOT_WEBHOOK_URL=https://tu-dominio.com
```

### Frontend (`.env` antes de `npm run build`)

```env
VITE_API_URL=https://tu-dominio.com/api
VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

---

## 🔄 Actualizar el Código

### Opción 1: Script Automático

```bash
chmod +x deploy.sh
./deploy.sh
```

### Opción 2: Manual

```bash
# 1. Actualizar código
git pull  # o subir archivos nuevos

# 2. Backend
cd server
npm install --production
npx prisma migrate deploy
pm2 restart backend-elbuenmenu

# 3. Bot
cd ../whatsapp-bot
npm install --production
pm2 restart whatsapp-bot-elbuenmenu

# 4. Frontend
cd ..
npm install
npm run build
# Subir dist/ al web hosting
```

---

## 📊 Comandos Útiles

### PM2

```bash
pm2 status                    # Ver estado
pm2 logs                      # Ver logs
pm2 logs backend-elbuenmenu   # Logs del backend
pm2 logs whatsapp-bot-elbuenmenu  # Logs del bot
pm2 restart all               # Reiniciar todo
pm2 monit                     # Monitor en tiempo real
```

### Nginx

```bash
sudo nginx -t                 # Probar configuración
sudo systemctl reload nginx   # Recargar configuración
sudo systemctl status nginx   # Estado de Nginx
sudo tail -f /var/log/nginx/error.log  # Ver errores
```

### Base de Datos

```bash
cd server
npx prisma studio            # Interfaz gráfica de la BD
npx prisma migrate status    # Ver estado de migraciones
```

---

## 🔒 Seguridad

### Firewall (UFW)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Actualizar Sistema

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 🐛 Solución de Problemas

### Backend no inicia

```bash
pm2 logs backend-elbuenmenu
cd server
node index.js  # Ejecutar manualmente para ver errores
```

### Bot no se conecta

```bash
pm2 logs whatsapp-bot-elbuenmenu
rm -rf whatsapp-bot/auth  # Eliminar sesión y reiniciar
pm2 restart whatsapp-bot-elbuenmenu
```

### Nginx muestra error 502

```bash
# Verificar que el backend esté corriendo
pm2 status
curl http://localhost:5000/api

# Ver logs de Nginx
sudo tail -f /var/log/nginx/error.log
```

### SSL no funciona

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 📚 Documentación Completa

Para más detalles, ver: **[DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md)**

---

## ✅ Checklist de Deployment

- [ ] Node.js 18+ instalado
- [ ] PM2 instalado
- [ ] Nginx instalado
- [ ] Código subido al VPS
- [ ] Variables de entorno configuradas (Backend, Bot, Frontend)
- [ ] Migraciones de base de datos ejecutadas
- [ ] Frontend compilado y subido al web hosting
- [ ] PM2 corriendo (Backend y Bot)
- [ ] Nginx configurado
- [ ] SSL configurado (Let's Encrypt)
- [ ] Firewall configurado
- [ ] Todo funcionando

---

**¡Listo! 🎉** Tu aplicación debería estar funcionando en producción.

