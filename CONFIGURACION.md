# ⚙️ Guía de Configuración del Proyecto

## 🚀 Inicio Rápido

### 1. Instalar Dependencias

```bash
# Instalar dependencias del frontend
npm install

# Instalar dependencias del servidor
cd server
npm install
cd ..

# Instalar dependencias del bot de WhatsApp
cd whatsapp-bot
npm install
cd ..
```

### 2. Configurar Base de Datos

El proyecto usa **SQLite por defecto** (no requiere instalación adicional).

1. **Generar cliente de Prisma:**
   ```bash
   cd server
   npx prisma generate
   ```

2. **Crear la base de datos:**
   ```bash
   npx prisma migrate dev --name init
   ```

3. **Configurar variables de entorno:**
   ```bash
   # Crear archivo .env en la raíz
   cp env.example.txt .env
   ```

   Edita `.env`:
   ```env
   VITE_API_URL=http://localhost:5000/api
   PORT=5000
   ```

### 3. Iniciar el Proyecto

**Terminal 1 - Servidor Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

**Terminal 3 - Bot de WhatsApp (opcional):**
```bash
cd whatsapp-bot
npm run dev
```

## 📁 Estructura del Proyecto

```
whatsappkevein/
├── src/                    # Frontend React + TypeScript
│   ├── lib/
│   │   ├── api.ts         # Cliente API (reemplaza Supabase)
│   │   └── supabase.ts    # Compatibilidad (redirige a api.ts)
│   └── pages/             # Páginas de la aplicación
├── server/                 # Backend Express + Prisma
│   ├── index.js           # Servidor API
│   └── package.json
├── prisma/                 # Schema de Prisma
│   └── schema.prisma      # Definición de la base de datos
├── whatsapp-bot/          # Bot de WhatsApp
└── .env                   # Variables de entorno
```

## 🗄️ Base de Datos

### SQLite (Por defecto)
- No requiere instalación
- Archivo: `prisma/dev.db`
- Perfecto para desarrollo

### PostgreSQL (Opcional)
Si prefieres PostgreSQL:

1. Edita `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Configura `DATABASE_URL` en `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/whatsapp_pedidos"
   ```

3. Ejecuta migraciones:
   ```bash
   cd server
   npx prisma migrate dev
   ```

## 🔧 API Endpoints

El servidor expone estos endpoints:

- `GET /api/categories` - Obtener categorías
- `POST /api/categories` - Crear categoría
- `GET /api/products` - Obtener productos
- `POST /api/products` - Crear producto
- `GET /api/orders` - Obtener pedidos
- `POST /api/orders` - Crear pedido
- `GET /api/bot-messages` - Obtener mensajes del bot
- `GET /api/pending-transfers` - Obtener transferencias pendientes

## 📝 Notas

- El frontend ahora usa `src/lib/api.ts` en lugar de Supabase
- Se mantiene compatibilidad con el código existente mediante `supabase.ts`
- La base de datos es SQLite por defecto (sin configuración adicional)
- Para producción, considera usar PostgreSQL

## 🆘 Problemas Comunes

**Error: "Cannot find module '@prisma/client'"**
- Ejecuta: `cd server && npx prisma generate`

**Error: "Database does not exist"**
- Ejecuta: `cd server && npx prisma migrate dev`

**Error: "Connection refused"**
- Verifica que el servidor esté corriendo en el puerto 5000
- Revisa `VITE_API_URL` en `.env`
