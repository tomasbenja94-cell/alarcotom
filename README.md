# El Buen Menú - Sistema de Pedidos

Sistema completo de gestión de pedidos con bot de WhatsApp.

## Estructura del Proyecto

- `server/` - Backend API (Express + Prisma)
- `whatsapp-bot/` - Bot de WhatsApp
- `src/` - Frontend React (solo desarrollo)

## Configuración Rápida

1. Copiar variables de entorno:
   ```bash
   cp env.example.txt .env
   ```

2. Configurar `.env` con tus credenciales

3. Instalar dependencias:
   ```bash
   # Backend
   cd server && npm install
   
   # Bot
   cd ../whatsapp-bot && npm install
   ```

4. Iniciar servicios:
   ```bash
   # Backend (puerto 5000)
   cd server && npm start
   
   # Bot (puerto 3001)
   cd whatsapp-bot && npm start
   ```

## Despliegue en VPS

Solo se despliega `server/` y `whatsapp-bot/`. El frontend se construye y sirve desde otro servicio (Vercel, Netlify, etc.).

