# 🚀 Instrucciones para Ejecutar el Proyecto

## 📋 Requisitos Previos

- Node.js 18+ instalado
- npm o yarn instalado

## 🔧 Configuración Inicial

### 1. Instalar Dependencias

Abre **3 terminales** diferentes y ejecuta en cada una:

**Terminal 1 - Servidor Backend:**
```bash
cd server
npm install
```

**Terminal 2 - Frontend (Web):**
```bash
npm install
```

**Terminal 3 - Bot de WhatsApp:**
```bash
cd whatsapp-bot
npm install
```

### 2. Configurar Variables de Entorno

**En `server/.env` (crear si no existe):**
```env
DATABASE_URL="file:./prisma/dev.db"
PORT=5000
```

**En `whatsapp-bot/.env` (crear si no existe):**
```env
API_URL=http://localhost:5000/api
ADMIN_NUMBERS=5493487207406
OPENAI_API_KEY=tu_clave_opcional
```

**En la raíz del proyecto `.env` (para el frontend):**
```env
VITE_API_URL=http://localhost:5000/api
```

## ▶️ Ejecutar el Proyecto

### Opción 1: Ejecutar Todo Manualmente (Recomendado para desarrollo)

Abre **3 terminales** y ejecuta en cada una:

**Terminal 1 - Servidor Backend:**
```bash
cd server
npm run dev
```
El servidor estará en: `http://localhost:5000`

**Terminal 2 - Frontend (Web):**
```bash
npm run dev
```
La web estará en: `http://localhost:5173` (o el puerto que Vite asigne)

**Terminal 3 - Bot de WhatsApp:**
```bash
cd whatsapp-bot
npm run dev
```
El bot mostrará un código QR que debes escanear con WhatsApp.

### Opción 2: Scripts de Ejecución Rápida

Puedes crear scripts en el `package.json` raíz para ejecutar todo junto (requiere `concurrently`):

```json
{
  "scripts": {
    "dev:all": "concurrently \"npm run dev:server\" \"npm run dev:client\" \"npm run dev:bot\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "npm run dev",
    "dev:bot": "cd whatsapp-bot && npm run dev"
  }
}
```

Luego ejecuta:
```bash
npm run dev:all
```

## 📱 Conectar el Bot de WhatsApp

1. Ejecuta el bot de WhatsApp (Terminal 3)
2. Verás un código QR en la terminal
3. Abre WhatsApp en tu teléfono
4. Ve a **Configuración > Dispositivos vinculados > Vincular un dispositivo**
5. Escanea el código QR que aparece en la terminal
6. ¡Listo! El bot está conectado

## ✅ Verificar que Todo Funciona

1. **Backend**: Abre `http://localhost:5000` - Deberías ver un JSON con los endpoints
2. **Frontend**: Abre `http://localhost:5173` - Deberías ver la web funcionando
3. **Bot**: Envía un mensaje a tu número de WhatsApp desde otro teléfono

## 🐛 Solución de Problemas

### El servidor no inicia
- Verifica que el puerto 5000 no esté en uso
- Asegúrate de haber ejecutado `npm install` en la carpeta `server`

### El frontend no carga datos
- Verifica que el servidor backend esté corriendo
- Revisa la consola del navegador para errores
- Verifica que `VITE_API_URL` esté configurado correctamente

### El bot no muestra el QR
- Elimina la carpeta `whatsapp-bot/auth` si existe
- Reinicia el bot
- Verifica que no haya otros procesos usando el puerto

### Error de base de datos
- Asegúrate de haber ejecutado las migraciones:
  ```bash
  cd server
  npx prisma migrate dev
  ```

## 📝 Notas Importantes

- **Primera vez**: Necesitas escanear el QR del bot de WhatsApp
- **Reconexión**: Si el bot se desconecta, reinícialo y escanea el QR nuevamente
- **Base de datos**: La base de datos SQLite se crea automáticamente en `server/prisma/dev.db`
- **Puertos**: 
  - Backend: `5000`
  - Frontend: `5173` (Vite por defecto)
  - Bot: No usa puerto HTTP (solo WebSocket de WhatsApp)

## 🎯 Orden de Ejecución Recomendado

1. Primero: Servidor Backend
2. Segundo: Frontend
3. Tercero: Bot de WhatsApp

¡Listo para empezar! 🚀

