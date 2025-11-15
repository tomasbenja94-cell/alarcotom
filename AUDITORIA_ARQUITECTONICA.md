# 🏗️ AUDITORÍA ARQUITECTÓNICA - El Buen Menú

**Fecha:** 2025-01-XX  
**Auditor:** Arquitecto de Software Senior + Fullstack + Product Owner  
**Objetivo:** Análisis, mejoras y extensión del proyecto manteniendo compatibilidad total

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Global del Sistema Actual](#1-resumen-global-del-sistema-actual)
2. [Análisis de Problemas Detectados](#2-análisis-de-problemas-detectados)
3. [Propuesta de Arquitectura Limpia](#3-propuesta-de-arquitectura-limpia)
4. [Servicios y Responsabilidades](#4-servicios-y-responsabilidades)
5. [Estándares de Código](#5-estándares-de-código)
6. [Cambios Recomendados Priorizados](#6-cambios-recomendados-priorizados)

---

## 1. RESUMEN GLOBAL DEL SISTEMA ACTUAL

### 1.1 Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    EL BUEN MENÚ - ECOSISTEMA                 │
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

### 1.2 Tablas Principales y Relaciones

#### **Modelos Core:**

1. **Order** (Pedidos) - ⭐ **ENTIDAD CENTRAL**
   - Relaciones: `items`, `deliveryPerson`, `whatsappMessages`, `pendingTransfers`, `balanceTransactions`
   - Estados: `pending` → `confirmed` → `preparing` → `ready` → `assigned` → `in_transit` → `delivered` / `cancelled`
   - Campos críticos: `customerPhone` (puede ser @lid), `deliveryCode`, `trackingToken`

2. **Customer** (Clientes)
   - Relación: `phone` (único)
   - Campos: `isBlocked`, `disabledPaymentMethods` (JSON)

3. **DeliveryPerson** (Repartidores)
   - Relaciones: `orders`, `balanceTransactions`
   - Campos: `currentOrderId`, `balance`, `lastLat`, `lastLng`, `lastSeenAt`

4. **OrderItem** (Items de pedidos)
   - Relación: `order` (Cascade delete)

5. **DriverBalanceTransaction** (Transacciones de saldo)
   - Tipos: `"delivery"` (+3000), `"pago_admin"`, `"ajuste"`

6. **PendingTransfer** (Transferencias pendientes)
   - Relación: `order`

7. **WhatsAppMessage** (Historial de mensajes)
   - Relación: `order` (opcional)

8. **BotMessage** (Mensajes configurables)
   - Sin relaciones

9. **Product** / **Category** / **ProductOption** (Catálogo)
   - Relaciones estándar

### 1.3 Endpoints Principales (46 endpoints totales)

#### **Categorías y Productos:**
- `GET/POST/PUT/DELETE /api/categories`
- `GET/POST/PUT/DELETE /api/products`
- `GET/POST /api/product-option-categories`
- `GET/POST /api/product-options`

#### **Pedidos (Core):**
- `GET /api/orders` - Listar todos
- `GET /api/orders/:id` - Obtener uno
- `POST /api/orders` - Crear pedido
- `PUT /api/orders/:id` - Actualizar pedido
- `POST /api/orders/:id/approve` - Aprobar pedido
- `POST /api/orders/:id/reject` - Rechazar pedido (cancela)
- `POST /api/orders/:id/cancel` - Cancelar pedido

#### **Repartidores (Delivery):**
- `GET/POST/PUT /api/delivery-persons` - CRUD repartidores
- `POST /api/delivery/login` - Login repartidor
- `POST /api/delivery/location` - Actualizar GPS
- `GET /api/delivery/available-orders` - Pedidos disponibles
- `POST /api/delivery/accept-order` - Aceptar pedido
- `POST /api/delivery/update-order-status` - Actualizar estado
- `POST /api/delivery/deliver-order` - Entregar con código
- `GET /api/delivery/balance/:driver_id` - Ver saldo
- `POST /api/delivery/register-payment` - Registrar pago admin
- `GET /api/delivery/drivers-location` - Ubicaciones en tiempo real
- `POST /api/delivery-persons/:id/accept-order` - **LEGACY** (duplicado)
- `POST /api/delivery-persons/:id/deliver-order` - **LEGACY** (duplicado)

#### **Clientes:**
- `GET/POST/PUT /api/customers`

#### **Tracking:**
- `GET /api/track/:token` - Tracking público

#### **Mensajes:**
- `GET/PUT /api/bot-messages`
- `GET/POST /api/whatsapp-messages`

#### **Transferencias:**
- `GET/POST/PUT /api/pending-transfers`

#### **Admin:**
- `POST /api/admin/clear-all` - Limpieza total

### 1.4 Flujos Principales de Negocio

#### **A) Flujo de Creación de Pedido:**

```
1. CLIENTE EN WEB:
   - Navega a /menu
   - Agrega productos al carrito
   - Completa checkout
   - POST /api/orders (customer_phone vacío)
   - Redirige a WhatsApp con código de pedido

2. CLIENTE EN WHATSAPP:
   - Envía código de pedido al bot
   - Bot busca pedido en DB
   - Bot actualiza customer_phone usando getCleanNumber()
   - Bot muestra confirmación
   - Cliente confirma → Bot actualiza pedido

3. ADMIN:
   - Ve pedido en /admin
   - Aprueba o rechaza
   - Si aprueba: status → "confirmed", notifica cliente
```

#### **B) Flujo de Delivery:**

```
1. REPARTIDOR LOGIN:
   - POST /api/delivery/login
   - Validación simple (sin bcrypt)
   - Retorna datos sin password

2. REPARTIDOR ACEPTA PEDIDO:
   - POST /api/delivery/accept-order
   - Genera deliveryCode (4 dígitos)
   - Genera trackingToken
   - Status → "assigned"
   - Notifica cliente vía webhook

3. REPARTIDOR EN CAMINO:
   - POST /api/delivery/update-order-status (status: "in_transit")
   - NO envía notificación (solo al aceptar)

4. REPARTIDOR ENTREGA:
   - POST /api/delivery/deliver-order
   - Valida código (Levenshtein ≤ 1)
   - Status → "delivered"
   - Balance += 3000
   - Libera repartidor
   - Notifica cliente
```

#### **C) Flujo de Números de Teléfono:**

```
1. MENSAJE ENTRANTE:
   - Bot recibe JID (ej: "5493487207406@s.whatsapp.net" o "180375909310641@lid")
   - getCleanNumber(jid):
     a) Detecta @lid → jidDecode()
     b) Si es ID interno → sock.onWhatsApp()
     c) Valida formato (10-13 dígitos)
     d) Agrega prefijo "54" si tiene 10 dígitos
     e) Retorna número limpio o JID completo (@lid)

2. CREACIÓN DE CLIENTE:
   - Solo si número es válido (no @lid)
   - Si es @lid, se guarda JID para notificaciones

3. NOTIFICACIONES:
   - Backend llama webhook con customerPhone
   - Bot acepta números limpios o JIDs (@lid)
   - Envía mensaje vía Baileys
```

---

## 2. ANÁLISIS DE PROBLEMAS DETECTADOS

### 2.1 Problemas Críticos (Nivel 1) 🔴

#### **A) Seguridad:**

1. **Contraseñas en texto plano**
   - **Ubicación:** `server/index.js:564`, `server/index.js:1096`
   - **Problema:** `password` se guarda y compara sin hash
   - **Riesgo:** Exposición total de credenciales
   - **Impacto:** ALTO

2. **Sin autenticación en admin**
   - **Ubicación:** Todo `/admin/*`
   - **Problema:** Cualquiera puede acceder al panel
   - **Riesgo:** Modificación/eliminación de datos
   - **Impacto:** CRÍTICO

3. **Validación de inputs inconsistente**
   - **Ubicación:** Todos los endpoints
   - **Problema:** No hay validación centralizada
   - **Riesgo:** SQL injection, XSS, datos inválidos
   - **Impacto:** MEDIO-ALTO

#### **B) Lógica de Negocio:**

4. **Endpoints duplicados**
   - **Ubicación:** 
     - `/api/delivery/accept-order` vs `/api/delivery-persons/:id/accept-order`
     - `/api/delivery/deliver-order` vs `/api/delivery-persons/:id/deliver-order`
   - **Problema:** Dos formas de hacer lo mismo
   - **Riesgo:** Confusión, mantenimiento duplicado
   - **Impacto:** MEDIO

5. **Conversión snake_case/camelCase manual**
   - **Ubicación:** `server/index.js:21-41`, todos los endpoints
   - **Problema:** Lógica duplicada, propensa a errores
   - **Riesgo:** Bugs de formato
   - **Impacto:** MEDIO

6. **Manejo de errores inconsistente**
   - **Ubicación:** Todos los endpoints
   - **Problema:** Try/catch repetido, mensajes genéricos
   - **Riesgo:** Errores no capturados, debugging difícil
   - **Impacto:** MEDIO

#### **C) Base de Datos:**

7. **Validación de estados de pedido ausente**
   - **Ubicación:** `PUT /api/orders/:id`, `POST /api/delivery/update-order-status`
   - **Problema:** Se puede cambiar a cualquier estado sin validar transiciones
   - **Riesgo:** Estados inválidos (ej: `delivered` → `pending`)
   - **Impacto:** MEDIO

8. **Falta de índices en campos críticos**
   - **Ubicación:** Schema Prisma
   - **Problema:** `customerPhone`, `trackingToken`, `orderNumber` sin índices explícitos
   - **Riesgo:** Performance en queries grandes
   - **Impacto:** BAJO-MEDIO (aumenta con escala)

### 2.2 Problemas Estructurales (Nivel 2) 🟡

#### **A) Arquitectura:**

9. **Todo en un solo archivo**
   - **Ubicación:** `server/index.js` (1612 líneas)
   - **Problema:** Imposible mantener, testear, escalar
   - **Impacto:** ALTO (mantenibilidad)

10. **Lógica de negocio en controladores**
    - **Ubicación:** Todos los endpoints
    - **Problema:** Controladores hacen queries, validaciones, notificaciones
    - **Impacto:** ALTO (testabilidad, reutilización)

11. **Sin capa de servicios**
    - **Problema:** Lógica duplicada entre endpoints y bot
    - **Ejemplo:** Generación de `orderNumber`, validación de códigos
    - **Impacto:** ALTO (DRY violation)

12. **Sin repositorios**
    - **Problema:** Prisma accedido directamente desde controladores
    - **Impacto:** MEDIO (acoplamiento, testabilidad)

#### **B) Código Duplicado:**

13. **Generación de orderNumber duplicada**
    - **Ubicación:** `server/index.js:298-307`
    - **Problema:** Si se cambia lógica, hay que buscar todos los lugares
    - **Impacto:** MEDIO

14. **Validación de código de entrega duplicada**
    - **Ubicación:** `server/index.js:1339-1361` (Levenshtein)
    - **Problema:** Función inline, no reutilizable
    - **Impacto:** BAJO

15. **Llamadas a webhook duplicadas**
    - **Ubicación:** Múltiples endpoints (approve, reject, accept-order, deliver-order)
    - **Problema:** Mismo código de fetch repetido
    - **Impacto:** MEDIO

#### **C) Nombres y Convenciones:**

16. **Mezcla de snake_case y camelCase**
    - **Problema:** `req.body.customer_name || req.body.customerName`
    - **Impacto:** BAJO (confusión)

17. **Nombres inconsistentes**
    - **Ejemplo:** `driver_id` vs `driverId`, `order_id` vs `orderId`
    - **Impacto:** BAJO

### 2.3 Problemas de Calidad (Nivel 3) 🟢

18. **Logs inconsistentes**
    - **Problema:** Algunos con `console.log`, otros con `logger`
    - **Impacto:** BAJO

19. **Sin tipos TypeScript en backend**
    - **Problema:** Todo en JavaScript, sin validación de tipos
    - **Impacto:** MEDIO (productividad)

20. **Sin tests**
    - **Problema:** No hay tests unitarios ni de integración
    - **Impacto:** ALTO (confianza en cambios)

21. **Documentación de API ausente**
    - **Problema:** No hay Swagger/OpenAPI
    - **Impacto:** BAJO (onboarding)

---

## 3. PROPUESTA DE ARQUITECTURA LIMPIA

### 3.1 Estructura de Carpetas Propuesta

```
server/
├── src/
│   ├── config/
│   │   ├── database.ts          # Configuración de Prisma
│   │   ├── env.ts               # Variables de entorno validadas
│   │   └── constants.ts         # Constantes (estados, tipos, etc.)
│   │
│   ├── routes/
│   │   ├── index.ts             # Agregador de rutas
│   │   ├── orders.routes.ts     # Rutas de pedidos
│   │   ├── delivery.routes.ts   # Rutas de repartidores
│   │   ├── customers.routes.ts  # Rutas de clientes
│   │   ├── products.routes.ts   # Rutas de productos
│   │   ├── admin.routes.ts      # Rutas de admin
│   │   └── tracking.routes.ts   # Rutas de tracking
│   │
│   ├── controllers/
│   │   ├── orders.controller.ts
│   │   ├── delivery.controller.ts
│   │   ├── customers.controller.ts
│   │   ├── products.controller.ts
│   │   ├── admin.controller.ts
│   │   └── tracking.controller.ts
│   │
│   ├── services/
│   │   ├── order.service.ts      # ⭐ Lógica de pedidos
│   │   ├── customer.service.ts   # ⭐ Lógica de clientes
│   │   ├── delivery.service.ts   # ⭐ Lógica de repartidores
│   │   ├── payment.service.ts   # ⭐ Lógica de pagos
│   │   ├── notification.service.ts # ⭐ Notificaciones WhatsApp
│   │   └── phone.service.ts     # ⭐ Normalización de teléfonos
│   │
│   ├── repositories/
│   │   ├── order.repository.ts
│   │   ├── customer.repository.ts
│   │   ├── delivery.repository.ts
│   │   └── base.repository.ts   # Base con métodos comunes
│   │
│   ├── middlewares/
│   │   ├── error-handler.middleware.ts # Manejo centralizado de errores
│   │   ├── validation.middleware.ts    # Validación de inputs
│   │   ├── auth.middleware.ts         # Autenticación (futuro)
│   │   └── logger.middleware.ts       # Logging de requests
│   │
│   ├── utils/
│   │   ├── phone.utils.ts        # Helpers de teléfonos
│   │   ├── order-number.utils.ts # Generación de números
│   │   ├── code-validation.utils.ts # Validación de códigos
│   │   ├── response.utils.ts     # Formateo de respuestas
│   │   └── snake-case.utils.ts   # Conversión snake_case
│   │
│   ├── integrations/
│   │   ├── whatsapp.client.ts    # Cliente para webhooks del bot
│   │   └── mapbox.client.ts     # Cliente de Mapbox (futuro)
│   │
│   ├── types/
│   │   ├── order.types.ts        # Tipos de pedidos
│   │   ├── delivery.types.ts      # Tipos de repartidores
│   │   ├── customer.types.ts    # Tipos de clientes
│   │   └── common.types.ts       # Tipos comunes
│   │
│   └── app.ts                    # Configuración de Express
│
├── index.js                      # Entry point (importa app.ts)
├── prisma/
│   └── schema.prisma
└── package.json
```

### 3.2 Responsabilidades por Capa

#### **Routes (Rutas):**
- **Qué hace:** Define endpoints HTTP, delega a controladores
- **Qué NO hace:** Lógica de negocio, validaciones complejas, queries a DB
- **Ejemplo:**
```typescript
// routes/orders.routes.ts
router.post('/orders', 
  validateOrderCreate,  // Middleware de validación
  ordersController.create
);
```

#### **Controllers (Controladores):**
- **Qué hace:** Extrae datos de `req`, llama a servicios, formatea respuesta
- **Qué NO hace:** Lógica de negocio, queries directas a DB, validaciones complejas
- **Ejemplo:**
```typescript
// controllers/orders.controller.ts
async create(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.createOrder(req.body);
    res.json(formatResponse(order));
  } catch (error) {
    next(error); // Pasa al error handler
  }
}
```

#### **Services (Servicios):**
- **Qué hace:** Lógica de negocio, orquesta repositorios, valida reglas
- **Qué NO hace:** Queries directas a Prisma, formateo de HTTP responses
- **Ejemplo:**
```typescript
// services/order.service.ts
async createOrder(data: CreateOrderDto) {
  // Validar datos
  // Generar orderNumber
  // Crear en DB
  // Notificar cliente
  // Retornar orden creada
}
```

#### **Repositories (Repositorios):**
- **Qué hace:** Acceso a datos, queries a Prisma, transformaciones básicas
- **Qué NO hace:** Lógica de negocio, validaciones complejas
- **Ejemplo:**
```typescript
// repositories/order.repository.ts
async findById(id: string) {
  return prisma.order.findUnique({ where: { id }, include: { items: true } });
}
```

#### **Middlewares:**
- **Qué hace:** Validación, autenticación, logging, manejo de errores
- **Qué NO hace:** Lógica de negocio

#### **Utils:**
- **Qué hace:** Funciones puras, helpers reutilizables
- **Qué NO hace:** Acceso a DB, lógica de negocio

#### **Integrations:**
- **Qué hace:** Clientes HTTP, SDKs externos (WhatsApp, Mapbox)
- **Qué NO hace:** Lógica de negocio

### 3.3 Convenciones de Nombres

#### **Archivos:**
- **Controllers:** `*.controller.ts`
- **Services:** `*.service.ts`
- **Repositories:** `*.repository.ts`
- **Routes:** `*.routes.ts`
- **Middlewares:** `*.middleware.ts`
- **Utils:** `*.utils.ts`
- **Types:** `*.types.ts`

#### **Funciones:**
- **Services:** Verbos en infinitivo (`createOrder`, `updateOrderStatus`)
- **Repositories:** Verbos de acceso (`findById`, `create`, `update`)
- **Utils:** Verbos descriptivos (`normalizePhone`, `generateOrderNumber`)

#### **Variables:**
- **camelCase** para variables y funciones
- **PascalCase** para clases y tipos
- **UPPER_SNAKE_CASE** para constantes

---

## 4. SERVICIOS Y RESPONSABILIDADES

### 4.1 OrderService

**Responsabilidad:** Gestionar el ciclo de vida completo de pedidos

#### **Funciones Principales:**

```typescript
class OrderService {
  // Crear pedido desde web (sin teléfono)
  async createOrderFromWeb(data: CreateOrderFromWebDto): Promise<Order>
  
  // Crear pedido desde WhatsApp
  async createOrderFromWhatsApp(data: CreateOrderFromWhatsAppDto): Promise<Order>
  
  // Actualizar estado de pedido (con validación de transiciones)
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, actor: 'admin' | 'driver'): Promise<Order>
  
  // Aprobar pedido
  async approveOrder(orderId: string): Promise<Order>
  
  // Rechazar pedido
  async rejectOrder(orderId: string, reason?: string): Promise<Order>
  
  // Asignar repartidor a pedido
  async assignDriver(orderId: string, driverId: string): Promise<Order>
  
  // Marcar pedido como entregado
  async markOrderDelivered(orderId: string, driverId: string, deliveryCode: string): Promise<Order>
  
  // Generar número de pedido único
  private async generateOrderNumber(): Promise<string>
  
  // Validar transición de estado
  private validateStatusTransition(current: OrderStatus, next: OrderStatus, actor: string): boolean
}
```

### 4.2 CustomerService

**Responsabilidad:** Gestión de clientes y normalización de teléfonos

#### **Funciones Principales:**

```typescript
class CustomerService {
  // Crear o actualizar cliente por teléfono
  async upsertCustomerByPhone(phone: string, data: Partial<Customer>): Promise<Customer>
  
  // Normalizar número de teléfono
  normalizePhone(jid: string): Promise<string | null>
  
  // Validar si número es válido (no @lid, no ID interno)
  isValidPhoneNumber(phone: string): boolean
  
  // Bloquear cliente
  async blockCustomer(phone: string, reason?: string): Promise<Customer>
  
  // Desbloquear cliente
  async unblockCustomer(phone: string): Promise<Customer>
  
  // Deshabilitar método de pago para cliente
  async disablePaymentMethod(phone: string, method: PaymentMethod): Promise<Customer>
  
  // Obtener cliente por teléfono
  async getCustomerByPhone(phone: string): Promise<Customer | null>
}
```

### 4.3 DeliveryService

**Responsabilidad:** Gestión de repartidores y entregas

#### **Funciones Principales:**

```typescript
class DeliveryService {
  // Login de repartidor
  async loginDriver(username: string, password: string): Promise<Driver>
  
  // Actualizar ubicación GPS
  async updateDriverLocation(driverId: string, lat: number, lng: number): Promise<Driver>
  
  // Listar pedidos disponibles
  async getAvailableOrders(): Promise<Order[]>
  
  // Aceptar pedido
  async acceptOrder(driverId: string, orderId: string): Promise<Order>
  
  // Actualizar estado de pedido (sin notificaciones)
  async updateOrderStatus(driverId: string, orderId: string, status: OrderStatus): Promise<Order>
  
  // Entregar pedido con código
  async deliverOrder(driverId: string, orderId: string, deliveryCode: string): Promise<DeliveryResult>
  
  // Obtener balance y transacciones
  async getDriverBalance(driverId: string): Promise<DriverBalance>
  
  // Registrar pago del admin
  async registerAdminPayment(driverId: string, amount: number, reference?: string): Promise<Transaction>
  
  // Obtener ubicaciones de todos los repartidores
  async getDriversLocation(): Promise<DriverLocation[]>
  
  // Generar código de entrega
  private generateDeliveryCode(): string
  
  // Generar tracking token
  private generateTrackingToken(): string
  
  // Validar código de entrega (Levenshtein)
  private validateDeliveryCode(input: string, expected: string): boolean
}
```

### 4.4 PaymentService

**Responsabilidad:** Gestión de pagos y transferencias

#### **Funciones Principales:**

```typescript
class PaymentService {
  // Manejar pago en efectivo
  async handleCashPayment(orderId: string): Promise<Order>
  
  // Manejar pago por transferencia
  async handleTransferPayment(orderId: string, proofImageUrl: string, reference?: string): Promise<PendingTransfer>
  
  // Manejar pago con Mercado Pago
  async handleMercadoPagoPayment(orderId: string, paymentId: string): Promise<Order>
  
  // Registrar comprobante de transferencia
  async registerTransferProof(orderId: string, proofImageUrl: string, reference?: string): Promise<PendingTransfer>
  
  // Verificar transferencia
  async verifyTransfer(transferId: string): Promise<PendingTransfer>
  
  // Actualizar estado de pago
  async updatePaymentStatus(orderId: string, status: PaymentStatus): Promise<Order>
}
```

### 4.5 NotificationService

**Responsabilidad:** Envío de notificaciones WhatsApp

#### **Funciones Principales:**

```typescript
class NotificationService {
  // Notificar cliente por WhatsApp
  async notifyCustomer(phone: string, message: string, orderId?: string): Promise<void>
  
  // Notificar aprobación de pedido
  async notifyOrderApproved(orderId: string): Promise<void>
  
  // Notificar rechazo de pedido
  async notifyOrderRejected(orderId: string, reason?: string): Promise<void>
  
  // Notificar pedido en camino
  async notifyOrderInTransit(orderId: string, deliveryCode: string, trackingUrl: string): Promise<void>
  
  // Notificar pedido entregado
  async notifyOrderDelivered(orderId: string): Promise<void>
  
  // Notificar admin de nuevo pedido (futuro)
  async notifyAdminNewOrder(orderId: string): Promise<void>
}
```

### 4.6 PhoneService (Utils)

**Responsabilidad:** Normalización y validación de números

#### **Funciones Principales:**

```typescript
class PhoneUtils {
  // Normalizar JID a número limpio (similar a getCleanNumber actual)
  static async normalizeJid(jid: string, sock?: any): Promise<string | null>
  
  // Validar formato de número
  static isValidFormat(phone: string): boolean
  
  // Detectar si es ID interno
  static isInternalId(phone: string): boolean
  
  // Agregar prefijo argentino
  static addArgentinaPrefix(phone: string): string
  
  // Detectar si es @lid
  static isLidJid(jid: string): boolean
}
```

---

## 5. ESTÁNDARES DE CÓDIGO

### 5.1 Convenciones de Nombres

#### **Archivos:**
- `kebab-case.ts` para archivos (ej: `order.service.ts`)
- `PascalCase.ts` para componentes/clases principales

#### **Funciones:**
- `camelCase` para funciones y métodos
- Verbos descriptivos: `createOrder`, `updateOrderStatus`, `validatePhoneNumber`

#### **Variables:**
- `camelCase` para variables
- `UPPER_SNAKE_CASE` para constantes
- `_camelCase` para variables privadas (opcional)

#### **Tipos/Interfaces:**
- `PascalCase` para tipos e interfaces
- Sufijos descriptivos: `CreateOrderDto`, `OrderStatus`, `DeliveryResult`

### 5.2 Buenas Prácticas

#### **A) Manejo de Errores:**

```typescript
// ❌ MAL: Try/catch en cada función
async function createOrder(data) {
  try {
    // lógica
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// ✅ BIEN: Error handler centralizado
async function createOrder(data) {
  // lógica sin try/catch
  // Errores se propagan al middleware
}

// Middleware de errores
app.use((error, req, res, next) => {
  logger.error(error);
  res.status(error.status || 500).json({ error: error.message });
});
```

#### **B) Validación de Inputs:**

```typescript
// ❌ MAL: Validación manual en cada endpoint
app.post('/orders', async (req, res) => {
  if (!req.body.customer_name) {
    return res.status(400).json({ error: 'customer_name requerido' });
  }
  // ...
});

// ✅ BIEN: Middleware de validación
import { body, validationResult } from 'express-validator';

const validateOrderCreate = [
  body('customer_name').notEmpty().withMessage('customer_name es requerido'),
  body('total').isFloat({ min: 0 }).withMessage('total debe ser positivo'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

router.post('/orders', validateOrderCreate, ordersController.create);
```

#### **C) Logging:**

```typescript
// ❌ MAL: console.log mezclado
console.log('Creando pedido');
console.error('Error:', error);

// ✅ BIEN: Logger estructurado
import logger from './utils/logger';

logger.info('Creando pedido', { orderId, customerName });
logger.error('Error al crear pedido', { error, orderId, stack: error.stack });
```

#### **D) Controladores:**

```typescript
// ❌ MAL: Lógica de negocio en controlador
app.post('/orders', async (req, res) => {
  const lastOrder = await prisma.order.findFirst({...});
  let orderNumber = '#0001';
  if (lastOrder) {
    orderNumber = `#${...}`;
  }
  const order = await prisma.order.create({...});
  await fetch('http://localhost:3001/notify-order', {...});
  res.json(order);
});

// ✅ BIEN: Controlador delgado
class OrdersController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.createOrderFromWeb(req.body);
      res.status(201).json(formatResponse(order));
    } catch (error) {
      next(error);
    }
  }
}
```

### 5.3 Estructura de Respuestas

```typescript
// Formato estándar de respuesta
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Helper para formatear respuestas
function formatResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function formatError(message: string): ApiResponse<null> {
  return { success: false, error: message };
}
```

---

## 6. CAMBIOS RECOMENDADOS PRIORIZADOS

### 🔴 NIVEL 1: Cambios Seguros y Urgentes

#### **1.1 Implementar Hash de Contraseñas**
- **Prioridad:** CRÍTICA
- **Esfuerzo:** BAJO (2-3 horas)
- **Riesgo:** BAJO (solo afecta login)
- **Acción:**
  - Instalar `bcrypt`
  - Hashear al crear repartidor
  - Comparar con `bcrypt.compare` en login
- **Archivos afectados:** `server/index.js:543-579`, `server/index.js:1077-1111`

#### **1.2 Agregar Validación de Estados de Pedido**
- **Prioridad:** ALTA
- **Esfuerzo:** MEDIO (4-6 horas)
- **Riesgo:** BAJO (solo valida transiciones)
- **Acción:**
  - Crear `utils/order-status.utils.ts` con máquina de estados
  - Validar en `updateOrderStatus`
- **Archivos afectados:** `server/index.js:349-397`, `server/index.js:1281-1311`

#### **1.3 Centralizar Manejo de Errores**
- **Prioridad:** ALTA
- **Esfuerzo:** MEDIO (3-4 horas)
- **Riesgo:** BAJO (solo mejora)
- **Acción:**
  - Crear `middlewares/error-handler.middleware.ts`
  - Reemplazar try/catch en controladores
- **Archivos afectados:** Todos los endpoints

#### **1.4 Eliminar Endpoints Duplicados**
- **Prioridad:** MEDIA
- **Esfuerzo:** BAJO (1 hora)
- **Riesgo:** BAJO (solo eliminar código)
- **Acción:**
  - Eliminar `/api/delivery-persons/:id/accept-order`
  - Eliminar `/api/delivery-persons/:id/deliver-order`
  - Actualizar frontend si los usa
- **Archivos afectados:** `server/index.js:609-689`, `server/index.js:692-825`

#### **1.5 Agregar Validación de Inputs**
- **Prioridad:** ALTA
- **Esfuerzo:** MEDIO (6-8 horas)
- **Riesgo:** BAJO (solo valida)
- **Acción:**
  - Instalar `express-validator`
  - Crear middlewares de validación por endpoint
- **Archivos afectados:** Todos los POST/PUT

### 🟡 NIVEL 2: Mejoras Estructurales

#### **2.1 Separar en Capas (Controllers/Services/Repositories)**
- **Prioridad:** ALTA
- **Esfuerzo:** ALTO (20-30 horas)
- **Riesgo:** MEDIO (refactor grande)
- **Acción:**
  - Crear estructura de carpetas
  - Mover lógica a servicios
  - Crear repositorios
  - Actualizar controladores
- **Archivos afectados:** Todo `server/index.js`

#### **2.2 Extraer Servicios Principales**
- **Prioridad:** ALTA
- **Esfuerzo:** ALTO (15-20 horas)
- **Riesgo:** MEDIO
- **Acción:**
  - `OrderService`: Lógica de pedidos
  - `CustomerService`: Lógica de clientes
  - `DeliveryService`: Lógica de repartidores
  - `NotificationService`: Notificaciones
- **Archivos afectados:** `server/index.js`, nuevo `src/services/`

#### **2.3 Centralizar Conversión snake_case**
- **Prioridad:** MEDIA
- **Esfuerzo:** BAJO (2 horas)
- **Riesgo:** BAJO
- **Acción:**
  - Mover `objectToSnakeCase` a `utils/snake-case.utils.ts`
  - Usar en middleware de respuesta
- **Archivos afectados:** `server/index.js:21-41`

#### **2.4 Extraer Utils Reutilizables**
- **Prioridad:** MEDIA
- **Esfuerzo:** MEDIO (4-6 horas)
- **Riesgo:** BAJO
- **Acción:**
  - `phone.utils.ts`: Normalización de teléfonos
  - `order-number.utils.ts`: Generación de números
  - `code-validation.utils.ts`: Validación de códigos
- **Archivos afectados:** `server/index.js`, `whatsapp-bot/src/bot.js`

### 🟢 NIVEL 3: Mejoras de Calidad

#### **3.1 Agregar TypeScript al Backend**
- **Prioridad:** MEDIA
- **Esfuerzo:** ALTO (15-20 horas)
- **Riesgo:** MEDIO (migración)
- **Acción:**
  - Instalar TypeScript
  - Convertir `.js` a `.ts`
  - Agregar tipos desde Prisma
- **Archivos afectados:** Todo `server/`

#### **3.2 Implementar Tests**
- **Prioridad:** MEDIA
- **Esfuerzo:** ALTO (20-30 horas)
- **Riesgo:** BAJO
- **Acción:**
  - Instalar Jest
  - Tests unitarios de servicios
  - Tests de integración de endpoints
- **Archivos afectados:** Nuevo `server/tests/`

#### **3.3 Agregar Autenticación JWT para Admin**
- **Prioridad:** MEDIA
- **Esfuerzo:** MEDIO (8-10 horas)
- **Riesgo:** MEDIO (cambia flujo)
- **Acción:**
  - Instalar `jsonwebtoken`
  - Crear `auth.middleware.ts`
  - Proteger rutas `/admin/*`
- **Archivos afectados:** Nuevo `middlewares/auth.middleware.ts`, rutas admin

#### **3.4 Documentar API con Swagger**
- **Prioridad:** BAJA
- **Esfuerzo:** MEDIO (6-8 horas)
- **Riesgo:** BAJO
- **Acción:**
  - Instalar `swagger-jsdoc`, `swagger-ui-express`
  - Documentar endpoints
- **Archivos afectados:** Nuevo `docs/swagger.ts`

#### **3.5 Agregar Índices en DB**
- **Prioridad:** BAJA
- **Esfuerzo:** BAJO (1 hora)
- **Riesgo:** BAJO
- **Acción:**
  - Agregar `@@index` en Prisma schema
  - Migrar
- **Archivos afectados:** `server/prisma/schema.prisma`

---

## 📝 PLAN DE IMPLEMENTACIÓN SUGERIDO

### **Fase 1: Seguridad y Estabilidad (Semana 1)**
1. Hash de contraseñas
2. Validación de estados
3. Manejo centralizado de errores
4. Validación de inputs básica

### **Fase 2: Refactor Estructural (Semanas 2-3)**
1. Crear estructura de carpetas
2. Extraer servicios principales
3. Crear repositorios
4. Actualizar controladores

### **Fase 3: Calidad y Testing (Semana 4)**
1. Agregar TypeScript
2. Implementar tests básicos
3. Documentar API

### **Fase 4: Mejoras Adicionales (Opcional)**
1. Autenticación JWT
2. Optimizaciones de performance
3. Monitoreo y métricas

---

## ✅ CHECKLIST DE COMPATIBILIDAD

Antes de implementar cambios, verificar:

- [ ] Endpoints existentes siguen funcionando
- [ ] Frontend no se rompe
- [ ] Bot de WhatsApp sigue funcionando
- [ ] Migraciones de DB son reversibles
- [ ] Variables de entorno no cambian
- [ ] Formato de respuestas se mantiene (snake_case)

---

## 🎯 CONCLUSIÓN

El proyecto tiene una **base sólida** pero necesita:

1. **Seguridad:** Hash de contraseñas, validación de inputs
2. **Estructura:** Separar en capas (controllers/services/repositories)
3. **Mantenibilidad:** Extraer lógica duplicada, centralizar utilidades
4. **Calidad:** TypeScript, tests, documentación

**Prioridad:** Empezar con Nivel 1 (seguridad y estabilidad), luego Nivel 2 (estructura), finalmente Nivel 3 (calidad).

**Riesgo:** Bajo si se implementa por fases, manteniendo compatibilidad en cada paso.

---

**Próximos Pasos:** 
1. Revisar este documento
2. Aprobar plan de implementación
3. Comenzar con Fase 1 (Nivel 1)
4. Implementar por partes, validando en cada paso

