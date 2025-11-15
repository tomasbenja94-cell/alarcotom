# 📚 Documentación Completa - El Buen Menú

## 🏗️ Arquitectura General

La aplicación está dividida en **3 componentes principales** que funcionan de forma independiente pero se comunican entre sí:

```
┌─────────────────────────────────────────────────────────────┐
│                    EL BUEN MENÚ - SISTEMA                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌─────────────┐│
│  │   FRONTEND   │◄─────►│   BACKEND   │◄─────►│  WHATSAPP    ││
│  │   (React)    │      │  (Express)  │      │    BOT       ││
│  │  Port 5173   │      │  Port 5000  │      │  (Baileys)   ││
│  └──────────────┘      └──────────────┘      └─────────────┘│
│         │                      │                     │       │
│         └──────────────────────┴─────────────────────┘       │
│                            │                                  │
│                    ┌───────▼────────┐                        │
│                    │   SQLite DB    │                        │
│                    │  (Prisma ORM)  │                        │
│                    └────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura del Proyecto

```
whatsappkevein/
├── src/                          # Frontend React + TypeScript
│   ├── pages/                    # Páginas de la aplicación
│   │   ├── home/                 # Página de inicio
│   │   ├── menu/                 # Catálogo de productos
│   │   ├── checkout/             # Proceso de checkout
│   │   ├── orders/               # Historial de pedidos
│   │   ├── admin/                # Panel de administración
│   │   │   └── components/       # Componentes del admin
│   │   ├── delivery/             # App de repartidores
│   │   └── tracking/              # Seguimiento público de pedidos
│   ├── lib/                      # Utilidades y clientes API
│   │   ├── api.ts                # Cliente API centralizado
│   │   ├── mapbox.ts             # Helpers de Mapbox
│   │   └── supabase.ts           # Compatibilidad (legacy)
│   ├── components/                # Componentes reutilizables
│   ├── router/                   # Configuración de rutas
│   └── hooks/                    # Custom hooks
│
├── server/                       # Backend Express.js
│   ├── index.js                  # Servidor principal (1600+ líneas)
│   ├── prisma/
│   │   ├── schema.prisma         # Schema de base de datos
│   │   └── migrations/           # Migraciones de DB
│   └── package.json
│
├── whatsapp-bot/                 # Bot de WhatsApp
│   ├── src/
│   │   ├── bot.js                # Lógica principal del bot (2600+ líneas)
│   │   ├── ai.js                 # Integración con OpenAI (opcional)
│   │   └── utils/                # Utilidades
│   ├── auth/                     # Sesiones de WhatsApp (generadas)
│   └── proofs/                   # Comprobantes de transferencia
│
└── package.json                  # Frontend root
```

---

## 🗄️ Base de Datos (Prisma + SQLite)

### Modelos Principales:

#### 1. **Category** (Categorías de productos)
- `id`, `name`, `description`, `imageUrl`
- `displayOrder`, `isActive`
- Relación: `products` (1:N)

#### 2. **Product** (Productos del menú)
- `id`, `name`, `description`, `price`, `imageUrl`
- `categoryId`, `isAvailable`, `displayOrder`
- Relaciones: `category`, `orderItems`, `productOptionCategories`

#### 3. **ProductOptionCategory** (Categorías de opciones - ej: "Tamaño", "Extras")
- `id`, `productId`, `name`
- `isRequired`, `minSelections`, `maxSelections`
- Relación: `options` (1:N)

#### 4. **ProductOption** (Opciones individuales - ej: "Grande", "Con queso")
- `id`, `optionCategoryId`, `name`
- `priceModifier` (puede sumar/restar al precio)
- `isAvailable`

#### 5. **Order** (Pedidos) ⭐ **CORE**
- `id`, `orderNumber` (único, formato: #0001)
- `customerName`, `customerPhone`, `customerAddress`
- `customerLat`, `customerLng` (coordenadas GPS)
- `status`: `pending` → `confirmed` → `preparing` → `ready` → `assigned` → `in_transit` → `delivered` / `cancelled`
- `paymentMethod`, `paymentStatus`
- `subtotal`, `deliveryFee`, `total`
- `deliveryCode` (código de 4 dígitos para entrega)
- `trackingToken` (token único para tracking público)
- `deliveryPersonId` (repartidor asignado)
- Relaciones: `items`, `deliveryPerson`, `whatsappMessages`, `pendingTransfers`, `balanceTransactions`

#### 6. **OrderItem** (Items de cada pedido)
- `id`, `orderId`, `productId`
- `productName`, `quantity`, `unitPrice`, `subtotal`
- `selectedOptions` (JSON con opciones seleccionadas)

#### 7. **DeliveryPerson** (Repartidores) 🛵
- `id`, `name`, `phone`
- `username`, `password` (para login en app de delivery)
- `isActive`, `currentOrderId` (pedido actual)
- `totalDeliveries`, `balance` (saldo acumulado)
- `lastLat`, `lastLng`, `lastSeenAt` (GPS tracking)
- Relaciones: `orders`, `balanceTransactions`

#### 8. **DriverBalanceTransaction** (Transacciones de saldo)
- `id`, `driverId`, `orderId`
- `type`: `"delivery"` (+3000), `"pago_admin"`, `"ajuste"`
- `amount` (positivo/negativo)
- `reference` (comentario adicional)

#### 9. **Customer** (Clientes)
- `id`, `phone` (único), `name`
- `isBlocked` (si no responde mensajes)
- `disabledPaymentMethods` (JSON array, ej: `["efectivo"]`)

#### 10. **PendingTransfer** (Transferencias pendientes)
- `id`, `orderId`, `transferReference`
- `amount`, `status`, `proofImageUrl`
- `verifiedAt`

#### 11. **WhatsAppMessage** (Historial de mensajes)
- `id`, `orderId`, `phoneNumber`
- `messageText`, `messageType`, `direction` (incoming/outgoing)

#### 12. **BotMessage** (Mensajes configurables del bot)
- `id`, `messageKey` (único, ej: "welcome")
- `messageText`, `messageType`, `isActive`

---

## 🔄 Flujos Principales

### 1. FLUJO DE PEDIDO COMPLETO

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO DE PEDIDO                          │
└─────────────────────────────────────────────────────────────┘

1. CLIENTE EN WHATSAPP
   └─> Envía mensaje al bot
   └─> Bot responde con menú interactivo
   └─> Cliente selecciona productos
   └─> Bot genera pedido en DB (status: "pending")

2. CLIENTE EN WEB (Alternativo)
   └─> Navega a /menu
   └─> Agrega productos al carrito
   └─> Completa checkout
   └─> Se crea pedido en DB (status: "pending")

3. ADMIN EN PANEL
   └─> Ve pedido en /admin (tab "Pedidos")
   └─> Puede APROBAR o RECHAZAR
   └─> Si aprueba: status → "confirmed"
   └─> Cliente recibe notificación WhatsApp

4. ADMIN PREPARA PEDIDO
   └─> Cambia status a "preparing"
   └─> Luego a "ready"

5. REPARTIDOR ACEPTA PEDIDO
   └─> En app /delivery
   └─> Ve pedidos disponibles
   └─> Acepta pedido
   └─> Se genera:
       • deliveryCode (4 dígitos)
       • trackingToken (único)
   └─> Status → "assigned"
   └─> Cliente recibe notificación con código y link de tracking

6. REPARTIDOR EN CAMINO
   └─> Marca "Voy en camino"
   └─> Status → "in_transit"
   └─> Envía ubicación GPS cada 5 segundos
   └─> Cliente puede ver tracking en tiempo real

7. REPARTIDOR LLEGA
   └─> Marca "Marcar como Entregado"
   └─> Ingresa código de entrega
   └─> Si código correcto:
       • Status → "delivered"
       • Repartidor recibe +$3000 en balance
       • Repartidor queda libre (currentOrderId = null)

8. PEDIDO COMPLETADO
   └─> Aparece en historial
   └─> Datos permanecen en DB para reportes
```

### 2. FLUJO DE WHATSAPP BOT

```
┌─────────────────────────────────────────────────────────────┐
│              FLUJO DEL BOT DE WHATSAPP                       │
└─────────────────────────────────────────────────────────────┘

INICIO:
1. Bot inicia (bot.js)
2. Carga credenciales desde /auth
3. Si no hay credenciales → genera QR
4. Usuario escanea QR con WhatsApp
5. Conexión establecida

MENSAJE ENTRANTE:
1. Cliente envía mensaje
2. Bot recibe en evento 'messages.upsert'
3. Extrae número de teléfono (getCleanNumber)
   - Detecta @lid (Linked Device IDs)
   - Intenta resolver a número real
   - Valida formato (10-13 dígitos)
   - Agrega prefijo "54" si es necesario
4. Guarda mensaje en DB (saveMessageToSupabase)
5. Crea/actualiza cliente (si número válido)
6. Procesa mensaje según contenido:
   - Comandos especiales (/reiniciar, /menu, etc.)
   - Intención detectada (hola, pedido, etc.)
   - Respuesta automática con IA (opcional)
   - Menú interactivo con botones

CREACIÓN DE PEDIDO:
1. Cliente completa pedido (vía bot o web)
2. Bot recibe webhook desde backend
3. Bot envía confirmación al cliente
4. Pedido guardado en DB con status "pending"

NOTIFICACIONES:
1. Backend llama webhook /notify-order
2. Bot recibe solicitud
3. Valida número (puede ser @lid)
4. Envía mensaje vía Baileys
5. Guarda mensaje en historial
```

### 3. FLUJO DE DELIVERY (REPARTIDORES)

```
┌─────────────────────────────────────────────────────────────┐
│              FLUJO DE REPARTIDORES                          │
└─────────────────────────────────────────────────────────────┘

LOGIN:
1. Repartidor abre /delivery
2. Ingresa username/password
3. Backend valida credenciales
4. Sesión guardada en localStorage (24h)
5. Solicita permiso de geolocalización

TRACKING GPS:
1. Navegador obtiene ubicación cada 5 segundos
2. Frontend envía a POST /api/delivery/location
3. Backend actualiza:
   - deliveryPerson.lastLat
   - deliveryPerson.lastLng
   - deliveryPerson.lastSeenAt

ACEPTAR PEDIDO:
1. Repartidor ve pedidos disponibles
2. Click en "Aceptar Pedido"
3. Backend:
   - Genera deliveryCode (4 dígitos aleatorios)
   - Genera trackingToken (timestamp + random)
   - Asigna repartidor al pedido
   - Status → "assigned"
   - Envía notificación WhatsApp al cliente
4. Frontend actualiza vista

EN CAMINO:
1. Repartidor marca "Voy en camino"
2. Status → "in_transit"
3. Mapa muestra ruta GPS (Mapbox)
4. Cliente puede ver tracking en tiempo real

ENTREGA:
1. Repartidor marca "Marcar como Entregado"
2. Ingresa código de entrega
3. Backend valida código (Levenshtein distance ≤ 2)
4. Si correcto:
   - Status → "delivered"
   - Balance += 3000
   - Crea transacción en DriverBalanceTransaction
   - Libera repartidor
5. Si incorrecto:
   - Deshabilita efectivo para ese cliente
   - Error al repartidor
```

### 4. FLUJO DE ADMINISTRACIÓN

```
┌─────────────────────────────────────────────────────────────┐
│              FLUJO DE ADMINISTRACIÓN                        │
└─────────────────────────────────────────────────────────────┘

PANEL PRINCIPAL (/admin):
- 7 secciones principales:
  1. 📋 Pedidos
  2. 🍔 Menú
  3. 💳 Transferencias
  4. 🛵 Repartidores
  5. 👥 Clientes
  6. ⚙️ Pagos
  7. 🤖 Bot WhatsApp

GESTIÓN DE PEDIDOS:
1. Ver todos los pedidos (filtros por estado)
2. Aprobar/Rechazar pedidos pendientes
3. Cambiar estado: preparing → ready
4. Ver detalles completos
5. Búsqueda por número/cliente/teléfono

GESTIÓN DE REPARTIDORES:
1. Ver mapa con todos los repartidores (Mapbox)
2. Crear/Editar/Eliminar repartidores
3. Asignar pedidos manualmente
4. Ver y gestionar balances
5. Registrar pagos a repartidores

LIMPIEZA TOTAL:
1. Botón "Limpiar Todo" en header
2. Modal de confirmación
3. Debe escribir "ELIMINAR TODO"
4. Elimina:
   - Todos los pedidos
   - Todos los repartidores
   - Todos los clientes
   - Todas las transacciones
   - Todos los mensajes
   - Todas las transferencias
```

---

## 🔌 APIs y Endpoints

### BACKEND (Express.js - Port 5000)

#### **Categorías**
- `GET /api/categories` - Listar categorías
- `POST /api/categories` - Crear categoría
- `PUT /api/categories/:id` - Actualizar categoría
- `DELETE /api/categories/:id` - Eliminar categoría

#### **Productos**
- `GET /api/products` - Listar productos
- `POST /api/products` - Crear producto
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto

#### **Opciones de Productos**
- `GET /api/product-option-categories?productId=xxx` - Categorías de opciones
- `POST /api/product-option-categories` - Crear categoría
- `GET /api/product-options?categoryId=xxx` - Opciones
- `POST /api/product-options` - Crear opción

#### **Pedidos** ⭐
- `GET /api/orders` - Listar todos los pedidos
- `GET /api/orders/:id` - Obtener pedido específico
- `POST /api/orders` - Crear pedido
- `PUT /api/orders/:id` - Actualizar pedido
- `POST /api/orders/:id/approve` - **Aprobar pedido**
- `POST /api/orders/:id/reject` - **Rechazar pedido** (lo cancela)
- `POST /api/orders/:id/cancel` - Cancelar pedido

#### **Repartidores** 🛵
- `GET /api/delivery-persons` - Listar repartidores
- `POST /api/delivery-persons` - Crear repartidor
- `PUT /api/delivery-persons/:id` - Actualizar repartidor
- `DELETE /api/delivery-persons/:id` - Eliminar repartidor
- `POST /api/delivery/login` - **Login de repartidor**
- `POST /api/delivery/location` - **Actualizar ubicación GPS**
- `GET /api/delivery/available-orders` - **Pedidos disponibles**
- `POST /api/delivery/accept-order` - **Aceptar pedido**
- `POST /api/delivery/update-order-status` - **Actualizar estado**
- `POST /api/delivery/deliver-order` - **Entregar pedido** (con código)
- `GET /api/delivery/balance/:driver_id` - **Ver balance y transacciones**
- `POST /api/delivery/register-payment` - **Registrar pago** (admin)
- `GET /api/delivery/drivers-location` - **Ubicaciones en tiempo real**

#### **Tracking Público**
- `GET /api/track/:token` - **Obtener datos de tracking** (sin auth)

#### **Clientes**
- `GET /api/customers` - Listar clientes
- `POST /api/customers` - Crear cliente
- `PUT /api/customers/:id` - Actualizar cliente

#### **Mensajes del Bot**
- `GET /api/bot-messages` - Listar mensajes configurables
- `PUT /api/bot-messages/:id` - Actualizar mensaje

#### **Mensajes de WhatsApp**
- `GET /api/whatsapp-messages?orderId=xxx` - Mensajes de un pedido
- `POST /api/whatsapp-messages` - Guardar mensaje

#### **Transferencias Pendientes**
- `GET /api/pending-transfers` - Listar transferencias
- `PUT /api/pending-transfers/:id` - Actualizar transferencia

#### **Admin**
- `POST /api/admin/clear-all` - **Limpieza total del sistema**

---

## 🤖 Bot de WhatsApp (Baileys)

### **Archivo Principal: `whatsapp-bot/src/bot.js`**

#### **Tecnologías:**
- **Baileys**: Librería no oficial de WhatsApp (WebSocket)
- **Pino**: Logger estructurado
- **Express**: Servidor webhook interno (port 3001)

#### **Funcionalidades Principales:**

1. **Gestión de Sesión**
   - Autenticación multi-archivo (`useMultiFileAuthState`)
   - Generación de QR code
   - Reconexión automática
   - Limpieza automática de sesiones corruptas (Bad MAC)

2. **Procesamiento de Mensajes**
   - Cola de mensajes para alta carga
   - Rate limiting (20 mensajes/minuto por usuario)
   - Procesamiento asíncrono
   - Manejo de errores robusto

3. **Función `getCleanNumber(jid)`** ⭐
   ```javascript
   // Centraliza toda la lógica de números
   - Detecta @lid (Linked Device IDs)
   - Usa jidDecode() para decodificar
   - Intenta obtener número real con sock.onWhatsApp()
   - Valida formato (10-13 dígitos)
   - Rechaza IDs internos (>13 dígitos)
   - Agrega prefijo "54" si es número argentino de 10 dígitos
   - Retorna número limpio o null
   ```

4. **Comandos del Bot**
   - `/reiniciar` - Solo admins
   - `hola`, `menu`, `precios`, `delivery`, `horarios`
   - Respuestas automáticas con IA (opcional)
   - Menú interactivo con botones

5. **Webhooks**
   - `POST /notify-order` - Enviar notificación a cliente
   - `POST /reload-messages` - Recargar mensajes del bot

6. **Notificaciones Automáticas**
   - Cuando pedido es aprobado
   - Cuando pedido está en camino (con código y tracking)
   - Cuando pedido es rechazado/cancelado

---

## 🎨 Frontend (React + TypeScript + Vite)

### **Tecnologías:**
- **React 19** con TypeScript
- **Vite 7** (build tool)
- **Tailwind CSS** (estilos)
- **React Router 7** (navegación)
- **Mapbox GL JS** (mapas interactivos)

### **Páginas Principales:**

#### 1. **`/` (Home)**
- Landing page
- Botones para ver menú y pedir

#### 2. **`/menu`**
- Catálogo de productos
- Filtros por categoría
- Carrito de compras
- Opciones de productos (tamaños, extras)
- Checkout integrado

#### 3. **`/checkout`**
- Formulario de datos del cliente
- Selección de método de pago
- Confirmación de pedido
- Redirección a WhatsApp o webhook

#### 4. **`/admin`** (Panel de Administración)
- **7 secciones con tabs:**
  - **Pedidos**: Gestión completa, aprobar/rechazar, filtros
  - **Menú**: CRUD de categorías y productos
  - **Transferencias**: Ver y verificar comprobantes
  - **Repartidores**: Mapa en tiempo real, gestión, balances
  - **Clientes**: Lista de clientes, bloqueos
  - **Pagos**: Configuración de métodos
  - **Bot WhatsApp**: Mensajes configurables

#### 5. **`/delivery`** (App de Repartidores)
- Login con username/password
- Tracking GPS automático (cada 5s)
- Ver pedidos disponibles
- Ver pedidos en curso
- Mapa GPS con ruta (Mapbox)
- ETA y distancia en tiempo real
- Marcar como entregado con código

#### 6. **`/track/:token`** (Tracking Público)
- URL pública (sin login)
- Mapa con ubicación del repartidor
- Ruta al destino
- ETA y distancia
- Estado del pedido
- Actualización cada 5 segundos

---

## 🗺️ Integración con Mapbox

### **Token:** `pk.eyJ1IjoiZWxidWVubWVudSIsImEiOiJjbWdqMnRwZWMwZ2FvMmtuMjFvMGR1NXNiIn0.7ACTVWHp6JJ6l5kY5O3GzQ`

### **Funcionalidades:**
1. **Mapa en Admin** (`/admin` → Repartidores)
   - Muestra todos los repartidores en tiempo real
   - Marcadores de colores (verde=disponible, amarillo=ocupado, gris=offline)
   - Popups con información

2. **Mapa en Delivery** (`/delivery`)
   - Ruta desde repartidor hasta cliente
   - Marcador del repartidor (verde)
   - Marcador del cliente (rojo)
   - Línea de ruta azul
   - ETA y distancia calculados

3. **Mapa en Tracking** (`/track/:token`)
   - Mapa centrado entre repartidor y cliente
   - Ruta actualizada en tiempo real
   - ETA y distancia

### **Funciones Helper (`src/lib/mapbox.ts`):**
- `getRoute()` - Obtiene ruta de Mapbox Directions API
- `calculateDistance()` - Distancia Haversine
- `formatDistance()` - Formatea metros a km
- `formatDuration()` - Formatea segundos a minutos/horas

---

## 🔐 Sistema de Autenticación

### **Repartidores:**
- Login con `username` y `password`
- Credenciales creadas por admin
- Sesión persistente en `localStorage` (24 horas)
- No hay JWT, solo validación en backend

### **Admin:**
- **NO hay autenticación actualmente** (acceso libre)
- ⚠️ **Recomendación**: Agregar autenticación en producción

---

## 📱 Sistema de Notificaciones WhatsApp

### **Flujo:**
1. Backend necesita notificar cliente
2. Llama a webhook: `POST http://localhost:3001/notify-order`
3. Bot recibe solicitud
4. Valida número (puede ser @lid)
5. Envía mensaje vía Baileys
6. Guarda en historial

### **Tipos de Notificaciones:**
- **Pedido Aprobado**: "Tu pedido ha sido aprobado..."
- **Pedido en Camino**: "Tu pedido está en camino" + código + tracking
- **Pedido Rechazado**: "Tu pedido ha sido rechazado..."
- **Pedido Cancelado**: "Tu pedido ha sido cancelado..."

---

## 💰 Sistema de Balances (Repartidores)

### **Transacciones:**
- **Tipo "delivery"**: +3000 cuando entrega pedido
- **Tipo "pago_admin"**: Pago del admin al repartidor
- **Tipo "ajuste"**: Ajustes manuales

### **Flujo:**
1. Repartidor entrega pedido → +3000
2. Admin puede ver balance en `/admin` → Repartidores
3. Admin puede registrar pago → Resta del balance
4. Historial completo de transacciones

---

## 🧹 Limpieza de Datos

### **Endpoint:** `POST /api/admin/clear-all`

**Elimina:**
1. Transacciones de balance
2. Items de pedidos
3. Mensajes de WhatsApp
4. Transferencias pendientes
5. Pedidos
6. Repartidores
7. Clientes

**NO elimina:**
- Categorías
- Productos
- Mensajes del bot
- Configuración

---

## 🔄 Estados de Pedidos

```
pending → confirmed → preparing → ready → assigned → in_transit → delivered
                                    ↓
                                cancelled (en cualquier momento)
```

### **Transiciones:**
- `pending` → `confirmed`: Admin aprueba
- `confirmed` → `preparing`: Admin marca "Preparando"
- `preparing` → `ready`: Admin marca "Listo"
- `ready` → `assigned`: Repartidor acepta pedido
- `assigned` → `in_transit`: Repartidor marca "Voy en camino"
- `in_transit` → `delivered`: Repartidor entrega con código
- Cualquier estado → `cancelled`: Admin rechaza o cancela

---

## 🛠️ Tecnologías y Librerías

### **Frontend:**
- React 19.1.0
- TypeScript 5.8.3
- Vite 7.0.3
- Tailwind CSS 3.4.17
- React Router 7.6.3
- Mapbox GL JS 2.15.0

### **Backend:**
- Express.js 4.18.2
- Prisma 5.7.1
- SQLite (por defecto)
- CORS 2.8.5
- dotenv 16.3.1

### **Bot WhatsApp:**
- Baileys 6.6.0
- Pino 8.17.2 (logger)
- Express 4.18.2 (webhooks)
- OpenAI 4.24.7 (opcional, para IA)

---

## 🚀 Comandos de Ejecución

### **Desarrollo:**
```bash
# Terminal 1 - Backend
cd server
npm run dev        # Port 5000

# Terminal 2 - Frontend
npm run dev        # Port 5173

# Terminal 3 - Bot WhatsApp
cd whatsapp-bot
npm run dev        # Port 3001 (webhooks)
```

### **Producción:**
```bash
# Backend
cd server
npm start

# Frontend
npm run build
npm run preview
```

---

## 📊 Métricas y Monitoreo

### **Bot de WhatsApp:**
- Contador de mensajes procesados
- Cola de mensajes
- Rate limiting por usuario
- Errores Bad MAC (auto-limpieza)

### **Backend:**
- Logs estructurados en consola
- Manejo de errores con try-catch
- Validaciones de datos

---

## 🔒 Seguridad

### **Implementado:**
- Rate limiting en bot
- Validación de números de teléfono
- Códigos de entrega (4 dígitos)
- Validación Levenshtein para códigos
- Confirmaciones múltiples para acciones destructivas

### **Recomendaciones:**
- Agregar autenticación JWT para admin
- Hash de contraseñas de repartidores (bcrypt)
- Validación de inputs en backend
- Rate limiting en endpoints críticos
- HTTPS en producción

---

## 🎯 Características Destacadas

1. **Sistema de Tracking en Tiempo Real**
   - GPS del repartidor cada 5 segundos
   - Mapa interactivo con Mapbox
   - ETA y distancia calculados

2. **Códigos de Entrega Inteligentes**
   - Validación con Levenshtein distance
   - Permite errores menores (1-2 caracteres)
   - Deshabilita efectivo si código incorrecto

3. **Gestión de Números de Teléfono**
   - Detecta @lid (Linked Device IDs)
   - Resuelve a números reales
   - Valida formato argentino
   - Permite notificaciones a @lid

4. **Sistema de Balances**
   - Transacciones automáticas
   - Historial completo
   - Pagos del admin

5. **Limpieza Automática**
   - Auto-limpieza de sesiones corruptas
   - Botón de limpieza total en admin

---

## 📝 Notas Importantes

1. **Base de Datos**: SQLite por defecto (perfecto para desarrollo)
2. **Sesiones WhatsApp**: Se guardan en `whatsapp-bot/auth/`
3. **Puertos**:
   - Frontend: 5173
   - Backend: 5000
   - Bot Webhooks: 3001
4. **Variables de Entorno**: Ver `env.example.txt`
5. **Migraciones**: Ejecutar `npx prisma migrate dev` después de cambios en schema

---

## 🐛 Manejo de Errores

### **Bot:**
- Auto-reconexión en desconexiones
- Limpieza automática de sesiones corruptas
- Retry en llamadas API (3 intentos)
- Rate limiting para prevenir spam

### **Backend:**
- Try-catch en todos los endpoints
- Respuestas de error estructuradas
- Logs detallados

### **Frontend:**
- Error boundaries
- Toast notifications para errores
- Loading states
- Validaciones de formularios

---

## 🎨 Estilos y Animaciones

### **Tailwind CSS:**
- Sistema de diseño completo
- Responsive design
- Gradientes y sombras
- Animaciones personalizadas

### **Animaciones CSS:**
- `fadeInUp` - Entrada suave
- `slideDown` - Deslizamiento
- `pulse` - Pulsación
- `bounce` - Rebote
- `shake` - Sacudida (errores)
- `scaleIn` - Escalado
- `shimmer` - Efecto brillo

---

## 📈 Escalabilidad

### **Actual:**
- SQLite (perfecto para desarrollo/pequeño negocio)
- Polling cada 5-10 segundos
- Sin WebSockets (aunque se puede agregar)

### **Para Producción:**
- Migrar a PostgreSQL
- Implementar WebSockets para tiempo real
- Agregar Redis para cache
- Implementar autenticación JWT
- Agregar rate limiting en backend
- Implementar logs estructurados (Winston)

---

## 🔍 Funciones Clave del Código

### **`getCleanNumber(jid)`** (bot.js)
- Función centralizada para números
- Maneja @lid, IDs internos, validación
- Retorna número limpio o null

### **`objectToSnakeCase()`** (server/index.js)
- Convierte camelCase a snake_case
- Para compatibilidad frontend-backend

### **`getRoute()`** (src/lib/mapbox.ts)
- Obtiene ruta de Mapbox Directions API
- Calcula ETA y distancia

### **`handleBadMacError()`** (bot.js)
- Detecta sesiones corruptas
- Limpia automáticamente después de 5 errores
- Reinicia el bot

---

## 📞 Comunicación Entre Componentes

```
Frontend ←→ Backend (REST API)
Backend ←→ Bot (Webhooks HTTP)
Bot ←→ WhatsApp (Baileys WebSocket)
Frontend ←→ Mapbox (API pública)
```

---

## 🎓 Conclusión

Esta es una aplicación completa de delivery con:
- ✅ Bot de WhatsApp funcional
- ✅ Panel de administración completo
- ✅ App de repartidores con GPS
- ✅ Tracking público en tiempo real
- ✅ Sistema de balances
- ✅ Gestión completa de pedidos
- ✅ Notificaciones automáticas
- ✅ Mapas interactivos

**Todo integrado y funcionando en conjunto.**

