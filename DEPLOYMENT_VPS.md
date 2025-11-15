# 🚀 Guía de Despliegue en VPS

## 📋 Requisitos Previos

- **VPS** con Ubuntu 20.04+ (o similar)
- **Web Hosting** para el frontend (o usar el mismo VPS)
- **Dominio** configurado apuntando a tu VPS (opcional pero recomendado)
- Acceso **SSH** al VPS
- Usuario con permisos **sudo**

---

## 🛠️ Paso 1: Preparar el VPS

### 1.1 Conectar al VPS

```bash
ssh root@tu-ip-del-vps
# o
ssh usuario@tu-ip-del-vps
```

### 1.2 Actualizar el sistema

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.3 Instalar Node.js 18+ (si no está instalado)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Debe mostrar v18.x o superior
npm --version
```

### 1.4 Instalar PM2 (gestor de procesos)

```bash
sudo npm install -g pm2
pm2 --version
```

### 1.5 Instalar Nginx (proxy reverso)

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

### 1.6 Instalar PostgreSQL (si no usas Supabase)

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Crear base de datos
sudo -u postgres psql
CREATE DATABASE elbuenmenu;
CREATE USER elbuenmenu_user WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE elbuenmenu TO elbuenmenu_user;
\q
```

### 1.7 Instalar Certbot (SSL gratuito con Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## 📦 Paso 2: Subir el Código al VPS

### 2.1 Clonar el repositorio (recomendado)

```bash
cd /root  # o /home/usuario
git clone https://github.com/tu-usuario/whatsappkevein.git
cd whatsappkevein
```

### 2.2 O subir por SFTP/FTP

Si no usas Git, sube los archivos del proyecto al VPS usando:
- **FileZilla** (SFTP)
- **WinSCP** (Windows)
- **scp** (línea de comandos)

```bash
# Desde tu máquina local
scp -r /ruta/local/whatsappkevein root@tu-ip-vps:/root/
```

---

## 🔧 Paso 3: Configurar el Backend

### 3.1 Instalar dependencias

```bash
cd /root/whatsappkevein/server
npm install --production
```

### 3.2 Configurar variables de entorno

```bash
cp .env.production.example .env
nano .env  # o usar vi/vim
```

**Editar `.env` con tus valores reales:**

```env
DATABASE_URL="postgresql://elbuenmenu_user:tu_password@localhost:5432/elbuenmenu"
PORT=5000
NODE_ENV=production
JWT_SECRET=tu_secret_muy_seguro_minimo_32_caracteres
INTERNAL_API_KEY=tu_api_key_segura
FRONTEND_URL=https://tu-dominio.com
BOT_WEBHOOK_URL=https://tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
```

### 3.3 Ejecutar migraciones de Prisma

```bash
npx prisma generate
npx prisma migrate deploy
```

---

## 🤖 Paso 4: Configurar el WhatsApp Bot

### 4.1 Instalar dependencias

```bash
cd /root/whatsappkevein/whatsapp-bot
npm install --production
```

### 4.2 Configurar variables de entorno

```bash
cp .env.production.example .env
nano .env
```

**Editar `.env` con tus valores:**

```env
API_URL=https://tu-dominio.com/api
ADMIN_NUMBERS=5493487207406
BOT_WEBHOOK_URL=https://tu-dominio.com
```

---

## 🌐 Paso 5: Configurar el Frontend

### 5.1 Instalar dependencias

```bash
cd /root/whatsappkevein
npm install
```

### 5.2 Configurar variables de entorno

```bash
cp .env.production.example .env
nano .env
```

**Editar `.env`:**

```env
VITE_API_URL=https://tu-dominio.com/api
VITE_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 5.3 Compilar el frontend

```bash
npm run build
```

Esto generará la carpeta `dist/` con los archivos estáticos.

### 5.4 Subir archivos estáticos al Web Hosting

**Opción A: Si usas el mismo VPS para el frontend:**

```bash
sudo mkdir -p /var/www/elbuenmenu/public
sudo cp -r dist/* /var/www/elbuenmenu/public/
sudo chown -R www-data:www-data /var/www/elbuenmenu
```

**Opción B: Si usas Web Hosting separado:**

1. Comprimir la carpeta `dist/`:
   ```bash
   cd dist
   tar -czf ../frontend-build.tar.gz .
   ```

2. Subir `frontend-build.tar.gz` al web hosting por FTP/SFTP

3. Extraer en el directorio público del hosting (ej: `public_html/`)

---

## ⚙️ Paso 6: Configurar PM2

### 6.1 Crear carpeta para logs

```bash
cd /root/whatsappkevein
mkdir -p logs
```

### 6.2 Editar `ecosystem.config.js`

```bash
nano ecosystem.config.js
```

**Cambiar la ruta `cwd` a tu ruta del proyecto:**

```javascript
cwd: '/root/whatsappkevein',  // Tu ruta real
```

### 6.3 Iniciar aplicaciones con PM2

```bash
pm2 start ecosystem.config.js
pm2 save  # Guardar configuración
pm2 startup  # Configurar inicio automático
```

### 6.4 Verificar que todo funciona

```bash
pm2 status
pm2 logs
```

Deberías ver ambos servicios corriendo:
- `backend-elbuenmenu`
- `whatsapp-bot-elbuenmenu`

---

## 🌍 Paso 7: Configurar Nginx

### 7.1 Crear configuración de Nginx

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/elbuenmenu
sudo nano /etc/nginx/sites-available/elbuenmenu
```

**Editar `server_name` con tu dominio:**

```nginx
server_name tu-dominio.com www.tu-dominio.com;
```

**Si no tienes dominio, usar la IP:**

```nginx
server_name tu-ip-vps;
```

**Editar las rutas si son diferentes:**

```nginx
root /var/www/elbuenmenu/public;  # Ajustar a tu ruta
```

### 7.2 Habilitar el sitio

```bash
sudo ln -s /etc/nginx/sites-available/elbuenmenu /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Eliminar configuración por defecto
sudo nginx -t  # Probar configuración
```

### 7.3 Configurar SSL (Let's Encrypt)

**Si tienes dominio:**

```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Esto configurará SSL automáticamente.

**Si NO tienes dominio:** Saltar este paso (pero es recomendado tener SSL).

### 7.4 Reiniciar Nginx

```bash
sudo systemctl reload nginx
```

---

## 🔍 Paso 8: Verificar que Todo Funciona

### 8.1 Verificar Backend

```bash
curl http://localhost:5000/api
# O en el navegador: https://tu-dominio.com/api
```

### 8.2 Verificar Frontend

Abrir en el navegador: `https://tu-dominio.com`

### 8.3 Verificar WhatsApp Bot

```bash
pm2 logs whatsapp-bot-elbuenmenu
```

Deberías ver el QR code si es la primera vez. Escanea con WhatsApp.

---

## 🔄 Paso 9: Actualizar el Código (Futuro)

### 9.1 Si usas Git:

```bash
cd /root/whatsappkevein
git pull origin main

# Backend
cd server
npm install --production
npx prisma migrate deploy
pm2 restart backend-elbuenmenu

# Bot
cd ../whatsapp-bot
npm install --production
pm2 restart whatsapp-bot-elbuenmenu

# Frontend
cd ..
npm install
npm run build
sudo cp -r dist/* /var/www/elbuenmenu/public/
```

### 9.2 Si subes archivos manualmente:

1. Subir archivos nuevos
2. Ejecutar los mismos comandos de actualización

---

## 📊 Comandos Útiles de PM2

```bash
# Ver estado
pm2 status

# Ver logs en tiempo real
pm2 logs

# Ver logs de un servicio específico
pm2 logs backend-elbuenmenu
pm2 logs whatsapp-bot-elbuenmenu

# Reiniciar un servicio
pm2 restart backend-elbuenmenu
pm2 restart whatsapp-bot-elbuenmenu

# Reiniciar todo
pm2 restart all

# Detener un servicio
pm2 stop backend-elbuenmenu

# Eliminar un servicio
pm2 delete backend-elbuenmenu

# Monitoreo
pm2 monit
```

---

## 🔒 Seguridad Adicional

### Firewall (UFW)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status
```

### Actualizar regularmente

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 🐛 Solución de Problemas

### El backend no inicia

```bash
pm2 logs backend-elbuenmenu
cd /root/whatsappkevein/server
node index.js  # Ejecutar manualmente para ver errores
```

### El bot no se conecta

```bash
pm2 logs whatsapp-bot-elbuenmenu
# Eliminar carpeta auth y reiniciar
rm -rf /root/whatsappkevein/whatsapp-bot/auth
pm2 restart whatsapp-bot-elbuenmenu
```

### Nginx no funciona

```bash
sudo nginx -t  # Verificar configuración
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### SSL no funciona

```bash
sudo certbot renew --dry-run  # Probar renovación
sudo certbot certificates  # Ver certificados
```

---

## 📝 Notas Importantes

1. **Backup regular**: Haz backups de la base de datos y archivos importantes
2. **Logs**: Revisa los logs regularmente: `pm2 logs` y `/var/log/nginx/`
3. **Actualizaciones**: Mantén Node.js, npm y el sistema actualizado
4. **Monitoreo**: Considera usar herramientas como UptimeRobot para monitorear tu servidor

---

## ✅ Checklist Final

- [ ] Node.js 18+ instalado
- [ ] PM2 instalado y configurado
- [ ] Nginx instalado y configurado
- [ ] SSL configurado (Let's Encrypt)
- [ ] Backend corriendo con PM2
- [ ] WhatsApp Bot corriendo con PM2
- [ ] Frontend desplegado en web hosting
- [ ] Variables de entorno configuradas
- [ ] Migraciones de base de datos ejecutadas
- [ ] Firewall configurado
- [ ] Dominio configurado (opcional)
- [ ] Backups configurados

---

**¡Listo! Tu aplicación debería estar funcionando en producción.** 🎉

Si tienes problemas, revisa los logs: `pm2 logs` y `sudo tail -f /var/log/nginx/error.log`

