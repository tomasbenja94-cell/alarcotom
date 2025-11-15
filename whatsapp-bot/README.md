# 🤖 Bot de WhatsApp - El Buen Menú

Bot completo de WhatsApp para restaurante usando Baileys (sin API oficial de Meta).

## 🚀 Características

### ✅ **Bot Inteligente**
- Responde automáticamente a cualquier mensaje
- IA integrada con OpenAI (opcional)
- Respuestas predeterminadas si la IA no está disponible
- Menú interactivo con botones
- Reconocimiento de intenciones del usuario

### ✅ **Sistema de Delivery**
- Notificaciones automáticas cuando el pedido está "en camino"
- Códigos de entrega de 4 dígitos
- Confirmación de entrega por parte del repartidor
- Gestión completa de estados de pedidos

### ✅ **Funciones Avanzadas**
- Sesión persistente (no necesita escanear QR cada vez)
- Reconexión automática
- Mensajes programados diarios
- Historial de conversaciones por usuario
- Comando `/reiniciar` para administradores

## 📦 Instalación

### 1. Clonar y configurar
\`\`\`bash
# Ir a la carpeta del bot
cd whatsapp-bot

# Instalar dependencias
npm install

# Copiar archivo de configuración
cp .env.example .env
\`\`\`

### 2. Configurar variables de entorno
Editar el archivo `.env`:

\`\`\`env
# OpenAI API Key (opcional)
OPENAI_API_KEY=tu_api_key_aqui

# Números de admin (sin + ni espacios)
ADMIN_NUMBERS="5493487302858"
\`\`\`

### 3. Ejecutar el bot
\`\`\`bash
# Iniciar el bot
npm start

# O en modo desarrollo
npm run dev
\`\`\`

### 4. Escanear código QR
1. Ejecutar el bot
2. Escanear el QR con WhatsApp
3. ¡Listo! El bot ya está funcionando

## 🎯 Uso

### **Comandos del Usuario**
- `hola` → Saludo y menú de opciones
- `menu` → Mostrar menú completo
- `precios` → Lista de precios
- `delivery` → Información de envío
- `horarios` → Horarios de atención
- `1234` (código) → Confirmar entrega (repartidores)

### **Comandos de Admin**
- `/reiniciar` → Reiniciar el bot

### **Respuestas Automáticas**
El bot responde inteligentemente a:
- Saludos y despedidas
- Consultas sobre el menú
- Preguntas de precios
- Información de delivery
- Solicitudes de pedidos
- Agradecimientos

## 🔧 Integración con Sistema de Delivery

### **Notificar pedido en camino**
\`\`\`javascript
import { notifyOrderInTransit } from './src/bot.js';

// Llamar cuando el pedido esté listo para envío
await notifyOrderInTransit('PED001', '5493487302858', '1234');
\`\`\`

### **Estados de pedidos**
- `confirmado` → Pedido recibido
- `preparando` → En cocina
- `en_camino` → Enviado al cliente
- `entregado` → Entregado y confirmado

## 📁 Estructura del Proyecto

\`\`\`
whatsapp-bot/
├── src/
│   ├── bot.js              # Lógica principal del bot
│   ├── ai.js               # Integración con OpenAI
│   ├── utils/
│   │   └── messages.js     # Respuestas predeterminadas
│   └── data/
│       └── pedidos.js      # Gestión de pedidos
├── auth/                   # Sesión de WhatsApp (auto-generada)
├── package.json
├── .env.example
└── README.md
\`\`\`

## 🤖 Configuración de IA

### **Con OpenAI**
1. Obtener API Key de OpenAI
2. Configurar en `.env`:
   \`\`\`env
   OPENAI_API_KEY=sk-tu-api-key-aqui
   \`\`\`

### **Sin IA**
El bot funciona perfectamente con respuestas predeterminadas inteligentes.

## 📊 Funciones Adicionales

### **Mensaje Diario Programado**
- Se envía automáticamente a las 9:00 AM
- Solo a usuarios activos (últimos 7 días)
- Mensaje personalizable

### **Limpieza Automática**
- Sesiones inactivas se limpian cada hora
- Historial de conversación limitado a 20 mensajes por usuario

### **Logging Completo**
- Todos los mensajes se registran en consola
- Errores detallados para debugging
- Estados de conexión monitoreados

## 🔒 Seguridad

- Comandos de admin restringidos por número de teléfono
- Validación de códigos de entrega
- Manejo seguro de errores
- Sesión encriptada automáticamente

## 🚀 Despliegue en Servidor

### **VPS/Servidor Linux**
\`\`\`bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonar proyecto
git clone tu-repositorio
cd whatsapp-bot

# Instalar dependencias
npm install

# Usar PM2 para mantener el bot activo
npm install -g pm2
pm2 start src/bot.js --name "whatsapp-bot"
pm2 startup
pm2 save
\`\`\`

### **Windows**
\`\`\`bash
# Instalar Node.js desde nodejs.org
# Ejecutar en PowerShell o CMD
npm install
npm start
\`\`\`

## 📞 Soporte

Si necesitas ayuda:
1. Revisar los logs en consola
2. Verificar configuración en `.env`
3. Asegurar que WhatsApp esté conectado
4. Contactar soporte técnico

## 🔄 Actualizaciones

Para actualizar el bot:
\`\`\`bash
git pull origin main
npm install
npm start
\`\`\`

---

**¡Tu bot de WhatsApp está listo para funcionar! 🎉**