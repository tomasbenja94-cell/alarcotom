# 🚀 Configuración para Operación 24/7 - ~50 Pedidos Diarios

## 📋 Resumen
Este documento contiene todas las configuraciones necesarias para mantener el sistema operativo 24/7, manejando aproximadamente 50 pedidos diarios sin errores ni desconexiones.

---

## 🔧 1. Configuración del Servidor (VPS)

### 1.1. PM2 - Gestión de Procesos

**Instalar PM2 (si no está instalado):**
```bash
npm install -g pm2
```

**Iniciar servicios:**
```bash
cd /opt/elbuenmenu  # Ajustar a tu ruta
pm2 start ecosystem.config.js
pm2 save  # Guardar configuración
pm2 startup  # Configurar auto-start al reiniciar el servidor
```

**Comandos útiles:**
```bash
pm2 status          # Ver estado de procesos
pm2 logs            # Ver logs en tiempo real
pm2 logs backend-elbuenmenu --lines 100  # Logs del backend
pm2 logs whatsapp-bot-elbuenmenu --lines 100  # Logs del bot
pm2 restart all     # Reiniciar todos los procesos
pm2 monit           # Monitor en tiempo real
```

### 1.2. Optimizaciones del Sistema

**Aumentar límites del sistema:**
```bash
# Editar /etc/security/limits.conf
sudo nano /etc/security/limits.conf

# Agregar al final:
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
```

**Reiniciar sesión después de cambiar límites**

### 1.3. Configuración de Nginx (si usas proxy reverso)

```nginx
# /etc/nginx/sites-available/elbuenmenu
server {
    listen 80;
    server_name api.elbuenmenu.site;

    client_max_body_size 50M;
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🤖 2. Configuración del Bot de WhatsApp

### 2.1. Variables de Entorno

**Archivo: `whatsapp-bot/.env`**
```env
NODE_ENV=production
API_URL=https://api.elbuenmenu.site/api
ADMIN_NUMBERS=5493487207406
```

### 2.2. Configuración Optimizada

El bot ya está configurado con:
- ✅ `keepAliveIntervalMs: 10000` - Mantiene conexión activa cada 10 segundos
- ✅ `markOnlineOnConnect: true` - Se marca como online automáticamente
- ✅ `maxMsgRetryCount: 3` - Reintentos mejorados
- ✅ Auto-reconexión en caso de desconexión
- ✅ Manejo robusto de errores de sesión

### 2.3. Monitoreo del Bot

**Verificar conexión:**
```bash
pm2 logs whatsapp-bot-elbuenmenu | grep "CONECTADO"
```

**Buscar errores:**
```bash
pm2 logs whatsapp-bot-elbuenmenu | grep "ERROR\|❌"
```

---

## 🖥️ 3. Configuración del Backend

### 3.1. Variables de Entorno

**Archivo: `server/.env`**
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=tu_connection_string_supabase
FRONTEND_URL=https://elbuenmenu.site
INTERNAL_API_KEY=tu_api_key_segura
```

### 3.2. Rate Limiting Optimizado

Ya configurado:
- ✅ **Polling de delivery**: 120 peticiones/minuto (2 por segundo)
- ✅ **Ubicación GPS**: 60 peticiones/minuto (1 por segundo)
- ✅ **General**: 1000 peticiones/15 minutos

### 3.3. Base de Datos

**Verificar conexión:**
```bash
cd server
npx prisma db pull  # Verificar esquema
npx prisma generate # Regenerar cliente
```

**Tablas requeridas:**
- ✅ `orders` - Pedidos
- ✅ `delivery_persons` - Repartidores
- ✅ `customers` - Clientes
- ✅ `products` - Productos
- ✅ `recipes` - Recetas (crear con SQL si no existe)

---

## 📱 4. Configuración del Frontend (Delivery App)

### 4.1. Polling Optimizado

Ya configurado:
- ✅ **Pedidos disponibles**: Cada 30 segundos
- ✅ **Historial**: Cada 30 segundos
- ✅ **Balance/Transacciones**: Cada 60 segundos (reducido para evitar rate limiting)

### 4.2. Variables de Entorno

**Archivo: `.env` (o variables en hosting)**
```env
VITE_API_URL=https://api.elbuenmenu.site/api
```

---

## 🔍 5. Monitoreo y Mantenimiento

### 5.1. Verificación Diaria

**Script de verificación (crear `/opt/elbuenmenu/check-system.sh`):**
```bash
#!/bin/bash
echo "=== Estado del Sistema ==="
pm2 status
echo ""
echo "=== Uso de Memoria ==="
pm2 monit --no-interaction | head -20
echo ""
echo "=== Últimos Errores (Backend) ==="
pm2 logs backend-elbuenmenu --lines 50 --nostream | grep -i error | tail -10
echo ""
echo "=== Últimos Errores (Bot) ==="
pm2 logs whatsapp-bot-elbuenmenu --lines 50 --nostream | grep -i error | tail -10
```

**Hacer ejecutable:**
```bash
chmod +x /opt/elbuenmenu/check-system.sh
```

### 5.2. Logs Rotativos

**Instalar pm2-logrotate:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 5.3. Alertas (Opcional)

**Configurar notificaciones por email o Telegram si hay errores críticos**

---

## 🚨 6. Solución de Problemas Comunes

### 6.1. Bot No Responde

**Verificar:**
```bash
pm2 logs whatsapp-bot-elbuenmenu | grep "CONECTADO\|ERROR"
```

**Si está desconectado:**
```bash
pm2 restart whatsapp-bot-elbuenmenu
```

**Si persiste, limpiar sesión:**
```bash
rm -rf /opt/elbuenmenu/whatsapp-bot/auth
pm2 restart whatsapp-bot-elbuenmenu
# Escanear nuevo QR
```

### 6.2. Error 429 (Too Many Requests)

**Causa:** Polling excesivo
**Solución:** Ya optimizado - polling cada 30s, balance cada 60s

### 6.3. Backend No Responde

**Verificar:**
```bash
pm2 logs backend-elbuenmenu | tail -50
curl http://localhost:5000/
```

**Reiniciar:**
```bash
pm2 restart backend-elbuenmenu
```

### 6.4. Base de Datos Lenta

**Verificar conexiones:**
- Revisar pool de conexiones en Prisma
- Verificar índices en tablas principales

---

## 📊 7. Capacidad Estimada

### 7.1. Pedidos Diarios
- **Objetivo**: ~50 pedidos/día
- **Pico**: ~5-10 pedidos/hora en horas pico
- **Sistema optimizado para**: 100+ pedidos/día sin problemas

### 7.2. Recursos Necesarios
- **RAM**: Mínimo 2GB (recomendado 4GB)
- **CPU**: 2 cores mínimo
- **Disco**: 20GB mínimo (para logs y sesiones)

### 7.3. Ancho de Banda
- **Estimado**: ~1GB/día con 50 pedidos
- **Picos**: WhatsApp media (imágenes) puede aumentar uso

---

## ✅ 8. Checklist de Implementación

- [ ] PM2 instalado y configurado
- [ ] `ecosystem.config.js` actualizado con rutas correctas
- [ ] Variables de entorno configuradas en backend y bot
- [ ] Tabla `recipes` creada en Supabase
- [ ] `npx prisma generate` ejecutado en servidor
- [ ] Bot conectado y respondiendo mensajes
- [ ] Backend respondiendo correctamente
- [ ] Frontend de delivery funcionando
- [ ] Polling optimizado (30s pedidos, 60s balance)
- [ ] Rate limiting ajustado (120 req/min para polling)
- [ ] Logs rotativos configurados
- [ ] Auto-start configurado (`pm2 startup`)
- [ ] Monitoreo diario configurado

---

## 🔄 9. Actualizaciones

**Proceso de actualización sin downtime:**
```bash
cd /opt/elbuenmenu
git pull
cd server && npx prisma generate
pm2 restart backend-elbuenmenu
# El bot se reinicia automáticamente si es necesario
```

---

## 📞 10. Soporte

Si encuentras problemas:
1. Revisar logs: `pm2 logs`
2. Verificar estado: `pm2 status`
3. Revisar este documento
4. Verificar variables de entorno
5. Verificar conexión a base de datos

---

**Última actualización**: $(date)
**Versión**: 1.0.0

