import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

// Importar servicios y middlewares de seguridad
import { hashPassword } from './src/services/auth.service.js';
import { driverAuthService } from './src/services/auth.service.js';
import { balanceService } from './src/services/balance.service.js';
import { deliveryCodeService } from './src/services/delivery-code.service.js';
import { auditService } from './src/services/audit.service.js';
import { authenticateDriver, authorizeDriver, authenticateAdmin, authorize, validateApiKey } from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validation.middleware.js';
import { securityHeaders, corsMiddleware, generalRateLimit, loginRateLimit, deliveryCodeRateLimit, deliveryLocationRateLimit, deliveryPollingRateLimit } from './src/middlewares/security.middleware.js';
import { userRateLimit, ipRateLimit, endpointRateLimit, criticalActionRateLimit, createResourceRateLimit } from './src/middlewares/rate-limit-advanced.middleware.js';
import { verifyWebhookSignature, validateWebhookApiKey } from './src/middlewares/webhook-auth.middleware.js';
import { idempotencyMiddleware, webhookIdempotencyMiddleware } from './src/middlewares/idempotency.middleware.js';
import { errorHandler } from './src/middlewares/error-handler.middleware.js';
import { createDeliveryPersonSchema, loginDriverSchema, locationUpdateSchema, deliverOrderSchema, registerPaymentSchema, cancelDeliverySchema } from './src/validators/index.js';
import { sendWebhookWithApiKey, sendWebhookWithIdempotency } from './src/utils/webhook-client.utils.js';
import { orderStateValidator } from './src/services/order-state-validator.service.js';
import { spamDetectorService } from './src/services/spam-detector.service.js';
import adminRoutes from './src/routes/admin.routes.js';
import deliveryRoutes from './src/routes/delivery.routes.js';
import monitoringRoutes from './src/routes/monitoring.routes.js';
import statsRoutes from './src/routes/stats.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Configurar trust proxy para rate limiting detrás de proxy/load balancer
// Solo confiar en el primer proxy (más seguro que trust proxy: true)
app.set('trust proxy', 1);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// ========== MERCADO PAGO CONFIGURATION ==========
let mercadoPagoAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
let mercadoPagoPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
let mercadoPagoConfigured = false;
let mercadoPagoConfig = null; // Instancia de MercadoPagoConfig
let preferenceClient = null; // Cliente de Preference

// Función para cargar configuración de Mercado Pago desde la base de datos
async function loadMercadoPagoConfig() {
  try {
    // Primero intentar desde variables de entorno (prioridad)
    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      mercadoPagoAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      mercadoPagoPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
    } else {
      // Intentar cargar desde la base de datos
      try {
        const setting = await prisma.setting.findUnique({
          where: { key: 'payment_config' }
        });
        
        if (setting && setting.value) {
          const config = JSON.parse(setting.value);
          if (config.mercadoPago && config.mercadoPago.accessToken) {
            mercadoPagoAccessToken = config.mercadoPago.accessToken;
            mercadoPagoPublicKey = config.mercadoPago.publicKey || null;
            console.log('✅ Configuración de Mercado Pago cargada desde la base de datos');
          }
        }
      } catch (dbError) {
        // Si no existe la tabla settings aún, continuar sin configuración
        console.warn('⚠️ No se pudo cargar configuración de la base de datos (puede ser que la tabla settings no exista aún):', dbError.message);
      }
    }
    
    // Configurar Mercado Pago si tenemos el token
    if (mercadoPagoAccessToken) {
      try {
        mercadoPagoConfig = new MercadoPagoConfig({
          accessToken: mercadoPagoAccessToken
        });
        preferenceClient = new Preference(mercadoPagoConfig);
        mercadoPagoConfigured = true;
        console.log('✅ Mercado Pago configurado correctamente');
      } catch (error) {
        console.error('⚠️ Error al configurar Mercado Pago:', error.message);
        console.log('⚠️ Los links de Mercado Pago usarán el fallback estático');
      }
    } else {
      console.warn('⚠️ MERCADOPAGO_ACCESS_TOKEN no está configurado. Los links de Mercado Pago usarán el fallback estático.');
    }
  } catch (error) {
    console.warn('⚠️ Error al cargar configuración de Mercado Pago:', error.message);
  }
}

// Cargar configuración al iniciar el servidor (sin bloquear el inicio)
loadMercadoPagoConfig().catch((error) => {
  console.warn('⚠️ Error al cargar configuración de Mercado Pago al iniciar:', error.message);
});

// ========== FUNCIONES IUC (IDENTIFICADOR ÚNICO DE CLIENTE) ==========
// Generar IUC único de 4 dígitos
async function generateUniqueIUC() {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    // Generar número aleatorio de 4 dígitos (1000-9999)
    const iuc = String(Math.floor(1000 + Math.random() * 9000));
    
    // Verificar que no exista
    const existing = await prisma.customer.findUnique({
      where: { iuc }
    });
    
    if (!existing) {
      return iuc;
    }
    
    attempts++;
  }
  
  // Si no se encuentra después de 100 intentos, usar timestamp + random
  const fallback = String(Date.now()).slice(-4).padStart(4, '0');
  console.warn(`⚠️ No se pudo generar IUC único después de ${maxAttempts} intentos, usando fallback: ${fallback}`);
  return fallback;
}

// ========== FUNCIONES CÓDIGO ÚNICO DE PEDIDO ==========
// Generar código único de 4 dígitos para pedidos
async function generateUniqueOrderCode() {
  try {
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      // Generar número aleatorio de 4 dígitos (1000-9999)
      const code = String(Math.floor(1000 + Math.random() * 9000));
      
      // Verificar que no exista en ningún pedido
      // Si la migración no está aplicada, esto fallará y retornará null
      try {
        const existing = await prisma.order.findFirst({
          where: { uniqueCode: code }
        });
        
        if (!existing) {
          return code;
        }
      } catch (queryError) {
        // Si la query falla (migración no aplicada), retornar null
        if (queryError.message && (queryError.message.includes('uniqueCode') || queryError.message.includes('unique_code') || queryError.message.includes('Unknown argument'))) {
          console.warn('⚠️ No se puede verificar uniqueCode (migración no aplicada)');
          return null;
        }
        throw queryError;
      }
      
      attempts++;
    }
    
    // Si no se encuentra después de 100 intentos, usar timestamp + random
    const fallback = String(Date.now()).slice(-4).padStart(4, '0');
    console.warn(`⚠️ No se pudo generar código único de pedido después de ${maxAttempts} intentos, usando fallback: ${fallback}`);
    return fallback;
  } catch (error) {
    // Si hay cualquier error, retornar null (migración no aplicada)
    console.warn('⚠️ Error al generar uniqueCode:', error.message);
    return null;
  }
}

// Asignar IUC al cliente si no tiene uno y el pedido es válido (approved/paid)
async function assignIUCIfNeeded(customerPhone) {
  if (!customerPhone) return null;
  
  try {
    // Usar upsert para evitar errores de duplicado (race condition)
    let customer = await prisma.customer.upsert({
      where: { phone: customerPhone },
      update: {}, // Si existe, no actualizar nada
      create: {
        phone: customerPhone,
        name: null,
        isBlocked: false
      }
    });
    
    // Si ya tiene IUC, retornarlo
    if (customer.iuc) {
      return customer.iuc;
    }
    
    // Verificar si tiene al menos un pedido válido (approved/paid o delivered)
    const validOrders = await prisma.order.findMany({
      where: {
        customerPhone: customerPhone,
        OR: [
          { paymentStatus: 'approved' },
          { paymentStatus: 'paid' },
          { status: 'delivered' }
        ]
      },
      take: 1
    });
    
    // Solo asignar IUC si tiene al menos un pedido válido
    if (validOrders.length > 0) {
      const iuc = await generateUniqueIUC();
      
      // Actualizar cliente con IUC
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { iuc }
      });
      
      console.log(`✅ IUC asignado a cliente ${customerPhone}: ${iuc}`);
      return iuc;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error asignando IUC:', error);
    return null;
  }
}

// ========== SERVIR ARCHIVOS ESTÁTICOS ANTES DE SEGURIDAD (IMPORTANTE) ==========
// Servir archivos estáticos de comprobantes con CORS completo
// Esta ruta DEBE estar ANTES de los middlewares de seguridad para evitar que Helmet bloquee las imágenes
app.use('/proofs', (req, res, next) => {
  // Headers CORS completos
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  
  // Si es una petición OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
}, express.static(path.join(__dirname, '../whatsapp-bot/proofs'), {
  // Opciones adicionales para servir archivos estáticos
  setHeaders: (res, filePath) => {
    // Permitir que las imágenes se carguen desde cualquier origen
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
    
    // Headers de cache y tipo de contenido
    const ext = path.extname(filePath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.pdf'].includes(ext)) {
      const contentType = ext === '.pdf' ? 'application/pdf' : `image/${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}`;
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=31536000');
    }
  },
  dotfiles: 'ignore',
  index: false
}));

// ========== MIDDLEWARES DE SEGURIDAD ==========
app.use(securityHeaders); // Headers de seguridad
app.use(corsMiddleware); // CORS configurado
app.use(express.json({ limit: '50mb' })); // Aumentar límite para imágenes en base64
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Para form-data
// Rate limiting general (excluye delivery autenticado)
app.use(generalRateLimit); // Rate limiting general
// ipRateLimit deshabilitado para evitar bloqueos de IP en desarrollo
// app.use(ipRateLimit); // Rate limiting avanzado por IP
app.use(idempotencyMiddleware); // Idempotencia global

// ========== RUTAS DE AUTENTICACIÓN ==========
app.use('/api/admin', adminRoutes); // Rutas de admin
app.use('/api/delivery', deliveryRoutes); // Rutas adicionales de repartidores
app.use('/api/monitoring', monitoringRoutes); // Rutas de monitoring (solo admin)
app.use('/api', statsRoutes); // Rutas de estadísticas (montado en /api, rutas internas: /stats/sales)

// ========== HELPER: Convertir camelCase a snake_case ==========
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function objectToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => objectToSnakeCase(item));
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const newObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const snakeKey = toSnakeCase(key);
        newObj[snakeKey] = objectToSnakeCase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

// ========== RUTA RAÍZ ==========
app.get('/', (req, res) => {
  res.json({
    message: 'API de Pedidos WhatsApp',
    version: '1.0.0',
    endpoints: {
      categories: '/api/categories',
      products: '/api/products',
      orders: '/api/orders',
      botMessages: '/api/bot-messages',
      whatsappMessages: '/api/whatsapp-messages',
      pendingTransfers: '/api/pending-transfers'
    }
  });
});

// ========== CATEGORÍAS ==========
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(objectToSnakeCase(categories));
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const categoryData = {
      name: req.body.name,
      description: req.body.description,
      imageUrl: req.body.image_url || req.body.imageUrl,
      displayOrder: req.body.display_order || req.body.displayOrder || 0,
      isActive: req.body.is_active !== undefined ? req.body.is_active : (req.body.isActive !== undefined ? req.body.isActive : true)
    };
    const category = await prisma.category.create({
      data: categoryData
    });
    res.json(objectToSnakeCase(category));
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    // Validar que la categoría existe
    const existingCategory = await prisma.category.findUnique({
      where: { id: req.params.id }
    });
    
    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    // Construir objeto de datos solo con los campos proporcionados
    const categoryData = {};
    if (req.body.name !== undefined) {
      categoryData.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      categoryData.description = req.body.description;
    }
    if (req.body.image_url !== undefined || req.body.imageUrl !== undefined) {
      const imageValue = req.body.image_url || req.body.imageUrl;
      // Permitir null o string vacío para eliminar la imagen
      categoryData.imageUrl = imageValue === '' ? null : imageValue;
    }
    if (req.body.display_order !== undefined || req.body.displayOrder !== undefined) {
      categoryData.displayOrder = req.body.display_order || req.body.displayOrder;
    }
    if (req.body.is_active !== undefined || req.body.isActive !== undefined) {
      categoryData.isActive = req.body.is_active !== undefined ? req.body.is_active : req.body.isActive;
    }
    
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: categoryData
    });
    res.json(objectToSnakeCase(category));
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await prisma.category.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

// ========== PRODUCTOS ==========
// ========== INGREDIENTS ENDPOINTS ==========
app.get('/api/ingredients', corsMiddleware, async (req, res) => {
  try {
    // Verificar primero si la tabla existe intentando una query simple
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(ingredients.map(ing => objectToSnakeCase(ing)));
  } catch (error) {
    console.error('❌ [INGREDIENTS] Error fetching ingredients:', error);
    console.error('❌ [INGREDIENTS] Error message:', error.message);
    console.error('❌ [INGREDIENTS] Error code:', error.code);
    console.error('❌ [INGREDIENTS] Error meta:', error.meta);
    
    // Si el error es que la tabla no existe, dar un mensaje más claro
    if (error.message && error.message.includes('does not exist')) {
      return res.status(500).json({ 
        error: 'La tabla ingredients no existe en la base de datos. Ejecuta el SQL de creación en Supabase.',
        hint: 'Verifica que la tabla se haya creado correctamente en Supabase SQL Editor'
      });
    }
    
    res.status(500).json({ 
      error: 'Error al obtener ingredientes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: error.code
    });
  }
});

app.post('/api/ingredients', corsMiddleware, async (req, res) => {
  try {
    const ingredientData = {
      name: req.body.name,
      unit: req.body.unit,
      purchasePrice: req.body.purchase_price || req.body.purchasePrice,
      currentStock: req.body.current_stock || req.body.currentStock || 0,
      minStock: req.body.min_stock || req.body.minStock || 0
    };
    const ingredient = await prisma.ingredient.create({
      data: ingredientData
    });
    res.json(objectToSnakeCase(ingredient));
  } catch (error) {
    console.error('Error creating ingredient:', error);
    res.status(500).json({ error: 'Error al crear ingrediente' });
  }
});

app.put('/api/ingredients/:id', corsMiddleware, async (req, res) => {
  try {
    const ingredientData = {
      name: req.body.name,
      unit: req.body.unit,
      purchasePrice: req.body.purchase_price || req.body.purchasePrice,
      currentStock: req.body.current_stock !== undefined ? req.body.current_stock : req.body.currentStock,
      minStock: req.body.min_stock !== undefined ? req.body.min_stock : req.body.minStock
    };
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: ingredientData
    });
    res.json(objectToSnakeCase(ingredient));
  } catch (error) {
    console.error('Error updating ingredient:', error);
    res.status(500).json({ error: 'Error al actualizar ingrediente' });
  }
});

app.delete('/api/ingredients/:id', corsMiddleware, async (req, res) => {
  try {
    await prisma.ingredient.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Ingrediente eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting ingredient:', error);
    res.status(500).json({ error: 'Error al eliminar ingrediente' });
  }
});

// ========== RECIPES ENDPOINTS (placeholder - implementar según necesidad) ==========
// ========== RECIPES ENDPOINTS ==========
app.get('/api/recipes', corsMiddleware, async (req, res) => {
  try {
    // Verificar si el modelo Recipe existe en Prisma
    if (!prisma.recipe) {
      console.warn('⚠️ Modelo Recipe no encontrado en Prisma. Ejecuta: npx prisma generate');
      return res.json([]);
    }
    
    const recipes = await prisma.recipe.findMany({
      include: {
        product: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    res.json(objectToSnakeCase(recipes));
  } catch (error) {
    console.error('❌ Error fetching recipes:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error meta:', error.meta);
    
    // Si la tabla no existe, retornar array vacío en lugar de error
    if (error.message && (error.message.includes('does not exist') || error.message.includes('relation "recipes"') || error.code === 'P2021' || error.code === 'P2003')) {
      console.warn('⚠️ Tabla recipes no existe, retornando array vacío');
      return res.json([]);
    }
    
    res.status(500).json({ 
      error: 'Error al obtener recetas',
      details: error.message || 'Error desconocido',
      code: error.code
    });
  }
});

app.get('/api/recipes/product/:productId', corsMiddleware, async (req, res) => {
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { productId: req.params.productId },
      include: {
        product: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    if (!recipe) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }
    res.json(objectToSnakeCase(recipe));
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({ 
      error: 'Error al obtener receta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/recipes', corsMiddleware, async (req, res) => {
  try {
    // Verificar si el modelo Recipe existe en Prisma
    if (!prisma.recipe) {
      console.warn('⚠️ Modelo Recipe no encontrado en Prisma. Ejecuta: npx prisma generate');
      return res.status(500).json({ 
        error: 'Modelo Recipe no disponible. Ejecuta "npx prisma generate" en el servidor.',
        instruction: 'En el VPS, ejecuta: cd server && npx prisma generate && pm2 restart all'
      });
    }
    
    const { product_id, productId, ingredients } = req.body;
    const finalProductId = product_id || productId;
    
    if (!finalProductId) {
      return res.status(400).json({ error: 'product_id es requerido' });
    }
    
    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'ingredients debe ser un array' });
    }

    // Verificar si ya existe una receta para este producto
    const existingRecipe = await prisma.recipe.findUnique({
      where: { productId: finalProductId }
    });

    let recipe;
    if (existingRecipe) {
      // Actualizar receta existente
      recipe = await prisma.recipe.update({
        where: { id: existingRecipe.id },
        data: {
          ingredients: ingredients
        }
      });
    } else {
      // Crear nueva receta
      recipe = await prisma.recipe.create({
        data: {
          productId: finalProductId,
          ingredients: ingredients
        }
      });
    }

    res.json(objectToSnakeCase(recipe));
  } catch (error) {
    console.error('❌ Error creating/updating recipe:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error meta:', error.meta);
    
    // Si la tabla no existe, proporcionar instrucciones
    if (error.message && (error.message.includes('does not exist') || error.message.includes('relation "recipes"') || error.code === 'P2021' || error.code === 'P2003')) {
      return res.status(500).json({ 
        error: 'La tabla de recetas no existe. Necesitas crearla primero.',
        sql: `CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    ingredients JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`
      });
    }
    
    res.status(500).json({ 
      error: 'Error al guardar receta',
      details: error.message || 'Error desconocido',
      code: error.code
    });
  }
});

app.put('/api/recipes/:id', corsMiddleware, async (req, res) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'ingredients debe ser un array' });
    }

    const recipe = await prisma.recipe.update({
      where: { id: req.params.id },
      data: {
        ingredients: ingredients
      }
    });

    res.json(objectToSnakeCase(recipe));
  } catch (error) {
    console.error('Error updating recipe:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }
    res.status(500).json({ 
      error: 'Error al actualizar receta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.delete('/api/recipes/:id', corsMiddleware, async (req, res) => {
  try {
    await prisma.recipe.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting recipe:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }
    res.status(500).json({ 
      error: 'Error al eliminar receta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/products', corsMiddleware, async (req, res) => {
  try {
    // Obtener todos los productos sin filtrar por isAvailable
    // El frontend puede filtrar si es necesario
    const products = await prisma.product.findMany({
      include: {
        category: true,
        productOptionCategories: {
          include: {
            options: true
          }
        },
        orderItems: {
          select: {
            quantity: true
          }
        }
      },
      orderBy: { displayOrder: 'asc' }
    });
    // Transformar productos y agregar order_items para compatibilidad
    const transformedProducts = products.map(product => {
      const snakeProduct = objectToSnakeCase(product);
      // Agregar order_items en el formato que espera el frontend
      snakeProduct.order_items = product.orderItems || [];
      return snakeProduct;
    });
    res.json(transformedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.post('/api/products', corsMiddleware, async (req, res) => {
  try {
    const productData = {
      categoryId: req.body.category_id || req.body.categoryId,
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      imageUrl: req.body.image_url || req.body.imageUrl,
      isAvailable: req.body.is_available !== undefined ? req.body.is_available : (req.body.isAvailable !== undefined ? req.body.isAvailable : true),
      displayOrder: req.body.display_order || req.body.displayOrder || 0
    };
    const product = await prisma.product.create({
      data: productData
    });
    res.json(objectToSnakeCase(product));
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

app.put('/api/products/:id', corsMiddleware, async (req, res) => {
  try {
    // Validar que el producto existe
    const existingProduct = await prisma.product.findUnique({
      where: { id: req.params.id }
    });
    
    if (!existingProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    // Construir objeto de datos solo con los campos proporcionados
    const productData = {};
    if (req.body.category_id !== undefined || req.body.categoryId !== undefined) {
      productData.categoryId = req.body.category_id || req.body.categoryId;
    }
    if (req.body.name !== undefined) {
      productData.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      productData.description = req.body.description;
    }
    if (req.body.price !== undefined) {
      productData.price = parseFloat(req.body.price);
    }
    if (req.body.image_url !== undefined || req.body.imageUrl !== undefined) {
      const imageValue = req.body.image_url || req.body.imageUrl;
      // Permitir null o string vacío para eliminar la imagen
      productData.imageUrl = imageValue === '' ? null : imageValue;
    }
    if (req.body.is_available !== undefined || req.body.isAvailable !== undefined) {
      productData.isAvailable = req.body.is_available !== undefined ? req.body.is_available : req.body.isAvailable;
    }
    if (req.body.display_order !== undefined || req.body.displayOrder !== undefined) {
      productData.displayOrder = req.body.display_order || req.body.displayOrder;
    }
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: productData
    });
    res.json(objectToSnakeCase(product));
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

app.delete('/api/products/:id', corsMiddleware, async (req, res) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// ========== OPCIONES DE PRODUCTO ==========
app.get('/api/product-option-categories', async (req, res) => {
  try {
    const categories = await prisma.productOptionCategory.findMany({
      where: { productId: req.query.productId },
      include: { options: true },
      orderBy: { displayOrder: 'asc' }
    });
    // Convertir a snake_case y mantener estructura de options
    const snakeCaseCategories = categories.map(cat => {
      const snakeCat = objectToSnakeCase(cat);
      if (cat.options && cat.options.length > 0) {
        snakeCat.options = cat.options.map(opt => objectToSnakeCase(opt));
      }
      return snakeCat;
    });
    res.json(snakeCaseCategories);
  } catch (error) {
    console.error('Error fetching option categories:', error);
    res.status(500).json({ error: 'Error al obtener categorías de opciones' });
  }
});

app.post('/api/product-option-categories', async (req, res) => {
  try {
    const categoryData = {
      productId: req.body.productId || req.body.product_id,
      name: req.body.name,
      isRequired: req.body.isRequired !== undefined ? req.body.isRequired : (req.body.is_required !== undefined ? req.body.is_required : false),
      minSelections: req.body.minSelections || req.body.min_selections || 1,
      maxSelections: req.body.maxSelections || req.body.max_selections || 1,
      displayOrder: req.body.displayOrder || req.body.display_order || 0
    };
    
    const category = await prisma.productOptionCategory.create({
      data: categoryData
    });
    res.json(objectToSnakeCase(category));
  } catch (error) {
    console.error('Error creating option category:', error);
    res.status(500).json({ error: 'Error al crear categoría de opciones' });
  }
});

app.put('/api/product-option-categories/:id', async (req, res) => {
  try {
    const existingCategory = await prisma.productOptionCategory.findUnique({
      where: { id: req.params.id }
    });
    
    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    const categoryData = {};
    if (req.body.name !== undefined) categoryData.name = req.body.name;
    if (req.body.isRequired !== undefined || req.body.is_required !== undefined) {
      categoryData.isRequired = req.body.isRequired !== undefined ? req.body.isRequired : req.body.is_required;
    }
    if (req.body.maxSelections !== undefined || req.body.max_selections !== undefined) {
      categoryData.maxSelections = req.body.maxSelections || req.body.max_selections;
    }
    if (req.body.minSelections !== undefined || req.body.min_selections !== undefined) {
      categoryData.minSelections = req.body.minSelections || req.body.min_selections;
    }
    if (req.body.displayOrder !== undefined || req.body.display_order !== undefined) {
      categoryData.displayOrder = req.body.displayOrder || req.body.display_order;
    }
    
    const category = await prisma.productOptionCategory.update({
      where: { id: req.params.id },
      data: categoryData
    });
    res.json(objectToSnakeCase(category));
  } catch (error) {
    console.error('Error updating option category:', error);
    res.status(500).json({ error: 'Error al actualizar categoría de opciones' });
  }
});

app.delete('/api/product-option-categories/:id', async (req, res) => {
  try {
    await prisma.productOptionCategory.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting option category:', error);
    res.status(500).json({ error: 'Error al eliminar categoría de opciones' });
  }
});

app.get('/api/product-options', async (req, res) => {
  try {
    const options = await prisma.productOption.findMany({
      where: { optionCategoryId: req.query.categoryId },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(options.map(opt => objectToSnakeCase(opt)));
  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({ error: 'Error al obtener opciones' });
  }
});

app.post('/api/product-options', async (req, res) => {
  try {
    const optionCategoryId = req.body.optionCategoryId || req.body.option_category_id || req.body.category_id;
    
    if (!optionCategoryId) {
      return res.status(400).json({ error: 'optionCategoryId es requerido' });
    }
    
    // Verificar que la categoría existe
    const category = await prisma.productOptionCategory.findUnique({
      where: { id: optionCategoryId }
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Categoría de opción no encontrada' });
    }
    
    const optionData = {
      optionCategoryId: optionCategoryId,
      name: req.body.name?.trim() || '',
      priceModifier: req.body.priceModifier !== undefined ? req.body.priceModifier : (req.body.price_modifier !== undefined ? req.body.price_modifier : (req.body.price !== undefined ? req.body.price : 0)),
      isAvailable: req.body.isAvailable !== undefined ? req.body.isAvailable : (req.body.is_available !== undefined ? req.body.is_available : true),
      displayOrder: req.body.displayOrder || req.body.display_order || 0
    };
    
    if (!optionData.name) {
      return res.status(400).json({ error: 'El nombre de la opción es requerido' });
    }
    
    const option = await prisma.productOption.create({
      data: optionData
    });
    res.json(objectToSnakeCase(option));
  } catch (error) {
    console.error('Error creating option:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Error al crear opción', details: error.message });
  }
});

app.put('/api/product-options/:id', async (req, res) => {
  try {
    const existingOption = await prisma.productOption.findUnique({
      where: { id: req.params.id }
    });
    
    if (!existingOption) {
      return res.status(404).json({ error: 'Opción no encontrada' });
    }
    
    const optionData = {};
    if (req.body.name !== undefined) optionData.name = req.body.name;
    if (req.body.priceModifier !== undefined || req.body.price_modifier !== undefined || req.body.price !== undefined) {
      optionData.priceModifier = req.body.priceModifier !== undefined ? req.body.priceModifier : (req.body.price_modifier !== undefined ? req.body.price_modifier : req.body.price);
    }
    if (req.body.isAvailable !== undefined || req.body.is_available !== undefined) {
      optionData.isAvailable = req.body.isAvailable !== undefined ? req.body.isAvailable : req.body.is_available;
    }
    if (req.body.displayOrder !== undefined || req.body.display_order !== undefined) {
      optionData.displayOrder = req.body.displayOrder || req.body.display_order;
    }
    
    const option = await prisma.productOption.update({
      where: { id: req.params.id },
      data: optionData
    });
    res.json(objectToSnakeCase(option));
  } catch (error) {
    console.error('Error updating option:', error);
    res.status(500).json({ error: 'Error al actualizar opción' });
  }
});

app.delete('/api/product-options/:id', async (req, res) => {
  try {
    await prisma.productOption.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting option:', error);
    res.status(500).json({ error: 'Error al eliminar opción' });
  }
});

// ========== EXTRAS GLOBALES ==========
app.get('/api/extras', async (req, res) => {
  try {
    const extras = await prisma.extra.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectToSnakeCase(extras));
  } catch (error) {
    console.error('Error fetching extras:', error);
    res.status(500).json({ error: 'Error al obtener extras' });
  }
});

app.post('/api/extras', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const basePrice = Number(req.body.basePrice ?? req.body.base_price ?? req.body.price ?? 0);
    const isActive = req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== undefined ? req.body.is_active : true);
    if (!name) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (Number.isNaN(basePrice) || basePrice < 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }
    const extra = await prisma.extra.create({
      data: { name, basePrice, isActive }
    });
    res.json(objectToSnakeCase(extra));
  } catch (error) {
    console.error('Error creating extra:', error);
    res.status(500).json({ error: 'Error al crear extra' });
  }
});

app.put('/api/extras/:id', async (req, res) => {
  try {
    const data = {};
    if (req.body.name !== undefined) data.name = String(req.body.name);
    if (req.body.basePrice !== undefined || req.body.base_price !== undefined || req.body.price !== undefined) {
      const price = Number(req.body.basePrice ?? req.body.base_price ?? req.body.price);
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ error: 'Precio inválido' });
      data.basePrice = price;
    }
    if (req.body.isActive !== undefined || req.body.is_active !== undefined) {
      data.isActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;
    }
    const extra = await prisma.extra.update({
      where: { id: req.params.id },
      data
    });
    res.json(objectToSnakeCase(extra));
  } catch (error) {
    console.error('Error updating extra:', error);
    res.status(500).json({ error: 'Error al actualizar extra' });
  }
});

app.delete('/api/extras/:id', async (req, res) => {
  try {
    await prisma.extra.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting extra:', error);
    res.status(500).json({ error: 'Error al eliminar extra' });
  }
});

// ========== PEDIDOS ==========
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        items: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectToSnakeCase(orders));
  } catch (error) {
    // Si el error es por unique_code no existir, usar select explícito
    if (error.code === 'P2022' && error.meta?.column?.includes('unique_code')) {
      console.warn('⚠️ unique_code no existe, obteniendo pedidos sin unique_code...');
      try {
        const orders = await prisma.order.findMany({
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            subtotal: true,
            deliveryFee: true,
            total: true,
            notes: true,
            deliveryCode: true,
            trackingToken: true,
            deliveryPersonId: true,
            createdAt: true,
            updatedAt: true,
            items: true
            // Excluir unique_code explícitamente
          },
          orderBy: { createdAt: 'desc' }
        });
        res.json(objectToSnakeCase(orders));
        return;
      } catch (fallbackError) {
        console.error('Error con fallback:', fallbackError);
      }
    }
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    // Usar raw SQL directamente para evitar completamente problemas con unique_code
    // Esto es más seguro cuando el schema de Prisma no coincide con la BD
    const result = await prisma.$queryRaw`
      SELECT 
        o.id, o.order_number as "orderNumber", o.customer_name as "customerName",
        o.customer_phone as "customerPhone", o.customer_address as "customerAddress",
        o.status, o.payment_method as "paymentMethod", o.payment_status as "paymentStatus",
        o.subtotal, o.delivery_fee as "deliveryFee", o.total, o.notes,
        o.delivery_code as "deliveryCode", o.tracking_token as "trackingToken",
        o.delivery_person_id as "deliveryPersonId", o.created_at as "createdAt",
        o.updated_at as "updatedAt"
      FROM orders o
      WHERE o.id = ${req.params.id}
    `;
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    const orderData = result[0];
    
    // Obtener items por separado
    const items = await prisma.$queryRaw`
      SELECT 
        id, order_id as "orderId", product_id as "productId",
        product_name as "productName", quantity, unit_price as "unitPrice",
        subtotal, selected_options as "selectedOptions", created_at as "createdAt"
      FROM order_items
      WHERE order_id = ${req.params.id}
    `;
    
    const order = { ...orderData, items: items || [] };
    
    res.json(objectToSnakeCase(order));
  } catch (error) {
    console.error('❌ [GET ORDER] Error fetching order:', error);
    console.error('❌ [GET ORDER] Error code:', error.code);
    console.error('❌ [GET ORDER] Error meta:', error.meta);
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
});

// Manejar preflight OPTIONS para /api/orders
app.options('/api/orders', corsMiddleware, (req, res) => {
  res.sendStatus(200);
});

app.post('/api/orders', corsMiddleware, async (req, res) => {
  try {
    console.log('📥 [CREATE ORDER] Iniciando creación de pedido...');
    console.log('📥 [CREATE ORDER] Body recibido:', JSON.stringify(req.body, null, 2));
    
    // Validar campos requeridos
    if (!req.body.customer_name && !req.body.customerName) {
      return res.status(400).json({ error: 'customer_name es requerido' });
    }
    if (req.body.subtotal === undefined && req.body.subtotal === null) {
      return res.status(400).json({ error: 'subtotal es requerido' });
    }
    if (req.body.total === undefined && req.body.total === null) {
      return res.status(400).json({ error: 'total es requerido' });
    }
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ error: 'items es requerido y debe tener al menos un item' });
    }
    
    // Generar número de pedido único
    // Usar select para evitar problemas con unique_code si la migración no está aplicada
    let orderNumber = '#0001';
    let attempts = 0;
    const maxOrderNumberAttempts = 10;
    
    while (attempts < maxOrderNumberAttempts) {
      try {
        // Usar select para obtener solo orderNumber y createdAt, evitando unique_code
        const lastOrder = await prisma.order.findFirst({
          select: {
            orderNumber: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        });
        
        if (lastOrder && lastOrder.orderNumber) {
          const lastNum = parseInt(lastOrder.orderNumber.replace('#', ''));
          orderNumber = `#${String(lastNum + 1).padStart(4, '0')}`;
        }
        
        // Verificar que el orderNumber no exista (usando select para evitar unique_code)
        const existingOrder = await prisma.order.findFirst({
          where: { orderNumber },
          select: { id: true } // Solo necesitamos saber si existe
        });
        
        if (!existingOrder) {
          break; // El orderNumber es único, continuar
        }
        
        // Si existe, generar uno nuevo
        const currentNum = parseInt(orderNumber.replace('#', ''));
        orderNumber = `#${String(currentNum + 1).padStart(4, '0')}`;
        attempts++;
        console.log(`⚠️ [CREATE ORDER] Order Number ${orderNumber} ya existe, intentando siguiente...`);
      } catch (error) {
        console.error('❌ [CREATE ORDER] Error al generar orderNumber:', error.message);
        // Si falla, usar timestamp como fallback
        const timestampNum = String(Date.now()).slice(-4);
        orderNumber = `#${timestampNum}`;
        console.warn(`⚠️ [CREATE ORDER] Usando orderNumber de fallback: ${orderNumber}`);
        break;
      }
    }
    
    console.log(`✅ [CREATE ORDER] Order Number generado: ${orderNumber}`);

    // Convertir snake_case a camelCase para Prisma
    const orderData = {
      customerName: req.body.customer_name || req.body.customerName,
      customerPhone: req.body.customer_phone || req.body.customerPhone,
      customerAddress: req.body.customer_address || req.body.customerAddress,
      status: req.body.status || 'pending',
      paymentMethod: req.body.payment_method !== undefined ? req.body.payment_method : (req.body.paymentMethod !== undefined ? req.body.paymentMethod : null),
      paymentStatus: req.body.payment_status || req.body.paymentStatus || 'pending',
      subtotal: req.body.subtotal,
      deliveryFee: req.body.delivery_fee || req.body.deliveryFee || 0,
      total: req.body.total,
      notes: req.body.notes,
      orderNumber,
      items: {
        create: (req.body.items || []).map(item => {
          // Asegurar que selectedOptions se guarde como string JSON
          let selectedOptionsValue = '{}';
          
          if (item.selected_options) {
            if (typeof item.selected_options === 'string') {
              // Ya es un string, verificar que sea JSON válido
              try {
                JSON.parse(item.selected_options);
                selectedOptionsValue = item.selected_options;
              } catch (e) {
                // Si no es JSON válido, intentar guardarlo como string
                selectedOptionsValue = JSON.stringify({ raw: item.selected_options });
              }
            } else {
              // Es un objeto, convertirlo a JSON string
              selectedOptionsValue = JSON.stringify(item.selected_options);
            }
          } else if (item.selectedOptions) {
            // Fallback a camelCase
            selectedOptionsValue = typeof item.selectedOptions === 'string'
              ? item.selectedOptions
              : JSON.stringify(item.selectedOptions);
          }
          
          console.log(`💾 Guardando item ${item.product_name}:`, {
            selected_options: selectedOptionsValue.substring(0, 100) + (selectedOptionsValue.length > 100 ? '...' : '')
          });
          
          return {
            productId: item.product_id || item.productId,
            productName: item.product_name || item.productName,
            quantity: item.quantity,
            unitPrice: item.unit_price || item.unitPrice,
            subtotal: item.subtotal,
            selectedOptions: selectedOptionsValue
          };
        })
      }
    };

    // Intentar generar uniqueCode (retorna null si la migración no está aplicada)
    const uniqueCode = await generateUniqueOrderCode();
    if (uniqueCode) {
      orderData.uniqueCode = uniqueCode;
      console.log(`✅ [CREATE ORDER] Código único generado: ${uniqueCode}`);
    } else {
      console.warn('⚠️ [CREATE ORDER] No se pudo generar uniqueCode (migración no aplicada), creando pedido sin código único');
    }
    
    console.log('📦 [CREATE ORDER] Datos del pedido a crear:', JSON.stringify({
      customerName: orderData.customerName,
      orderNumber: orderData.orderNumber,
      subtotal: orderData.subtotal,
      total: orderData.total,
      itemsCount: orderData.items.create.length,
      hasUniqueCode: !!orderData.uniqueCode
    }, null, 2));
    
    // Crear el pedido
    let order;
    try {
      console.log('🔄 [CREATE ORDER] Intentando crear pedido...');
      console.log('🔄 [CREATE ORDER] orderData keys:', Object.keys(orderData));
      console.log('🔄 [CREATE ORDER] items count:', orderData.items?.create?.length || 0);
      
      // Crear el pedido (el include puede fallar si unique_code no existe, pero el pedido se crea igual)
      order = await prisma.order.create({
        data: orderData,
        include: {
          items: true
        }
      });
      console.log('✅ [CREATE ORDER] Pedido creado exitosamente:', order.id);
      
      // Si items no se incluyeron (por error de unique_code), obtenerlos por separado
      if (!order.items || order.items.length === 0) {
        console.warn('⚠️ [CREATE ORDER] Items no incluidos, obteniendo por separado...');
        try {
          const items = await prisma.orderItem.findMany({
            where: { orderId: order.id }
          });
          order.items = items;
          console.log(`✅ [CREATE ORDER] ${items.length} items obtenidos por separado`);
        } catch (itemsError) {
          console.error('❌ [CREATE ORDER] Error al obtener items:', itemsError.message);
          order.items = [];
        }
      } else {
        console.log(`✅ [CREATE ORDER] ${order.items.length} items incluidos en la respuesta`);
      }
    } catch (createError) {
      console.error('❌ [CREATE ORDER] Error al crear pedido:', createError.message);
      console.error('❌ [CREATE ORDER] Error code:', createError.code);
      console.error('❌ [CREATE ORDER] Error meta:', createError.meta);
      
      // Si el error es por unique_code, usar raw SQL para crear el pedido
      if (createError.code === 'P2022' && createError.meta?.column?.includes('unique_code')) {
        console.warn('⚠️ [CREATE ORDER] Error por unique_code, usando raw SQL...');
        
        try {
          // Crear el pedido usando raw SQL (sin unique_code)
          const orderId = crypto.randomUUID();
          const now = new Date().toISOString();
          
          const orderResult = await prisma.$queryRawUnsafe(`
            INSERT INTO orders (
              id, order_number, customer_name, customer_phone, customer_address,
              status, payment_method, payment_status, subtotal, delivery_fee, total, notes,
              created_at, updated_at
            ) VALUES (
              '${orderId}', '${orderData.orderNumber}', '${(orderData.customerName || '').replace(/'/g, "''")}', 
              ${orderData.customerPhone ? `'${orderData.customerPhone.replace(/'/g, "''")}'` : 'NULL'}, 
              ${orderData.customerAddress ? `'${orderData.customerAddress.replace(/'/g, "''")}'` : 'NULL'}, 
              '${orderData.status || 'pending'}', 
              ${orderData.paymentMethod ? `'${orderData.paymentMethod.replace(/'/g, "''")}'` : 'NULL'}, 
              '${orderData.paymentStatus || 'pending'}', 
              ${orderData.subtotal}, 
              ${orderData.deliveryFee || 0}, 
              ${orderData.total}, 
              ${orderData.notes ? `'${orderData.notes.replace(/'/g, "''")}'` : 'NULL'}, 
              '${now}', 
              '${now}'
            ) RETURNING *
          `);
          
          const createdOrder = orderResult[0];
          console.log('✅ [CREATE ORDER] Pedido creado con raw SQL:', createdOrder.id);
          
          // Crear los items usando raw SQL
          const items = [];
          if (orderData.items && orderData.items.create && orderData.items.create.length > 0) {
            for (const item of orderData.items.create) {
              const itemId = crypto.randomUUID();
              const itemResult = await prisma.$queryRawUnsafe(`
                INSERT INTO order_items (
                  id, order_id, product_id, product_name, quantity, unit_price, subtotal, selected_options, created_at
                ) VALUES (
                  '${itemId}', 
                  '${createdOrder.id}', 
                  ${item.productId ? `'${item.productId}'` : 'NULL'}, 
                  '${(item.productName || '').replace(/'/g, "''")}', 
                  ${item.quantity}, 
                  ${item.unitPrice}, 
                  ${item.subtotal}, 
                  '${(item.selectedOptions || '{}').replace(/'/g, "''")}', 
                  '${now}'
                ) RETURNING *
              `);
              
              items.push(itemResult[0]);
            }
            console.log(`✅ [CREATE ORDER] ${items.length} items creados con raw SQL`);
          }
          
          // Construir el objeto order en el formato esperado
          order = {
            id: createdOrder.id,
            orderNumber: createdOrder.order_number,
            customerName: createdOrder.customer_name,
            customerPhone: createdOrder.customer_phone,
            customerAddress: createdOrder.customer_address,
            status: createdOrder.status,
            paymentMethod: createdOrder.payment_method,
            paymentStatus: createdOrder.payment_status,
            subtotal: parseFloat(createdOrder.subtotal),
            deliveryFee: parseFloat(createdOrder.delivery_fee || 0),
            total: parseFloat(createdOrder.total),
            notes: createdOrder.notes,
            createdAt: createdOrder.created_at,
            updatedAt: createdOrder.updated_at,
            items: items.map(item => ({
              id: item.id,
              orderId: item.order_id,
              productId: item.product_id,
              productName: item.product_name,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unit_price),
              subtotal: parseFloat(item.subtotal),
              selectedOptions: item.selected_options,
              createdAt: item.created_at
            }))
          };
          
          console.warn('✅ [CREATE ORDER] Pedido creado sin uniqueCode usando raw SQL. Ejecuta: npx prisma migrate deploy');
        } catch (rawError) {
          console.error('❌ [CREATE ORDER] Error al crear pedido con raw SQL:', rawError.message);
          console.error('❌ [CREATE ORDER] Raw SQL error:', rawError);
          // Si el raw SQL también falla, relanzar el error original
          throw createError;
        }
      } else {
        // Si no es por unique_code, relanzar el error
        throw createError;
      }
    }
    
    // Si el pedido se creó pero el include falló por unique_code, obtener items por separado
    if (order && (!order.items || order.items.length === 0)) {
      try {
        console.log('⚠️ [CREATE ORDER] Items no incluidos, obteniendo por separado...');
        const items = await prisma.orderItem.findMany({
          where: { orderId: order.id }
        });
        order.items = items;
        console.log(`✅ [CREATE ORDER] ${items.length} items obtenidos`);
      } catch (itemsError) {
        console.error('❌ [CREATE ORDER] Error al obtener items:', itemsError.message);
        // Continuar sin items, el pedido ya está creado
      }
    }
    
    // ========== REGISTRAR REFERIDO PENDIENTE SI EXISTE ==========
    // Si el cliente tiene un referidor pendiente (entró por link de invitación), registrarlo
    if (order.customerPhone && order.customerPhone.includes('@lid')) {
      try {
        // Buscar si hay un pendingReferral para este cliente
        const pendingReferral = await prisma.pendingReferral.findUnique({
          where: { referredId: order.customerPhone }
        });
        
        if (pendingReferral) {
          // Crear referral pendiente si no existe
          await prisma.referral.upsert({
            where: { referredId: order.customerPhone },
            create: {
              referrerId: pendingReferral.referrerId,
              referredId: order.customerPhone,
              status: 'pending'
            },
            update: {
              referrerId: pendingReferral.referrerId,
              status: 'pending'
            }
          });
          
          console.log(`✅ Referido pendiente registrado: ${order.customerPhone} -> ${pendingReferral.referrerId}`);
        }
      } catch (error) {
        console.error('Error registrando referido pendiente:', error);
        // No fallar la creación del pedido si hay error en referidos
      }
    }
    
    // Verificar que el uniqueCode se haya guardado correctamente
    console.log('📦 [CREATE ORDER] Preparando respuesta...');
    const responseOrder = objectToSnakeCase(order);
    console.log(`📦 [CREATE ORDER] Pedido creado - Order Number: ${responseOrder.order_number}, Unique Code: ${responseOrder.unique_code || 'NO ASIGNADO'}`);
    console.log(`📦 [CREATE ORDER] Items en respuesta: ${responseOrder.items?.length || 0}`);
    
    console.log('📤 [CREATE ORDER] Enviando respuesta al cliente...');
    res.json(responseOrder);
    console.log('✅ [CREATE ORDER] Respuesta enviada exitosamente');
  } catch (error) {
    console.error('❌ [CREATE ORDER] Error general al crear pedido:', error);
    console.error('❌ [CREATE ORDER] Error stack:', error.stack);
    console.error('❌ [CREATE ORDER] Error message:', error.message);
    console.error('❌ [CREATE ORDER] Error code:', error.code);
    console.error('❌ [CREATE ORDER] Error meta:', error.meta);
    console.error('❌ [CREATE ORDER] Request body:', JSON.stringify(req.body, null, 2));
    
    // Determinar el código de estado apropiado
    let statusCode = 500;
    let errorMessage = 'Error al crear pedido';
    
    // Errores de Prisma
    if (error.code === 'P2002') {
      statusCode = 409; // Conflict
      errorMessage = 'Ya existe un pedido con este número o código único';
    } else if (error.code === 'P2003') {
      statusCode = 400; // Bad Request
      errorMessage = 'Referencia inválida en los datos del pedido';
    } else if (error.code === 'P2011') {
      statusCode = 400; // Bad Request
      errorMessage = 'Campo requerido faltante: ' + (error.meta?.target || 'desconocido');
    } else if (error.message) {
      // Si hay un mensaje de error, usarlo (al menos en desarrollo)
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        errorMessage = error.message;
      }
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') ? {
        message: error.message,
        code: error.code,
        meta: error.meta
      } : undefined
    });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const orderData = {};
    if (req.body.customer_name !== undefined || req.body.customerName !== undefined) {
      orderData.customerName = req.body.customer_name || req.body.customerName;
    }
    if (req.body.customer_phone !== undefined || req.body.customerPhone !== undefined) {
      orderData.customerPhone = req.body.customer_phone || req.body.customerPhone;
    }
    if (req.body.customer_address !== undefined || req.body.customerAddress !== undefined) {
      orderData.customerAddress = req.body.customer_address || req.body.customerAddress;
    }
    if (req.body.status !== undefined) orderData.status = req.body.status;
    if (req.body.payment_method !== undefined || req.body.paymentMethod !== undefined) {
      orderData.paymentMethod = req.body.payment_method || req.body.paymentMethod;
    }
    if (req.body.payment_status !== undefined || req.body.paymentStatus !== undefined) {
      orderData.paymentStatus = req.body.payment_status || req.body.paymentStatus;
    }
    if (req.body.subtotal !== undefined) orderData.subtotal = req.body.subtotal;
    if (req.body.delivery_fee !== undefined || req.body.deliveryFee !== undefined) {
      orderData.deliveryFee = req.body.delivery_fee || req.body.deliveryFee;
    }
    if (req.body.total !== undefined) orderData.total = req.body.total;
    if (req.body.notes !== undefined) orderData.notes = req.body.notes;

    console.log(`📝 [UPDATE ORDER] Actualizando pedido ${req.params.id} con datos:`, JSON.stringify(orderData, null, 2));
    
    // Obtener pedido anterior para comparar estados
    let previousOrder;
    try {
      previousOrder = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true }
      });
    } catch (findError) {
      // Si falla por unique_code, usar select explícito
      if (findError.code === 'P2022' && findError.meta?.column?.includes('unique_code')) {
        console.warn('⚠️ [UPDATE ORDER] findUnique falló por unique_code, usando select...');
        previousOrder = await prisma.order.findUnique({
          where: { id: req.params.id },
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            subtotal: true,
            deliveryFee: true,
            total: true,
            notes: true,
            deliveryCode: true,
            trackingToken: true,
            deliveryPersonId: true,
            createdAt: true,
            updatedAt: true,
            items: true
          }
        });
      } else {
        throw findError;
      }
    }
    
    if (!previousOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    // Actualizar el pedido
    let order;
    try {
      order = await prisma.order.update({
        where: { id: req.params.id },
        data: orderData,
        include: { items: true }
      });
    } catch (updateError) {
      // Si falla por unique_code, usar raw SQL
      if (updateError.code === 'P2022' && updateError.meta?.column?.includes('unique_code')) {
        console.warn('⚠️ [UPDATE ORDER] update falló por unique_code, usando raw SQL...');
        
        // Construir SET clause dinámicamente
        const setClauses = [];
        const values = [];
        let paramIndex = 1;
        
        if (orderData.customerName !== undefined) {
          setClauses.push(`customer_name = $${paramIndex++}`);
          values.push(orderData.customerName);
        }
        if (orderData.customerPhone !== undefined) {
          setClauses.push(`customer_phone = $${paramIndex++}`);
          values.push(orderData.customerPhone);
        }
        if (orderData.customerAddress !== undefined) {
          setClauses.push(`customer_address = $${paramIndex++}`);
          values.push(orderData.customerAddress);
        }
        if (orderData.status !== undefined) {
          setClauses.push(`status = $${paramIndex++}`);
          values.push(orderData.status);
        }
        if (orderData.paymentMethod !== undefined) {
          setClauses.push(`payment_method = $${paramIndex++}`);
          values.push(orderData.paymentMethod);
        }
        if (orderData.paymentStatus !== undefined) {
          setClauses.push(`payment_status = $${paramIndex++}`);
          values.push(orderData.paymentStatus);
        }
        if (orderData.subtotal !== undefined) {
          setClauses.push(`subtotal = $${paramIndex++}`);
          values.push(orderData.subtotal);
        }
        if (orderData.deliveryFee !== undefined) {
          setClauses.push(`delivery_fee = $${paramIndex++}`);
          values.push(orderData.deliveryFee);
        }
        if (orderData.total !== undefined) {
          setClauses.push(`total = $${paramIndex++}`);
          values.push(orderData.total);
        }
        if (orderData.notes !== undefined) {
          setClauses.push(`notes = $${paramIndex++}`);
          values.push(orderData.notes);
        }
        
        setClauses.push(`updated_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
        
        const whereParamIndex = paramIndex;
        values.push(req.params.id);
        
        const updateQuery = `
          UPDATE orders 
          SET ${setClauses.join(', ')}
          WHERE id = $${whereParamIndex}
          RETURNING *
        `;
        
        // Usar $queryRawUnsafe con parámetros escapados
        const escapedValues = values.map((val) => {
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (typeof val === 'number') return val;
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        
        // Reemplazar parámetros $1, $2, etc. con valores escapados
        let finalQuery = updateQuery;
        for (let i = 0; i < escapedValues.length; i++) {
          finalQuery = finalQuery.replace(`$${i + 1}`, escapedValues[i]);
        }
        
        const updateResult = await prisma.$queryRawUnsafe(finalQuery);
        const updatedOrder = updateResult[0];
        
        // Obtener items por separado
        const items = await prisma.orderItem.findMany({
          where: { orderId: updatedOrder.id }
        });
        
        // Construir objeto order en formato esperado
        order = {
          id: updatedOrder.id,
          orderNumber: updatedOrder.order_number,
          customerName: updatedOrder.customer_name,
          customerPhone: updatedOrder.customer_phone,
          customerAddress: updatedOrder.customer_address,
          status: updatedOrder.status,
          paymentMethod: updatedOrder.payment_method,
          paymentStatus: updatedOrder.payment_status,
          subtotal: parseFloat(updatedOrder.subtotal),
          deliveryFee: parseFloat(updatedOrder.delivery_fee || 0),
          total: parseFloat(updatedOrder.total),
          notes: updatedOrder.notes,
          createdAt: updatedOrder.created_at,
          updatedAt: updatedOrder.updated_at,
          items: items.map(item => ({
            id: item.id,
            orderId: item.order_id,
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            subtotal: parseFloat(item.subtotal),
            selectedOptions: item.selected_options,
            createdAt: item.created_at
          }))
        };
        
        console.warn('✅ [UPDATE ORDER] Pedido actualizado con raw SQL');
      } else {
        throw updateError;
      }
    }
    
    console.log(`✅ [UPDATE ORDER] Pedido actualizado:`, {
      id: order.id,
      order_number: order.orderNumber,
      customer_phone: order.customerPhone,
      customer_name: order.customerName,
      status: order.status,
      payment_status: order.paymentStatus
    });
    
    // ========== ASIGNAR IUC AL CLIENTE SI EL PEDIDO ES APROBADO/PAGADO ==========
    // Asignar IUC cuando el pedido es aprobado o pagado (primer pedido válido)
    if (order.customerPhone && (order.paymentStatus === 'approved' || order.paymentStatus === 'paid')) {
      try {
        // Verificar si el cliente ya tenía IUC antes de este cambio
        const customerBefore = await prisma.customer.findUnique({
          where: { phone: order.customerPhone }
        });
        
        const hadIUCBefore = customerBefore && customerBefore.iuc;
        
        // Asignar IUC si no tiene uno (primer pedido válido)
        const iuc = await assignIUCIfNeeded(order.customerPhone);
        
        if (iuc && !hadIUCBefore) {
          console.log(`✅ IUC ${iuc} asignado a cliente ${order.customerPhone} por pedido ${order.orderNumber}`);
        }
      } catch (error) {
        console.error('❌ Error asignando IUC:', error);
        // No fallar la actualización del pedido si hay error en IUC
      }
    }
    
    // ========== INTEGRACIÓN SISTEMA DE FIDELIDAD ==========
    // Otorgar puntos automáticamente cuando el pedido se completa y se paga
    if (order.customerPhone && order.status === 'delivered' && order.paymentStatus === 'approved') {
      // Verificar que el pedido no haya sido procesado anteriormente para puntos
      const wasAlreadyProcessed = previousOrder && 
        previousOrder.status === 'delivered' && 
        previousOrder.paymentStatus === 'approved';
      
      if (!wasAlreadyProcessed) {
        try {
          const customerId = order.customerPhone; // El ID @lid del cliente
          
          // Obtener configuración de puntos
          const config = await getLoyaltyConfig();
          
          // Obtener o crear registro de fidelidad
          let loyalty = await prisma.customerLoyalty.findUnique({
            where: { customerId }
          });
          
          // Calcular puntos por compra (1 punto por cada $100)
          const pointsPerPurchase = config.pointsPerPurchase || 1;
          const pointsEarned = Math.floor(order.total / 100) * pointsPerPurchase;
          
          if (pointsEarned > 0) {
            await awardPoints(
              customerId,
              pointsEarned,
              'compra',
              `Compra realizada: Pedido ${order.orderNumber} - $${order.total.toFixed(2)}`,
              { orderId: order.id, orderNumber: order.orderNumber, total: order.total }
            );
            
            console.log(`✅ Puntos otorgados: ${customerId} +${pointsEarned} pts por compra ${order.orderNumber}`);
          }
          
          // Verificar si es el primer pedido del cliente
          if (loyalty) {
            const previousOrders = await prisma.order.count({
              where: {
                customerPhone: customerId,
                status: { not: 'cancelled' },
                id: { not: order.id }
              }
            });
            
            if (previousOrders === 0) {
              // Primer pedido
              await awardPoints(
                customerId,
                config.pointsFirstOrder || 20,
                'primer_pedido',
                `Primer pedido realizado: ${order.orderNumber}`,
                { orderId: order.id }
              );
              
              console.log(`✅ Puntos por primer pedido: ${customerId} +${config.pointsFirstOrder || 20} pts`);
            }
          } else {
            // Cliente nuevo - otorgar puntos de bienvenida
            await awardPoints(
              customerId,
              config.pointsNewCustomer || 5,
              'cliente_nuevo',
              `Bienvenida - Cliente nuevo`,
              { orderId: order.id }
            );
            
            // También puntos por primer pedido
            await awardPoints(
              customerId,
              config.pointsFirstOrder || 20,
              'primer_pedido',
              `Primer pedido realizado: ${order.orderNumber}`,
              { orderId: order.id }
            );
            
            console.log(`✅ Puntos de bienvenida: ${customerId} +${(config.pointsNewCustomer || 5) + (config.pointsFirstOrder || 20)} pts`);
          }
          
          // Actualizar estadísticas del cliente (crear si no existe)
          await prisma.customerLoyalty.upsert({
            where: { customerId },
            create: {
              customerId,
              tier: 'bronze',
              totalPoints: (pointsEarned > 0 ? pointsEarned : 0) + (loyalty ? 0 : (config.pointsNewCustomer || 5) + (config.pointsFirstOrder || 20)),
              totalOrders: 1,
              totalSpent: order.total,
              lastOrderDate: new Date(),
              discountPercentage: 0,
              priority: false,
              isActive: true
            },
            update: {
              totalOrders: { increment: 1 },
              totalSpent: { increment: order.total },
              lastOrderDate: new Date()
            }
          });
          
          // Validar referido si existe
          await validateReferral(customerId, order.id);
          
        } catch (error) {
          console.error('❌ Error otorgando puntos automáticamente:', error);
          // No fallar la actualización del pedido si hay error en puntos
        }
      }
    }
    
    res.json(objectToSnakeCase(order));
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// ========== MENSAJES DEL BOT ==========
app.get('/api/bot-messages', async (req, res) => {
  try {
    const messages = await prisma.botMessage.findMany({
      orderBy: { messageKey: 'asc' }
    });
    res.json(objectToSnakeCase(messages));
  } catch (error) {
    console.error('Error fetching bot messages:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

app.post('/api/bot-messages', async (req, res) => {
  try {
    const messageData = {
      messageKey: req.body.message_key || req.body.messageKey,
      messageText: req.body.message_text || req.body.messageText,
      messageType: req.body.message_type || req.body.messageType || 'text',
      isActive: req.body.is_active !== undefined ? req.body.is_active : (req.body.isActive !== undefined ? req.body.isActive : true)
    };
    
    if (!messageData.messageKey || !messageData.messageText) {
      return res.status(400).json({ error: 'message_key y message_text son requeridos' });
    }
    
    const message = await prisma.botMessage.create({
      data: messageData
    });
    res.json(objectToSnakeCase(message));
  } catch (error) {
    console.error('Error creating bot message:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'El mensaje con esa clave ya existe' });
    } else {
      res.status(500).json({ error: 'Error al crear mensaje' });
    }
  }
});

app.post('/api/bot-messages/bulk', async (req, res) => {
  try {
    const messages = req.body.messages || [];
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de mensajes' });
    }
    
    const messagesData = messages.map(msg => ({
      messageKey: msg.message_key || msg.messageKey,
      messageText: msg.message_text || msg.messageText,
      messageType: msg.message_type || msg.messageType || 'text',
      isActive: msg.is_active !== undefined ? msg.is_active : (msg.isActive !== undefined ? msg.isActive : true)
    }));
    
    // Crear mensajes (ignorar duplicados)
    const created = [];
    for (const msgData of messagesData) {
      try {
        const message = await prisma.botMessage.create({
          data: msgData
        });
        created.push(message);
      } catch (error) {
        if (error.code === 'P2002') {
          // Mensaje ya existe, ignorar
          console.log(`Mensaje ${msgData.messageKey} ya existe, ignorando...`);
        } else {
          throw error;
        }
      }
    }
    
    res.json(objectToSnakeCase(created));
  } catch (error) {
    console.error('Error creating bot messages in bulk:', error);
    res.status(500).json({ error: 'Error al crear mensajes' });
  }
});

app.put('/api/bot-messages/:id', async (req, res) => {
  try {
    const messageData = {
      messageText: req.body.message_text || req.body.messageText,
      messageType: req.body.message_type || req.body.messageType,
      isActive: req.body.is_active !== undefined ? req.body.is_active : req.body.isActive
    };
    const message = await prisma.botMessage.update({
      where: { id: req.params.id },
      data: messageData
    });
    res.json(objectToSnakeCase(message));
  } catch (error) {
    console.error('Error updating bot message:', error);
    res.status(500).json({ error: 'Error al actualizar mensaje' });
  }
});

app.delete('/api/bot-messages/all', async (req, res) => {
  try {
    // Eliminar todos los mensajes
    const result = await prisma.botMessage.deleteMany({});
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('Error deleting all bot messages:', error);
    res.status(500).json({ error: 'Error al eliminar mensajes' });
  }
});

// ========== MENSAJES DE WHATSAPP ==========
app.get('/api/whatsapp-messages', async (req, res) => {
  try {
    const messages = await prisma.whatsAppMessage.findMany({
      where: { orderId: req.query.orderId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectToSnakeCase(messages));
  } catch (error) {
    console.error('Error fetching whatsapp messages:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

app.post('/api/whatsapp-messages', async (req, res) => {
  try {
    const messageData = {
      orderId: req.body.order_id || req.body.orderId || null,
      phoneNumber: req.body.phone_number || req.body.phoneNumber,
      messageText: req.body.message_text || req.body.messageText,
      messageType: req.body.message_type || req.body.messageType || 'sent',
      direction: req.body.direction || 'incoming'
    };
    const message = await prisma.whatsAppMessage.create({
      data: messageData
    });
    res.json(objectToSnakeCase(message));
  } catch (error) {
    console.error('Error creating whatsapp message:', error);
    res.status(500).json({ error: 'Error al crear mensaje' });
  }
});

// ========== TRANSFERENCIAS PENDIENTES ==========
app.get('/api/pending-transfers', async (req, res) => {
  // Si hay query param status, filtrar por ese estado, sino devolver todas
  const whereClause = req.query.status 
    ? { status: req.query.status }
    : {};
  
  console.log('📥 [PENDING TRANSFERS] Obteniendo transferencias pendientes...');
  console.log('📥 [PENDING TRANSFERS] Where clause:', whereClause);
  
  try {
    const transfers = await prisma.pendingTransfer.findMany({
      where: whereClause,
      include: { 
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            subtotal: true,
            deliveryFee: true,
            total: true,
            notes: true,
            deliveryCode: true,
            trackingToken: true,
            deliveryPersonId: true,
            createdAt: true,
            updatedAt: true
            // Excluir unique_code explícitamente
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`✅ [PENDING TRANSFERS] ${transfers.length} transferencias encontradas`);
    
    // Normalizar URLs de comprobantes
    // SIEMPRE usar /api/proofs/... para que funcione con el endpoint del backend
    const normalizedTransfers = transfers.map(transfer => {
      if (transfer.proofImageUrl) {
        let url = transfer.proofImageUrl;
        
        // Si la URL es relativa (empieza con /), construirla completa con /api/proofs/
        if (url.startsWith('/proofs/')) {
          // Extraer el filename
          const filename = url.replace('/proofs/', '');
          url = `https://elbuenmenu.site/api/proofs/${filename}`;
        } else if (url.startsWith('/')) {
          // Si es otra ruta relativa, asumir que es un proof y agregar /api
          const filename = url.replace(/^\/+/, '');
          url = `https://elbuenmenu.site/api/proofs/${filename}`;
        }
        // Si contiene el dominio incorrecto api.elbuenmenu.site, corregirlo
        else if (url.includes('api.elbuenmenu.site')) {
          url = url.replace('https://api.elbuenmenu.site', 'https://elbuenmenu.site');
          url = url.replace('http://api.elbuenmenu.site', 'https://elbuenmenu.site');
          // Asegurar que use /api/proofs/
          if (url.includes('/proofs/') && !url.includes('/api/proofs/')) {
            url = url.replace('/proofs/', '/api/proofs/');
          }
        }
        // Si es una URL completa pero no tiene /api/proofs/, agregarlo
        else if (url.startsWith('https://elbuenmenu.site') || url.startsWith('http://elbuenmenu.site')) {
          if (url.includes('/proofs/') && !url.includes('/api/proofs/')) {
            url = url.replace('/proofs/', '/api/proofs/');
          }
        }
        
        transfer.proofImageUrl = url;
      }
      return transfer;
    });
    
    res.json(objectToSnakeCase(normalizedTransfers));
  } catch (error) {
    console.error('❌ [PENDING TRANSFERS] Error:', error.message);
    console.error('❌ [PENDING TRANSFERS] Error code:', error.code);
    console.error('❌ [PENDING TRANSFERS] Error meta:', error.meta);
    
    // Si el error es por unique_code, intentar sin include order
    if (error.code === 'P2022' && error.meta?.column?.includes('unique_code')) {
      console.warn('⚠️ [PENDING TRANSFERS] unique_code no existe, obteniendo transferencias sin unique_code...');
      try {
        const transfers = await prisma.pendingTransfer.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' }
        });
        console.log(`✅ [PENDING TRANSFERS] ${transfers.length} transferencias encontradas (sin include)`);
        
        // Obtener orders por separado sin unique_code
        const transfersWithOrders = await Promise.all(
          transfers.map(async (transfer) => {
            try {
              const order = await prisma.order.findUnique({
                where: { id: transfer.orderId },
                select: {
                  id: true,
                  orderNumber: true,
                  customerName: true,
                  customerPhone: true,
                  customerAddress: true,
                  status: true,
                  paymentMethod: true,
                  paymentStatus: true,
                  subtotal: true,
                  deliveryFee: true,
                  total: true,
                  notes: true,
                  deliveryCode: true,
                  trackingToken: true,
                  deliveryPersonId: true,
                  createdAt: true,
                  updatedAt: true
                }
              });
              return { ...transfer, order };
            } catch (orderError) {
              console.warn(`⚠️ [PENDING TRANSFERS] Error obteniendo order ${transfer.orderId}:`, orderError.message);
              return { ...transfer, order: null };
            }
          })
        );
        console.log(`✅ [PENDING TRANSFERS] ${transfersWithOrders.length} transferencias con orders obtenidas`);
        
        // Normalizar URLs de comprobantes
        // SIEMPRE usar /api/proofs/... para que funcione con el endpoint del backend
        const normalizedTransfers = transfersWithOrders.map(transfer => {
          if (transfer.proofImageUrl) {
            let url = transfer.proofImageUrl;
            
            // Si la URL es relativa (empieza con /), construirla completa con /api/proofs/
            if (url.startsWith('/proofs/')) {
              // Extraer el filename
              const filename = url.replace('/proofs/', '');
              url = `https://elbuenmenu.site/api/proofs/${filename}`;
            } else if (url.startsWith('/')) {
              // Si es otra ruta relativa, asumir que es un proof y agregar /api
              const filename = url.replace(/^\/+/, '');
              url = `https://elbuenmenu.site/api/proofs/${filename}`;
            }
            // Si contiene el dominio incorrecto api.elbuenmenu.site, corregirlo
            else if (url.includes('api.elbuenmenu.site')) {
              url = url.replace('https://api.elbuenmenu.site', 'https://elbuenmenu.site');
              url = url.replace('http://api.elbuenmenu.site', 'https://elbuenmenu.site');
              // Asegurar que use /api/proofs/
              if (url.includes('/proofs/') && !url.includes('/api/proofs/')) {
                url = url.replace('/proofs/', '/api/proofs/');
              }
            }
            // Si es una URL completa pero no tiene /api/proofs/, agregarlo
            else if (url.startsWith('https://elbuenmenu.site') || url.startsWith('http://elbuenmenu.site')) {
              if (url.includes('/proofs/') && !url.includes('/api/proofs/')) {
                url = url.replace('/proofs/', '/api/proofs/');
              }
            }
            
            transfer.proofImageUrl = url;
          }
          return transfer;
        });
        
        res.json(objectToSnakeCase(normalizedTransfers));
        return;
      } catch (fallbackError) {
        console.error('❌ [PENDING TRANSFERS] Error con fallback:', fallbackError.message);
        console.error('❌ [PENDING TRANSFERS] Fallback error code:', fallbackError.code);
      }
    }
    console.error('❌ [PENDING TRANSFERS] Error fetching pending transfers:', error);
    res.status(500).json({ error: 'Error al obtener transferencias', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
});

app.post('/api/pending-transfers', async (req, res) => {
  try {
    // Normalizar la URL del comprobante ANTES de guardarla
    let proofImageUrl = req.body.proof_image_url || req.body.proofImageUrl || null;
    if (proofImageUrl) {
      // Si es una ruta relativa /proofs/..., convertirla a /api/proofs/...
      if (proofImageUrl.startsWith('/proofs/')) {
        const filename = proofImageUrl.replace('/proofs/', '');
        proofImageUrl = `/api/proofs/${filename}`;
      } else if (proofImageUrl.startsWith('/') && !proofImageUrl.startsWith('/api/')) {
        // Si es otra ruta relativa, asumir que es un proof
        const filename = proofImageUrl.replace(/^\/+/, '');
        proofImageUrl = `/api/proofs/${filename}`;
      }
      // Si ya es una URL completa, normalizarla también
      else if (proofImageUrl.includes('elbuenmenu.site')) {
        if (proofImageUrl.includes('/proofs/') && !proofImageUrl.includes('/api/proofs/')) {
          proofImageUrl = proofImageUrl.replace('/proofs/', '/api/proofs/');
        }
        if (proofImageUrl.includes('api.elbuenmenu.site')) {
          proofImageUrl = proofImageUrl.replace('https://api.elbuenmenu.site', 'https://elbuenmenu.site');
          proofImageUrl = proofImageUrl.replace('http://api.elbuenmenu.site', 'https://elbuenmenu.site');
        }
      }
    }
    
    const transferData = {
      orderId: req.body.order_id || req.body.orderId,
      amount: req.body.amount,
      status: req.body.status || 'pending',
      transferReference: req.body.transfer_reference || req.body.transferReference || null,
      proofImageUrl: proofImageUrl
    };
    let transfer;
    try {
      transfer = await prisma.pendingTransfer.create({
        data: transferData,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customerName: true,
              customerPhone: true,
              customerAddress: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              subtotal: true,
              deliveryFee: true,
              total: true,
              notes: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });
    } catch (createError) {
      if (createError.code === 'P2022' && createError.meta?.column?.includes('unique_code')) {
        console.warn('⚠️ [PENDING TRANSFERS] Error por unique_code al crear transferencia, usando raw SQL...');
        try {
          const transferId = crypto.randomUUID();
          const now = new Date().toISOString();
          const transferResult = await prisma.$queryRawUnsafe(`
            INSERT INTO pending_transfers (
              id, order_id, transfer_reference, amount, status, proof_image_url, verified_at, created_at, updated_at
            ) VALUES (
              '${transferId}',
              '${transferData.orderId}',
              ${transferData.transferReference ? `'${transferData.transferReference.replace(/'/g, "''")}'` : 'NULL'},
              ${transferData.amount || 0},
              '${transferData.status}',
              ${transferData.proofImageUrl ? `'${transferData.proofImageUrl.replace(/'/g, "''")}'` : 'NULL'},
              ${transferData.verifiedAt ? `'${new Date(transferData.verifiedAt).toISOString()}'` : 'NULL'},
              '${now}',
              '${now}'
            ) RETURNING *
          `);

          const insertedTransfer = transferResult[0];
          let orderData = null;
          try {
            const orderResult = await prisma.$queryRawUnsafe(`
              SELECT 
                o.id, o.order_number as "orderNumber", o.customer_name as "customerName",
                o.customer_phone as "customerPhone", o.customer_address as "customerAddress",
                o.status, o.payment_method as "paymentMethod", o.payment_status as "paymentStatus",
                o.subtotal, o.delivery_fee as "deliveryFee", o.total, o.notes,
                o.created_at as "createdAt", o.updated_at as "updatedAt"
              FROM orders o
              WHERE o.id = '${transferData.orderId}'
            `);
            if (orderResult && orderResult.length > 0) {
              orderData = orderResult[0];
            }
          } catch (orderError) {
            console.warn('⚠️ [PENDING TRANSFERS] No se pudo obtener el pedido asociado:', orderError.message);
          }

          transfer = {
            id: insertedTransfer.id,
            orderId: insertedTransfer.order_id,
            transferReference: insertedTransfer.transfer_reference,
            amount: parseFloat(insertedTransfer.amount),
            status: insertedTransfer.status,
            proofImageUrl: insertedTransfer.proof_image_url,
            verifiedAt: insertedTransfer.verified_at,
            createdAt: insertedTransfer.created_at,
            updatedAt: insertedTransfer.updated_at,
            order: orderData
              ? {
                  id: orderData.id,
                  orderNumber: orderData.orderNumber,
                  customerName: orderData.customerName,
                  customerPhone: orderData.customerPhone,
                  customerAddress: orderData.customerAddress,
                  status: orderData.status,
                  paymentMethod: orderData.paymentMethod,
                  paymentStatus: orderData.paymentStatus,
                  subtotal: parseFloat(orderData.subtotal),
                  deliveryFee: parseFloat(orderData.deliveryFee || 0),
                  total: parseFloat(orderData.total),
                  notes: orderData.notes,
                  createdAt: orderData.createdAt,
                  updatedAt: orderData.updatedAt
                }
              : null
          };
          console.log('✅ [PENDING TRANSFERS] Transferencia creada con raw SQL:', transfer.id);
        } catch (rawError) {
          console.error('❌ [PENDING TRANSFERS] Error al crear transferencia con raw SQL:', rawError);
          throw createError;
        }
      } else {
        throw createError;
      }
    }
    res.json(objectToSnakeCase(transfer));
  } catch (error) {
    console.error('Error creating pending transfer:', error);
    res.status(500).json({ error: 'Error al crear transferencia pendiente' });
  }
});

app.put('/api/pending-transfers/:id', async (req, res) => {
  try {
    const transferData = {};
    if (req.body.transfer_reference !== undefined || req.body.transferReference !== undefined) {
      transferData.transferReference = req.body.transfer_reference || req.body.transferReference;
    }
    if (req.body.amount !== undefined) {
      transferData.amount = req.body.amount;
    }
    if (req.body.status !== undefined) {
      transferData.status = req.body.status;
    }
    if (req.body.proof_image_url !== undefined || req.body.proofImageUrl !== undefined) {
      transferData.proofImageUrl = req.body.proof_image_url || req.body.proofImageUrl || null;
    }
    if (req.body.verified_at !== undefined || req.body.verifiedAt !== undefined) {
      transferData.verifiedAt = req.body.verified_at ? new Date(req.body.verified_at) : new Date(req.body.verifiedAt);
    }
    
    const transfer = await prisma.pendingTransfer.update({
      where: { id: req.params.id },
      data: transferData
    });
    res.json(objectToSnakeCase(transfer));
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: 'Error al actualizar transferencia' });
  }
});

// ========== REPARTIDORES ==========
app.get('/api/delivery-persons', async (req, res) => {
  try {
    const deliveryPersons = await prisma.deliveryPerson.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectToSnakeCase(deliveryPersons));
  } catch (error) {
    console.error('Error fetching delivery persons:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: 'Error al obtener repartidores', details: error.message });
  }
});

// ========== CREAR REPARTIDOR (REQUIERE AUTENTICACIÓN ADMIN) ==========
app.post('/api/delivery-persons', 
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin'), // Solo admin y super_admin
  createResourceRateLimit, // Rate limiting para creación
  validate(createDeliveryPersonSchema), // Validación con Zod
  async (req, res, next) => {
    try {
      const { name, phone, username, password, is_active } = req.body;
      
      // Verificar que el username no exista
      const existingDriver = await prisma.deliveryPerson.findUnique({
        where: { username }
      });
      
      if (existingDriver) {
        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
      }
      
      // Hashear contraseña con bcrypt
      const passwordHash = await hashPassword(password);
      
      const deliveryPersonData = {
        name,
        phone,
        username,
        passwordHash, // Guardar hash, NO password plano
        isActive: is_active !== undefined ? is_active : true
      };
      
      const deliveryPerson = await prisma.deliveryPerson.create({
        data: deliveryPersonData
      });
      
      // Log auditoría (solo si req.user existe)
      try {
        if (req.user && req.user.id) {
          await auditService.logDataModification(
            'delivery_person',
            deliveryPerson.id,
            'create',
            req.user.id,
            req.user.role || 'admin',
            { name, phone, username, is_active: deliveryPersonData.isActive }
          );
        }
      } catch (auditError) {
        // No fallar la creación si el audit log falla
        console.warn('⚠️ Error en audit log (no crítico):', auditError.message);
      }
      
      // No retornar password ni passwordHash
      const { password: _, passwordHash: __, ...driverData } = deliveryPerson;
      res.json(objectToSnakeCase(driverData));
    } catch (error) {
      next(error); // Pasar al error handler
    }
  }
);

app.put('/api/delivery-persons/:id', async (req, res) => {
  try {
    const deliveryPersonData = {};
    if (req.body.name !== undefined) {
      deliveryPersonData.name = req.body.name;
    }
    if (req.body.phone !== undefined) {
      deliveryPersonData.phone = req.body.phone;
    }
    if (req.body.is_active !== undefined || req.body.isActive !== undefined) {
      deliveryPersonData.isActive = req.body.is_active !== undefined ? req.body.is_active : req.body.isActive;
    }
    if (req.body.current_order_id !== undefined || req.body.currentOrderId !== undefined) {
      deliveryPersonData.currentOrderId = req.body.current_order_id || req.body.currentOrderId;
    }
    
    const deliveryPerson = await prisma.deliveryPerson.update({
      where: { id: req.params.id },
      data: deliveryPersonData
    });
    res.json(objectToSnakeCase(deliveryPerson));
  } catch (error) {
    console.error('Error updating delivery person:', error);
    res.status(500).json({ error: 'Error al actualizar repartidor' });
  }
});

// Endpoint para que repartidor acepte un pedido
app.post('/api/delivery-persons/:id/accept-order', async (req, res) => {
  try {
    const { order_id } = req.body;
    const deliveryPerson = await prisma.deliveryPerson.findUnique({
      where: { id: req.params.id }
    });
    
    if (!deliveryPerson) {
      return res.status(404).json({ error: 'Repartidor no encontrado' });
    }
    
    if (deliveryPerson.currentOrderId) {
      return res.status(400).json({ error: 'El repartidor ya tiene un pedido asignado' });
    }
    
    // Generar código de entrega y tracking token
    const deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();
    const trackingToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    // Actualizar pedido
    const order = await prisma.order.update({
      where: { id: order_id },
      data: {
        status: 'assigned',
        deliveryPersonId: req.params.id,
        deliveryCode: deliveryCode,
        trackingToken: trackingToken
      },
      include: {
        items: true,
        deliveryPerson: true
      }
    });
    
    // Actualizar repartidor
    await prisma.deliveryPerson.update({
      where: { id: req.params.id },
      data: {
        currentOrderId: order_id
      }
    });
    
    // Notificar al cliente
    if (order.customerPhone && order.customerPhone.trim() !== '') {
      try {
        const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
        console.log(`📤 Enviando notificación a ${order.customerPhone} para pedido ${order.orderNumber}`);
        const response = await fetch(`${webhookUrl}/notify-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            status: 'assigned',
            deliveryCode: deliveryCode,
            message: `🛵 ¡Tu pedido va en camino!\n\n🔐 *Código de entrega: ${deliveryCode}*\n\n📍 Podés seguir al repartidor en tiempo real:\n${process.env.FRONTEND_URL || 'https://elbuenmenu.site'}/track/${trackingToken}\n\n⏰ Llegada estimada: 15-20 minutos\n\n¡Gracias por elegirnos! ❤️`
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error en webhook (${response.status}):`, errorText);
        } else {
          const result = await response.json();
          console.log(`✅ Notificación enviada exitosamente:`, result);
        }
      } catch (error) {
        console.error('❌ Error notifying customer:', error);
        console.error('❌ Stack:', error.stack);
      }
    } else {
      console.warn(`⚠️ No se puede notificar: customerPhone está vacío o no existe para pedido ${order.orderNumber}`);
    }
    
    res.json(objectToSnakeCase(order));
  } catch (error) {
    console.error('Error accepting order:', error);
    res.status(500).json({ error: 'Error al aceptar pedido' });
  }
});

// Endpoint para que repartidor entregue un pedido con código
app.post('/api/delivery-persons/:id/deliver-order', async (req, res) => {
  try {
    const { order_id, delivery_code } = req.body;
    const deliveryPerson = await prisma.deliveryPerson.findUnique({
      where: { id: req.params.id }
    });
    
    if (!deliveryPerson) {
      return res.status(404).json({ error: 'Repartidor no encontrado' });
    }
    
    const order = await prisma.order.findUnique({
      where: { id: order_id }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    if (order.deliveryCode !== delivery_code) {
      // Código incorrecto - deshabilitar efectivo para este cliente
      if (order.customerPhone) {
        try {
          // Buscar o crear cliente
          let customer = await prisma.customer.findUnique({
            where: { phone: order.customerPhone }
          });
          
          if (!customer) {
            customer = await prisma.customer.create({
              data: {
                phone: order.customerPhone,
                name: order.customerName,
                disabledPaymentMethods: JSON.stringify(['efectivo'])
              }
            });
          } else {
            const disabledMethods = customer.disabledPaymentMethods 
              ? JSON.parse(customer.disabledPaymentMethods)
              : [];
            if (!disabledMethods.includes('efectivo')) {
              disabledMethods.push('efectivo');
              await prisma.customer.update({
                where: { id: customer.id },
                data: {
                  disabledPaymentMethods: JSON.stringify(disabledMethods)
                }
              });
            }
          }
        } catch (error) {
          console.error('Error disabling payment method:', error);
        }
      }
      
      return res.status(400).json({ 
        error: 'Código de entrega incorrecto. El método de pago en efectivo ha sido deshabilitado para este cliente.' 
      });
    }
    
    // Código correcto - marcar como entregado
    const updatedOrder = await prisma.order.update({
      where: { id: order_id },
      data: {
        status: 'delivered'
      }
    });
    
    // Liberar repartidor y aumentar contador
    await prisma.deliveryPerson.update({
      where: { id: req.params.id },
      data: {
        currentOrderId: null,
        totalDeliveries: { increment: 1 }
      }
    });
    
    // Registrar transacción de saldo (+3000)
    await prisma.driverBalanceTransaction.create({
      data: {
        driverId: req.params.id,
        orderId: order_id,
        type: 'delivery',
        amount: 3000,
        reference: `Entrega pedido ${order.orderNumber}`
      }
    });
    
    // Actualizar saldo del repartidor
    await prisma.deliveryPerson.update({
      where: { id: req.params.id },
      data: {
        balance: { increment: 3000 }
      }
    });
    
    // Notificar al cliente
    if (order.customerPhone && order.customerPhone.trim() !== '') {
      try {
        const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
        console.log(`📤 [NOTIFICACIÓN] Enviando notificación de entrega a ${order.customerPhone} para pedido ${order.orderNumber}`);
        const response = await fetch(`${webhookUrl}/notify-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            status: 'delivered',
            message: '🎉 ¡Pedido entregado exitosamente!\n\n✅ Esperamos que disfrutes tu comida.\n\n⭐ ¡Gracias por elegirnos! Te esperamos en tu próximo pedido.\n\n❤️ El Buen Menú'
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [NOTIFICACIÓN] Error en webhook (${response.status}):`, errorText);
        } else {
          const result = await response.json();
          console.log(`✅ [NOTIFICACIÓN] Notificación enviada exitosamente:`, result);
        }
      } catch (error) {
        console.error('❌ [NOTIFICACIÓN] Error notifying customer:', error);
        console.error('❌ [NOTIFICACIÓN] Stack:', error.stack);
      }
    } else {
      console.warn(`⚠️ [NOTIFICACIÓN] No se puede notificar: customerPhone está vacío o no existe para pedido ${order.orderNumber}`);
    }
    
    res.json(objectToSnakeCase(updatedOrder));
  } catch (error) {
    console.error('Error delivering order:', error);
    res.status(500).json({ error: 'Error al entregar pedido' });
  }
});

// ========== CLIENTES ==========
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectToSnakeCase(customers));
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const customerData = {
      phone: req.body.phone,
      name: req.body.name,
      isBlocked: req.body.is_blocked !== undefined ? req.body.is_blocked : (req.body.isBlocked !== undefined ? req.body.isBlocked : false),
      disabledPaymentMethods: req.body.disabled_payment_methods ? JSON.stringify(req.body.disabled_payment_methods) : null,
      notes: req.body.notes
    };
    const customer = await prisma.customer.create({
      data: customerData
    });
    res.json(objectToSnakeCase(customer));
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const customerData = {};
    if (req.body.name !== undefined) {
      customerData.name = req.body.name;
    }
    if (req.body.phone !== undefined) {
      customerData.phone = req.body.phone;
    }
    if (req.body.is_blocked !== undefined || req.body.isBlocked !== undefined) {
      customerData.isBlocked = req.body.is_blocked !== undefined ? req.body.is_blocked : req.body.isBlocked;
    }
    if (req.body.disabled_payment_methods !== undefined || req.body.disabledPaymentMethods !== undefined) {
      customerData.disabledPaymentMethods = JSON.stringify(req.body.disabled_payment_methods || req.body.disabledPaymentMethods);
    }
    if (req.body.notes !== undefined) {
      customerData.notes = req.body.notes;
    }
    
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: customerData
    });
    res.json(objectToSnakeCase(customer));
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// ========== APROBAR PEDIDO (REQUIERE AUTENTICACIÓN ADMIN) ==========
app.post('/api/orders/:id/approve',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin', 'operator'), // Admin, super_admin o operator
  endpointRateLimit('approve_order', 20, 15 * 60 * 1000), // 20 aprobaciones por 15 min
  async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Validar transición de estado
    const stateValidation = await orderStateValidator.validateOrderStatusChange(
      order.id,
      'confirmed',
      req.user.role
    );

    if (!stateValidation.valid) {
      return res.status(400).json({ error: stateValidation.error });
    }
    
    // Aprobar pedido - cambiar a confirmed y luego a preparing
    const approvedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: { 
        status: 'confirmed',
        paymentStatus: 'confirmed'
      }
    });

    // Log auditoría
    await auditService.logOrderApproval(
      order.id,
      true,
      req.user.id,
      req.user.role
    );

    // Log cambio de estado
    await auditService.logOrderStatusChange(
      order.id,
      order.status,
      'confirmed',
      req.user.id,
      req.user.role
    );
    
    // Notificar al cliente
    if (order.customerPhone && order.customerPhone.trim() !== '') {
      try {
        // Obtener IUC del cliente para incluirlo en el mensaje
        const customer = await prisma.customer.findUnique({
          where: { phone: order.customerPhone }
        });
        
        const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
        let message = `✅ ¡Tu pedido ${order.orderNumber} ha sido aprobado!\n\n🍔 Estamos preparando tu pedido\n⏰ Tiempo estimado: 20-30 minutos\n📱 Te avisaremos cuando esté listo\n\n`;
        
        // Incluir IUC en el mensaje si está disponible
        if (customer && customer.iuc) {
          message += `🔐 Tu identificador único (IUC): ${customer.iuc}\n\n`;
          message += `💡 Para consultar este pedido en el futuro, enviá:\n*PEDIDO CONFIRMADO - ${customer.iuc} - El Buen Menú*\n\nCódigo de pedido: ${order.orderNumber}\n\n`;
        }
        
        message += `¡Gracias por elegirnos! ❤️`;
        
        const response = await fetch(`${webhookUrl}/notify-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            status: 'confirmed',
            message: message
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error en webhook (${response.status}):`, errorText);
        } else {
          console.log(`✅ Notificación de aprobación enviada exitosamente`);
        }
      } catch (error) {
        console.error('❌ Error notifying customer:', error);
      }
    }
    
    res.json(objectToSnakeCase(approvedOrder));
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({ error: 'Error al aprobar pedido' });
  }
});

// ========== RECHAZAR PEDIDO (REQUIERE AUTENTICACIÓN ADMIN) ==========
app.post('/api/orders/:id/reject',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin', 'operator'), // Admin, super_admin o operator
  endpointRateLimit('reject_order', 20, 15 * 60 * 1000), // 20 rechazos por 15 min
  async (req, res, next) => {
  try {
    const { reason } = req.body; // Razón opcional del rechazo
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { deliveryPerson: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Validar transición de estado
    const stateValidation = await orderStateValidator.validateOrderStatusChange(
      order.id,
      'cancelled',
      req.user.role
    );

    if (!stateValidation.valid) {
      return res.status(400).json({ error: stateValidation.error });
    }
    
    // Liberar repartidor si tiene uno asignado
    if (order.deliveryPersonId) {
      await prisma.deliveryPerson.update({
        where: { id: order.deliveryPersonId },
        data: { currentOrderId: null }
      });
    }
    
    // Rechazar/Cancelar pedido
    const rejectedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' }
    });

    // Log auditoría
    await auditService.logOrderApproval(
      order.id,
      false,
      req.user.id,
      req.user.role,
      reason
    );

    // Log cambio de estado
    await auditService.logOrderStatusChange(
      order.id,
      order.status,
      'cancelled',
      req.user.id,
      req.user.role
    );
    
    // Notificar al cliente
    if (order.customerPhone && order.customerPhone.trim() !== '') {
      try {
        const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
        const rejectionMessage = reason 
          ? `❌ Lamentamos informarte que tu pedido ${order.orderNumber} ha sido rechazado.\n\n📝 Motivo: ${reason}\n\n💬 Si tenés alguna consulta o necesitás ayuda, no dudés en contactarnos.\n\nEstamos aquí para ayudarte. ❤️`
          : `❌ Lamentamos informarte que tu pedido ${order.orderNumber} ha sido rechazado.\n\n💬 Si tenés alguna consulta o necesitás ayuda, no dudés en contactarnos.\n\nEstamos aquí para ayudarte. ❤️`;
        
        const response = await fetch(`${webhookUrl}/notify-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            status: 'cancelled',
            message: rejectionMessage
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error en webhook (${response.status}):`, errorText);
        } else {
          console.log(`✅ Notificación de rechazo enviada exitosamente`);
        }
      } catch (error) {
        console.error('❌ Error notifying customer:', error);
      }
    }
    
    res.json(objectToSnakeCase(rejectedOrder));
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({ error: 'Error al rechazar pedido' });
  }
});

// Endpoint para cancelar pedido (mantener compatibilidad)
// Endpoint para notificar al cliente desde el frontend
app.post('/api/orders/:id/notify', corsMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { customerPhone, orderNumber, message } = req.body;
    
    if (!customerPhone) {
      return res.status(400).json({ error: 'customerPhone es requerido' });
    }
    
    if (!message) {
      return res.status(400).json({ error: 'message es requerido' });
    }
    
    // En producción, el bot corre en localhost:3001 en el mismo servidor
    // Si BOT_WEBHOOK_URL está configurado, usarlo; si no, usar localhost
    let webhookUrl = process.env.BOT_WEBHOOK_URL;
    
    // Si BOT_WEBHOOK_URL apunta a elbuenmenu.site (frontend), usar localhost en su lugar
    if (!webhookUrl || webhookUrl.includes('elbuenmenu.site')) {
      webhookUrl = 'http://localhost:3001';
      console.log(`⚠️ [NOTIFY] BOT_WEBHOOK_URL no configurado o apunta al frontend, usando localhost:3001`);
    }
    
    const notifyUrl = `${webhookUrl}/notify-order`;
    console.log(`📤 [NOTIFY] Enviando notificación desde frontend a ${customerPhone} para pedido ${orderNumber || orderId}`);
    console.log(`📤 [NOTIFY] URL del bot: ${notifyUrl}`);
    
    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerPhone,
        orderNumber: orderNumber || null,
        message
      })
    });
    
    // Verificar si la respuesta es HTML (error común)
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    
    if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      console.error(`❌ [NOTIFY] El bot devolvió HTML en lugar de JSON. URL: ${notifyUrl}`);
      console.error(`❌ [NOTIFY] Respuesta HTML (primeros 500 caracteres):`, responseText.substring(0, 500));
      return res.status(500).json({ 
        error: 'Error al enviar notificación', 
        details: `El bot devolvió HTML en lugar de JSON. Verifica que el bot esté corriendo y que BOT_WEBHOOK_URL sea correcta. URL intentada: ${notifyUrl}` 
      });
    }
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText.substring(0, 200) };
      }
      console.error(`❌ [NOTIFY] Error en webhook (${response.status}):`, errorData);
      return res.status(response.status).json({ error: 'Error al enviar notificación', details: errorData.error || errorData.message || responseText.substring(0, 200) });
    }
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ [NOTIFY] Error al parsear respuesta JSON:`, parseError);
      console.error(`❌ [NOTIFY] Respuesta recibida:`, responseText.substring(0, 500));
      return res.status(500).json({ 
        error: 'Error al enviar notificación', 
        details: `El bot devolvió una respuesta inválida. Respuesta: ${responseText.substring(0, 200)}` 
      });
    }
    
    console.log(`✅ [NOTIFY] Notificación enviada exitosamente:`, result);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ [NOTIFY] Error al enviar notificación:', error);
    res.status(500).json({ error: 'Error al enviar notificación', details: error.message });
  }
});

app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { deliveryPerson: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    // Liberar repartidor si tiene uno asignado
    if (order.deliveryPersonId) {
      await prisma.deliveryPerson.update({
        where: { id: order.deliveryPersonId },
        data: { currentOrderId: null }
      });
    }
    
    // Cancelar pedido
    const cancelledOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' }
    });
    
    // Notificar al cliente
    if (order.customerPhone && order.customerPhone.trim() !== '') {
      try {
        const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
        console.log(`📤 Enviando notificación a ${order.customerPhone} para pedido ${order.orderNumber}`);
        const response = await fetch(`${webhookUrl}/notify-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            status: 'cancelled',
            message: '❌ Lamentamos informarte que tu pedido ha sido cancelado.\n\n💬 Si tenés alguna consulta o necesitás ayuda, no dudés en contactarnos.\n\nEstamos aquí para ayudarte. ❤️'
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error en webhook (${response.status}):`, errorText);
        } else {
          const result = await response.json();
          console.log(`✅ Notificación enviada exitosamente:`, result);
        }
      } catch (error) {
        console.error('❌ Error notifying customer:', error);
        console.error('❌ Stack:', error.stack);
      }
    } else {
      console.warn(`⚠️ No se puede notificar: customerPhone está vacío o no existe para pedido ${order.orderNumber}`);
    }
    
    res.json(objectToSnakeCase(cancelledOrder));
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Error al cancelar pedido' });
  }
});

// ========== AUTENTICACIÓN DE REPARTIDORES ==========
app.post('/api/delivery/login',
  loginRateLimit, // Rate limiting para login
  validate(loginDriverSchema), // Validación con Zod
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const deviceInfo = req.headers['user-agent'] || 'Unknown';
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
      
      // Login usando servicio de autenticación
      const result = await driverAuthService.loginDriver(username, password, deviceInfo, ipAddress);
      
      res.json(objectToSnakeCase(result));
    } catch (error) {
      // Error genérico para no revelar si el usuario existe o no
      if (error.message.includes('Credenciales') || error.message.includes('desactivada')) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      next(error);
    }
  }
);

// ========== ACTUALIZAR UBICACIÓN DE REPARTIDOR (REQUIERE AUTENTICACIÓN) ==========
app.post('/api/delivery/location',
  authenticateDriver, // Verificar JWT
  authorizeDriver, // Verificar que driver_id = driver logueado
  deliveryLocationRateLimit, // Rate limiting específico para ubicación
  validate(locationUpdateSchema), // Validación con Zod
  async (req, res, next) => {
    try {
      const { driver_id, lat, lng } = req.body;
      
      // Validar coordenadas de Argentina (opcional pero recomendado)
      if (lat < -55 || lat > -21 || lng < -73 || lng > -53) {
        console.warn('Coordenadas fuera de Argentina', { driver_id, lat, lng });
        // Permitir pero loguear para revisar
      }
      
      const driver = await prisma.deliveryPerson.update({
        where: { id: driver_id },
        data: {
          lastLat: lat,
          lastLng: lng,
          lastSeenAt: new Date()
        }
      });
      
      res.json({ success: true, driver: objectToSnakeCase(driver) });
    } catch (error) {
      next(error);
    }
  }
);

// ========== TRACKING DE PEDIDO ==========
app.get('/api/track/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        deliveryPerson: true,
        items: true
      }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    
    // Preparar datos para tracking
    const trackingData = {
      order: {
        id: order.id,
        order_number: order.orderNumber,
        status: order.status,
        customer_name: order.customerName,
        customer_address: order.customerAddress,
        customer_lat: order.customerLat,
        customer_lng: order.customerLng,
        delivery_code: order.deliveryCode,
        created_at: order.createdAt
      },
      driver: order.deliveryPerson ? {
        id: order.deliveryPerson.id,
        name: order.deliveryPerson.name,
        last_lat: order.deliveryPerson.lastLat,
        last_lng: order.deliveryPerson.lastLng,
        last_seen_at: order.deliveryPerson.lastSeenAt
      } : null
    };
    
    res.json(objectToSnakeCase(trackingData));
  } catch (error) {
    console.error('Error obteniendo tracking:', error);
    res.status(500).json({ error: 'Error al obtener información de tracking' });
  }
});

// ========== PEDIDOS DISPONIBLES PARA REPARTIDOR ==========
app.get('/api/delivery/available-orders',
  authenticateDriver, // Requiere autenticación
  deliveryPollingRateLimit, // Rate limiting específico para polling
  async (req, res) => {
  try {
    // Usar select explícito para evitar problemas con unique_code que puede no existir
    const orders = await prisma.order.findMany({
      where: {
        // Incluir pedidos confirmados, preparando y listos (approved se convierte en confirmed)
        status: { in: ['confirmed', 'preparing', 'ready'] },
        deliveryPersonId: null,
        // Excluir pedidos de retiro (solo pedidos a domicilio: deliveryFee > 0)
        deliveryFee: { gt: 0 }
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        customerLat: true,
        customerLng: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotal: true,
        deliveryFee: true,
        total: true,
        notes: true,
        deliveryCode: true,
        trackingToken: true,
        deliveryPersonId: true,
        createdAt: true,
        updatedAt: true,
        items: true
      },
      orderBy: { createdAt: 'asc' }
    });
    
    res.json(objectToSnakeCase(orders));
  } catch (error) {
    console.error('Error obteniendo pedidos disponibles:', error);
    console.error('Error details:', error.message, error.stack);
    console.error('Error code:', error.code);
    res.status(500).json({ 
      error: 'Error al obtener pedidos disponibles', 
      details: error.message,
      code: error.code 
    });
  }
});

// ========== ACEPTAR PEDIDO (REPARTIDOR - REQUIERE AUTENTICACIÓN) ==========
app.post('/api/delivery/accept-order',
  authenticateDriver, // Verificar JWT
  authorizeDriver, // Verificar que driver_id = driver logueado
  async (req, res, next) => {
    try {
      const { driver_id, order_id } = req.body;
      
      if (!driver_id || !order_id) {
        return res.status(400).json({ error: 'driver_id y order_id son requeridos' });
      }
      
      const driver = await prisma.deliveryPerson.findUnique({
        where: { id: driver_id }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Repartidor no encontrado' });
      }
      
      if (driver.currentOrderId) {
        return res.status(400).json({ error: 'Ya tienes un pedido activo' });
      }
      
      // Verificar si hay otro pedido con este deliveryPersonId (por si hay inconsistencias)
      const existingOrderWithDriver = await prisma.order.findUnique({
        where: { deliveryPersonId: driver_id },
        select: { id: true, status: true, orderNumber: true }
      });
      
      if (existingOrderWithDriver && existingOrderWithDriver.id !== order_id) {
        // Hay un pedido anterior con este repartidor asignado
        // Si el pedido está completado o cancelado, limpiar la asignación
        if (existingOrderWithDriver.status === 'delivered' || existingOrderWithDriver.status === 'cancelled') {
          await prisma.order.update({
            where: { id: existingOrderWithDriver.id },
            data: { deliveryPersonId: null }
          });
        } else {
          // Si el pedido está activo, rechazar la operación
          return res.status(400).json({ 
            error: 'Ya tienes otro pedido asignado',
            details: `Pedido #${existingOrderWithDriver.orderNumber} está en estado: ${existingOrderWithDriver.status}`
          });
        }
      }
      
      // Generar código de entrega usando servicio
      const deliveryCode = deliveryCodeService.generateDeliveryCode();
      const trackingToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      // Actualizar pedido y repartidor en transacción atómica
      const order = await prisma.$transaction(async (tx) => {
        // Usar select explícito para evitar problemas con unique_code que puede no existir
        const updatedOrder = await tx.order.update({
          where: { id: order_id },
          data: {
            status: 'assigned',
            deliveryPersonId: driver_id,
            deliveryCode: deliveryCode,
            trackingToken: trackingToken
          },
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            customerLat: true,
            customerLng: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            subtotal: true,
            deliveryFee: true,
            total: true,
            notes: true,
            deliveryCode: true,
            trackingToken: true,
            deliveryPersonId: true,
            createdAt: true,
            updatedAt: true,
            items: true,
            deliveryPerson: {
              select: {
                id: true,
                name: true,
                phone: true,
                username: true,
                isActive: true
              }
            }
          }
        });
        
        // Actualizar repartidor
        await tx.deliveryPerson.update({
          where: { id: driver_id },
          data: {
            currentOrderId: order_id
          }
        });
        
        return updatedOrder;
      });
      
      // Verificar si es pago en efectivo y envío a domicilio para notificar al repartidor
      const paymentMethod = (order.paymentMethod || '').toLowerCase();
      const isCashPayment = paymentMethod.includes('efectivo') || paymentMethod === 'cash' || paymentMethod === 'efectivo';
      const isDelivery = order.deliveryFee && order.deliveryFee > 0;
      const needsCashCollection = isCashPayment && isDelivery;

      // Notificar al cliente vía WhatsApp
      if (order.customerPhone && order.customerPhone.trim() !== '') {
        try {
          const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
          const trackingUrl = `${process.env.FRONTEND_URL || 'https://elbuenmenu.site'}/track/${trackingToken}`;
          
          await fetch(`${webhookUrl}/notify-order`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': process.env.INTERNAL_API_KEY || ''
            },
            body: JSON.stringify({
              customerPhone: order.customerPhone,
              orderNumber: order.orderNumber,
              message: `🛵 ¡Tu pedido está en camino!\n\n🔐 *Código de entrega: ${deliveryCode}*\n\n📍 Podés seguir al repartidor en tiempo real:\n${trackingUrl}\n\n⏰ Llegada estimada: 15-20 minutos\n\n¡Gracias por elegirnos! ❤️`
            })
          });
        } catch (error) {
          console.error('Error notificando cliente:', error);
        }
      }

      // Notificar al repartidor si debe cobrar en efectivo
      if (needsCashCollection && driver.phone) {
        try {
          const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
          const formattedAmount = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(order.total);
          
          await fetch(`${webhookUrl}/notify-order`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': process.env.INTERNAL_API_KEY || ''
            },
            body: JSON.stringify({
              customerPhone: driver.phone,
              orderNumber: order.orderNumber,
              message: `💵 *IMPORTANTE - COBRO EN EFECTIVO*\n\n📦 Pedido: ${order.orderNumber}\n💰 Monto a cobrar: ${formattedAmount}\n📍 Dirección: ${order.customerAddress || 'N/A'}\n👤 Cliente: ${order.customerName || 'N/A'}\n\n⚠️ *Debes cobrar este monto al entregar el pedido*\n\nEl cobro quedará registrado automáticamente cuando entregues el pedido.`
            })
          });
          console.log(`✅ Notificación de cobro en efectivo enviada al repartidor ${driver.name} (${driver.phone})`);
        } catch (error) {
          console.error('Error notificando repartidor sobre cobro en efectivo:', error);
        }
      }
      
      // Incluir información sobre cobro en efectivo en la respuesta
      const responseOrder = objectToSnakeCase(order);
      responseOrder.needs_cash_collection = needsCashCollection;
      if (needsCashCollection) {
        responseOrder.cash_collection_amount = order.total;
      }
      
      res.json(responseOrder);
    } catch (error) {
      console.error('Error aceptando pedido:', error);
      console.error('Error details:', error.message, error.stack);
      console.error('Error code:', error.code);
      res.status(500).json({ 
        error: 'Error al aceptar pedido', 
        details: error.message,
        code: error.code 
      });
    }
  }
);

// ========== ACTUALIZAR ESTADO DE PEDIDO (REQUIERE AUTENTICACIÓN) ==========
app.post('/api/delivery/update-order-status',
  authenticateDriver, // Verificar JWT
  authorizeDriver, // Verificar que driver_id = driver logueado
  async (req, res, next) => {
    try {
      const { driver_id, order_id, status } = req.body;
      
      if (!driver_id || !order_id || !status) {
        return res.status(400).json({ error: 'driver_id, order_id y status son requeridos' });
      }
      
      // Usar select explícito para evitar problemas con unique_code
      const order = await prisma.order.findUnique({
        where: { id: order_id },
        select: {
          id: true,
          status: true,
          deliveryPersonId: true
        }
      });
      
      if (!order || order.deliveryPersonId !== driver_id) {
        return res.status(403).json({ error: 'No tienes permiso para actualizar este pedido' });
      }

      // Validar transición de estado
      const stateValidation = await orderStateValidator.validateOrderStatusChange(
        order_id,
        status,
        'driver'
      );

      if (!stateValidation.valid) {
        return res.status(400).json({ error: stateValidation.error });
      }
      
      // Actualizar estado del pedido
      // Usar select explícito para evitar problemas con unique_code
      const updatedOrder = await prisma.order.update({
        where: { id: order_id },
        data: { status: status },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          customerLat: true,
          customerLng: true,
          status: true,
          paymentMethod: true,
          paymentStatus: true,
          subtotal: true,
          deliveryFee: true,
          total: true,
          notes: true,
          deliveryCode: true,
          trackingToken: true,
          deliveryPersonId: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Log cambio de estado
      await auditService.logOrderStatusChange(
        order_id,
        order.status,
        status,
        driver_id,
        'driver'
      );
      
      // Enviar notificación al cliente cuando el repartidor marca "voy en camino" (in_transit)
      if (status === 'in_transit' && updatedOrder.customerPhone && updatedOrder.customerPhone.trim() !== '') {
        try {
          const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
          // Si BOT_WEBHOOK_URL apunta al frontend, usar localhost para el bot
          const botUrl = webhookUrl.includes('elbuenmenu.site') && !webhookUrl.includes('api.') 
            ? 'http://localhost:3001' 
            : webhookUrl;
          
          const trackingUrl = `${process.env.FRONTEND_URL || 'https://elbuenmenu.site'}/track/${updatedOrder.trackingToken}`;
          const deliveryCode = updatedOrder.deliveryCode || 'N/A';
          
          const notificationMessage = `🛵 ¡Tu pedido está en camino!\n\n🔐 *Código de entrega: ${deliveryCode}*\n\n📍 Podés seguir al repartidor en tiempo real:\n${trackingUrl}\n\n⏰ Llegada estimada: 15-20 minutos\n\n¡Gracias por elegirnos! ❤️`;
          
          const notifyResponse = await fetch(`${botUrl}/notify-order`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': process.env.INTERNAL_API_KEY || ''
            },
            body: JSON.stringify({
              customerPhone: updatedOrder.customerPhone,
              orderNumber: updatedOrder.orderNumber,
              message: notificationMessage
            })
          });
          
          if (!notifyResponse.ok) {
            const responseText = await notifyResponse.text();
            // Verificar si la respuesta es HTML (el bot no está corriendo o la URL está mal)
            if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
              console.warn('⚠️ [UPDATE ORDER STATUS] El bot devolvió HTML en lugar de JSON. Verifica que el bot esté corriendo.');
            } else {
              console.error('⚠️ [UPDATE ORDER STATUS] Error al notificar cliente:', responseText);
            }
          } else {
            console.log(`✅ [UPDATE ORDER STATUS] Notificación enviada al cliente ${updatedOrder.customerPhone} para pedido ${updatedOrder.orderNumber}`);
          }
        } catch (error) {
          console.error('⚠️ [UPDATE ORDER STATUS] Error notificando cliente:', error.message);
          // No fallar la actualización del estado si falla la notificación
        }
      }
      
      res.json(objectToSnakeCase(updatedOrder));
    } catch (error) {
      console.error('Error actualizando estado de pedido:', error);
      console.error('Error details:', error.message, error.stack);
      console.error('Error code:', error.code);
      res.status(500).json({ 
        error: 'Error al actualizar estado del pedido', 
        details: error.message,
        code: error.code 
      });
    }
  }
);

// ========== ENTREGAR PEDIDO CON CÓDIGO (REQUIERE AUTENTICACIÓN + RATE LIMITING) ==========
app.post('/api/delivery/deliver-order',
  authenticateDriver, // Verificar JWT
  authorizeDriver, // Verificar que driver_id = driver logueado
  deliveryCodeRateLimit, // Rate limiting para códigos
  validate(deliverOrderSchema), // Validación con Zod
  async (req, res, next) => {
    try {
      const { driver_id, order_id, delivery_code } = req.body;
      
      // 1. Obtener pedido (usar select explícito para evitar unique_code)
      const order = await prisma.order.findUnique({
        where: { id: order_id },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          status: true,
          paymentMethod: true,
          deliveryFee: true,
          total: true,
          deliveryCode: true,
          deliveryPersonId: true
        }
      });
      
      if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }
      
      if (order.deliveryPersonId !== driver_id) {
        return res.status(403).json({ error: 'No tienes permiso para entregar este pedido' });
      }
      
      if (!order.deliveryCode) {
        return res.status(400).json({ error: 'Este pedido no tiene código de entrega asignado' });
      }
      
      // 2. Validar código usando servicio (con límite de intentos)
      const validation = await deliveryCodeService.validateDeliveryCode(
        delivery_code,
        order.deliveryCode,
        order_id,
        driver_id
      );

      // Log intento de código
      await auditService.logDeliveryCodeAttempt(
        order_id,
        driver_id,
        validation.valid,
        validation.attempts
      );
      
      if (!validation.valid) {
        // Si es el último intento, deshabilitar efectivo para el cliente
        if (validation.attempts >= 5 && order.customerPhone) {
          try {
            let customer = await prisma.customer.findUnique({
              where: { phone: order.customerPhone }
            });
            
            if (!customer) {
              customer = await prisma.customer.create({
                data: {
                  phone: order.customerPhone,
                  name: order.customerName,
                  disabledPaymentMethods: JSON.stringify(['efectivo'])
                }
              });
            } else {
              const disabledMethods = customer.disabledPaymentMethods 
                ? JSON.parse(customer.disabledPaymentMethods)
                : [];
              if (!disabledMethods.includes('efectivo')) {
                disabledMethods.push('efectivo');
                await prisma.customer.update({
                  where: { id: customer.id },
                  data: { disabledPaymentMethods: JSON.stringify(disabledMethods) }
                });
              }
            }
          } catch (error) {
            console.error('Error deshabilitando método de pago:', error);
          }
        }
        
        return res.status(400).json({
          error: 'Código de entrega incorrecto',
          attempts: validation.attempts,
          remaining: Math.max(0, 5 - validation.attempts)
        });
      }
      
      // 3. Verificar si es pago en efectivo y envío a domicilio
      const paymentMethod = (order.paymentMethod || '').toLowerCase();
      const isCashPayment = paymentMethod.includes('efectivo') || paymentMethod === 'cash' || paymentMethod === 'efectivo';
      const isDelivery = order.deliveryFee && order.deliveryFee > 0;
      const needsCashCollection = isCashPayment && isDelivery;

      // 4. Marcar como entregado, liberar repartidor, registrar cobro en efectivo (si aplica) y sumar saldo (transacción atómica)
      await prisma.$transaction(async (tx) => {
        // Actualizar pedido
        await tx.order.update({
          where: { id: order_id },
          data: { status: 'delivered', deliveryCode: null } // Eliminar código después de usar
        });
        
        // Liberar repartidor
        await tx.deliveryPerson.update({
          where: { id: driver_id },
          data: {
            currentOrderId: null,
            totalDeliveries: { increment: 1 }
          }
        });
        
        // Si es pago en efectivo y envío a domicilio, registrar el cobro en efectivo
        if (needsCashCollection) {
          try {
            await balanceService.addCashCollectionForDelivery(
              driver_id,
              order_id,
              order.total,
              order.customerAddress,
              tx
            );
            console.log(`✅ Cobro en efectivo registrado: $${order.total} para pedido ${order.orderNumber}`);
          } catch (error) {
            console.error('Error registrando cobro en efectivo:', error);
            // No fallar la entrega si hay un error al registrar el cobro
          }
        }
        
        // Sumar saldo por entrega (solo una vez, usando servicio con cliente de transacción)
        await balanceService.addBalanceForDelivery(driver_id, order_id, 3000, tx);
      });
      
      // 4. Notificar al cliente
      if (order.customerPhone && order.customerPhone.trim() !== '') {
        try {
          const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
          await fetch(`${webhookUrl}/notify-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.INTERNAL_API_KEY || '' },
            body: JSON.stringify({
              customerPhone: order.customerPhone,
              orderNumber: order.orderNumber,
              message: '🎉 ¡Pedido entregado exitosamente!\n\n✅ Esperamos que disfrutes tu comida.\n\n⭐ ¡Gracias por elegirnos!'
            })
          });
        } catch (error) {
          console.error('Error notificando cliente:', error);
        }
      }
      
      // Mensaje de respuesta según si hubo cobro en efectivo
      let successMessage = 'Entrega registrada. Se sumaron $3000 a tu saldo.';
      if (needsCashCollection) {
        const formattedAmount = new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(order.total);
        successMessage = `Entrega registrada.\n\n💰 Cobro en efectivo: ${formattedAmount}\n✅ Entrega: +$3000\n\nTotal agregado a tu saldo: ${new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(order.total + 3000)}`;
      }

      res.json({ 
        success: true,
        message: successMessage,
        cash_collected: needsCashCollection ? order.total : 0,
        delivery_fee: 3000,
        total_added: needsCashCollection ? order.total + 3000 : 3000
      });
    } catch (error) {
      console.error('Error entregando pedido:', error);
      console.error('Error details:', error.message, error.stack);
      console.error('Error code:', error.code);
      res.status(500).json({ 
        error: 'Error al entregar pedido', 
        details: error.message,
        code: error.code 
      });
    }
  }
);

// ========== CANCELAR ENTREGA (REQUIERE AUTENTICACIÓN) ==========
app.post('/api/delivery/cancel-delivery',
  authenticateDriver,
  authorizeDriver,
  validate(cancelDeliverySchema),
  async (req, res) => {
    try {
      const { driver_id, order_id, reason, notes } = req.body;
      
      // Obtener pedido con select explícito
      const order = await prisma.order.findUnique({
        where: { id: order_id },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          status: true,
          paymentMethod: true,
          deliveryFee: true,
          total: true,
          deliveryPersonId: true
        }
      });
      
      if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }
      
      if (order.deliveryPersonId !== driver_id) {
        return res.status(403).json({ error: 'No tienes permiso para cancelar este pedido' });
      }
      
      if (order.status === 'delivered' || order.status === 'cancelled') {
        return res.status(400).json({ error: 'Este pedido ya fue entregado o cancelado' });
      }
      
      // Verificar si es pago en efectivo
      const paymentMethod = (order.paymentMethod || '').toLowerCase();
      const isCashPayment = paymentMethod.includes('efectivo') || paymentMethod === 'cash' || paymentMethod === 'efectivo';
      
      // Transacción atómica: cancelar pedido, liberar repartidor, aplicar strike si es efectivo
      await prisma.$transaction(async (tx) => {
        // Cancelar pedido
        await tx.order.update({
          where: { id: order_id },
          data: { 
            status: 'cancelled',
            notes: notes ? `${order.notes || ''}\n[CANCELADO POR REPARTIDOR] ${reason}${notes ? ': ' + notes : ''}`.trim() : order.notes
          }
        });
        
        // Liberar repartidor (NO se paga el viaje)
        await tx.deliveryPerson.update({
          where: { id: driver_id },
          data: {
            currentOrderId: null
          }
        });
        
        // Si es pago en efectivo, aplicar strike al cliente
        if (isCashPayment && order.customerPhone) {
          try {
            let customer = await tx.customer.findUnique({
              where: { phone: order.customerPhone }
            });
            
            if (!customer) {
              customer = await tx.customer.create({
                data: {
                  phone: order.customerPhone,
                  name: order.customerName,
                  cashPaymentStrikes: 1
                }
              });
            } else {
              const newStrikes = (customer.cashPaymentStrikes || 0) + 1;
              await tx.customer.update({
                where: { id: customer.id },
                data: { cashPaymentStrikes: newStrikes }
              });
              
              // Si tiene 2 o más strikes, suspender efectivo
              if (newStrikes >= 2) {
                const disabledMethods = customer.disabledPaymentMethods 
                  ? JSON.parse(customer.disabledPaymentMethods)
                  : [];
                if (!disabledMethods.includes('efectivo')) {
                  disabledMethods.push('efectivo');
                  await tx.customer.update({
                    where: { id: customer.id },
                    data: { disabledPaymentMethods: JSON.stringify(disabledMethods) }
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error aplicando strike al cliente:', error);
            // No fallar la cancelación si hay error al aplicar strike
          }
        }
      });
      
      // Notificar al cliente
      if (order.customerPhone && order.customerPhone.trim() !== '') {
        try {
          const webhookUrl = process.env.BOT_WEBHOOK_URL || 'https://elbuenmenu.site';
          const botUrl = webhookUrl.includes('elbuenmenu.site') && !webhookUrl.includes('api.') 
            ? 'http://localhost:3001' 
            : webhookUrl;
          
          const reasonMessages = {
            'NO_ENTREGO_EL_CODIGO': 'No entregó el código de entrega',
            'NO_ESTABA': 'No estaba en la dirección',
            'DIRECCION_INCORRECTA': 'Dirección incorrecta',
            'CLIENTE_RECHAZO': 'Cliente rechazó el pedido',
            'OTRO': 'Otro motivo'
          };
          
          const strikeMessage = isCashPayment 
            ? '\n\n⚠️ *Se registró 1 strike en tu cuenta por cancelación de entrega.*\nSi acumulas 2 strikes, se suspenderán los métodos de pago en efectivo.'
            : '';
          
          const notificationMessage = `❌ *Entrega cancelada*\n\nTu pedido ${order.orderNumber} fue cancelado por el repartidor.\n\n📋 *Motivo:* ${reasonMessages[reason]}${notes ? '\n💬 *Nota:* ' + notes : ''}${strikeMessage}\n\nPor favor, contacta con el restaurante si tienes alguna consulta.`;
          
          await fetch(`${botUrl}/notify-order`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': process.env.INTERNAL_API_KEY || ''
            },
            body: JSON.stringify({
              customerPhone: order.customerPhone,
              orderNumber: order.orderNumber,
              message: notificationMessage
            })
          });
        } catch (error) {
          console.error('Error notificando cliente:', error);
        }
      }
      
      res.json({ 
        success: true,
        message: 'Entrega cancelada. El repartidor fue liberado y no se pagó el viaje.',
        strike_applied: isCashPayment
      });
    } catch (error) {
      console.error('Error cancelando entrega:', error);
      console.error('Error details:', error.message, error.stack);
      res.status(500).json({ 
        error: 'Error al cancelar entrega', 
        details: error.message
      });
    }
  }
);

// ========== SALDOS Y TRANSACCIONES (REQUIERE AUTENTICACIÓN) ==========
app.get('/api/delivery/balance/:driver_id',
  authenticateDriver, // Verificar JWT
  authorizeDriver, // Verificar que driver_id = driver logueado (o admin)
  deliveryPollingRateLimit, // Rate limiting específico para polling
  async (req, res, next) => {
    try {
      const { driver_id } = req.params;
      
      // Si es admin, permitir ver cualquier saldo, si no, solo el propio
      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
      if (!isAdmin && req.driver.id !== driver_id) {
        return res.status(403).json({ error: 'No tienes permiso para ver este saldo' });
      }
      
      const driver = await prisma.deliveryPerson.findUnique({
        where: { id: driver_id },
        include: {
          balanceTransactions: {
            orderBy: { createdAt: 'desc' },
            take: 100
          }
        }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Repartidor no encontrado' });
      }
      
      res.json({
        balance: driver.balance,
        total_deliveries: driver.totalDeliveries,
        transactions: objectToSnakeCase(driver.balanceTransactions)
      });
    } catch (error) {
      next(error);
    }
  }
);

// ========== REGISTRAR PAGO ADMIN (SOLO ADMIN) ==========
app.post('/api/delivery/register-payment',
  authenticateAdmin, // Requiere JWT de admin
  authorize('admin', 'super_admin'), // Solo admin y super_admin
  criticalActionRateLimit, // Rate limiting para acciones críticas
  validate(registerPaymentSchema), // Validación con Zod
  async (req, res, next) => {
    try {
      const { driver_id, amount, reference } = req.body;
      const adminId = req.user.id;
      
      // Registrar pago usando servicio (con validación de saldo negativo)
      const transaction = await balanceService.registerAdminPayment(
        driver_id,
        amount,
        adminId,
        reference
      );

      // Log auditoría (el servicio ya lo hace, pero también aquí para confirmación)
      await auditService.logPaymentRegistration(
        driver_id,
        amount,
        adminId,
        reference
      );
      
      res.json({ success: true, transaction: objectToSnakeCase(transaction) });
    } catch (error) {
      next(error);
    }
  }
);

// ========== REPARTIDORES CON UBICACIÓN ==========
app.get('/api/delivery/drivers-location', async (req, res) => {
  try {
    const drivers = await prisma.deliveryPerson.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        lastLat: true,
        lastLng: true,
        lastSeenAt: true,
        balance: true,
        totalDeliveries: true,
        orders: {
          where: {
            status: {
              in: ['assigned', 'in_transit', 'out_for_delivery']
            }
          },
          select: {
            id: true
          },
          take: 1
        }
      }
    }).catch(error => {
      console.error('Error en consulta de drivers-location:', error);
      throw error;
    });
    
    // Mapear para incluir currentOrderId desde la relación
    const driversWithCurrentOrder = drivers.map(driver => {
      const currentOrder = driver.orders && driver.orders.length > 0 ? driver.orders[0] : null;
      const { orders, ...driverData } = driver;
      return {
        ...driverData,
        currentOrderId: currentOrder ? currentOrder.id : null
      };
    });
    
    res.json(objectToSnakeCase(driversWithCurrentOrder));
  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: 'Error al obtener ubicaciones', details: error.message });
  }
});


// ========== ENDPOINT ALTERNATIVO PARA SERVIR IMÁGENES DE COMPROBANTES ==========
// Endpoint específico para servir imágenes de comprobantes con headers correctos
// Esto es más confiable que express.static para evitar problemas de CORS

// Función auxiliar para servir el archivo
const serveFile = (req, res, filePath, filename) => {
    // Headers CORS completos
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
    
    // Determinar tipo de contenido
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.pdf') contentType = 'application/pdf';
    
    res.header('Content-Type', contentType);
    res.header('Cache-Control', 'public, max-age=31536000');
    
    // Servir el archivo usando sendFile
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('❌ Error al servir imagen:', filePath, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error al servir imagen', details: err.message });
        }
      } else {
        console.log('✅ Imagen servida correctamente:', filename, 'desde:', filePath);
      }
    });
};

// Función reutilizable para servir imágenes
const serveProofImage = (req, res) => {
  const filename = req.params.filename;
  console.log(`📸 [PROOFS] Solicitud de imagen: ${filename}`);
  console.log(`📸 [PROOFS] Ruta solicitada: ${req.path}`);
  console.log(`📸 [PROOFS] URL completa: ${req.url}`);
  
  // Validar que el filename no contenga rutas relativas peligrosas
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    console.error('❌ Intento de acceso a ruta inválida:', filename);
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }
  
  // Intentar múltiples rutas posibles
  const possiblePaths = [
    path.join(__dirname, '../whatsapp-bot/proofs', filename), // Desde server/ hacia whatsapp-bot/proofs/
    path.join(__dirname, '../../whatsapp-bot/proofs', filename), // Si server está en server/dist o similar
    path.join(process.cwd(), 'whatsapp-bot/proofs', filename), // Desde la raíz del proyecto
    path.join('/opt/elbuenmenu/whatsapp-bot/proofs', filename), // Ruta absoluta en producción
  ];
  
  console.log(`📂 [PROOFS] __dirname: ${__dirname}`);
  console.log(`📂 [PROOFS] process.cwd(): ${process.cwd()}`);
  console.log(`📂 [PROOFS] Rutas posibles a verificar:`);
  possiblePaths.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
  
  // Probar la primera ruta (la más probable)
  const filePath = possiblePaths[0];
  
  // Verificar que el archivo existe usando fs
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('❌ [PROOFS] Archivo no encontrado en primera ruta:', filePath);
      console.error('❌ [PROOFS] Error:', err.message);
      console.error('❌ [PROOFS] Código de error:', err.code);
      
      // Intentar las otras rutas posibles
      const checkNextPath = (index) => {
        if (index >= possiblePaths.length) {
          // Ninguna ruta funcionó, listar directorios para debugging
          console.error('❌ [PROOFS] Archivo no encontrado en ninguna ruta posible');
          possiblePaths.forEach((p, i) => {
            const dir = path.dirname(p);
            fs.readdir(dir, (readErr, files) => {
              if (readErr) {
                console.error(`❌ [PROOFS] No se pudo leer directorio ${i + 1}:`, dir, readErr.message);
              } else {
                console.log(`📁 [PROOFS] Directorio ${i + 1} (${dir}) contiene ${files.length} archivos:`, files.slice(0, 5));
              }
            });
          });
          return res.status(404).json({ 
            error: 'Imagen no encontrada', 
            filename: filename,
            triedPaths: possiblePaths,
            message: 'El archivo no existe en ninguna de las rutas esperadas'
          });
        }
        
        const testPath = possiblePaths[index];
        fs.access(testPath, fs.constants.F_OK, (testErr) => {
          if (testErr) {
            checkNextPath(index + 1);
          } else {
            console.log(`✅ [PROOFS] Archivo encontrado en ruta alternativa ${index + 1}: ${testPath}`);
            serveFile(req, res, testPath, filename);
          }
        });
      };
      
      checkNextPath(1);
      return;
    }
    
    serveFile(req, res, filePath, filename);
  });
};

// Registrar el endpoint en ambas rutas: /proofs/:filename y /api/proofs/:filename
app.get('/proofs/:filename', serveProofImage);
app.get('/api/proofs/:filename', serveProofImage);

// ========== LIMPIEZA TOTAL DEL SISTEMA (SOLO SUPER ADMIN) ==========
app.post('/api/admin/clear-all',
  authenticateAdmin, // Requiere JWT de admin
  authorize('super_admin'), // Solo super_admin
  criticalActionRateLimit, // Rate limiting para acciones críticas
  async (req, res, next) => {
  try {
    console.log('🧹 Iniciando limpieza total del sistema...');
    
    // Eliminar en orden para respetar las relaciones de foreign keys
    // 1. Transacciones de balance de repartidores
    await prisma.driverBalanceTransaction.deleteMany({});
    console.log('✅ Transacciones de balance eliminadas');
    
    // 2. Items de pedidos
    await prisma.orderItem.deleteMany({});
    console.log('✅ Items de pedidos eliminados');
    
    // 3. Mensajes de WhatsApp
    await prisma.whatsAppMessage.deleteMany({});
    console.log('✅ Mensajes de WhatsApp eliminados');
    
    // 4. Transferencias pendientes
    await prisma.pendingTransfer.deleteMany({});
    console.log('✅ Transferencias pendientes eliminadas');
    
    // 5. Pedidos (esto también eliminará los items por cascade, pero ya los eliminamos)
    await prisma.order.deleteMany({});
    console.log('✅ Pedidos eliminados');
    
    // 6. Repartidores (esto también eliminará las transacciones por cascade)
    await prisma.deliveryPerson.deleteMany({});
    console.log('✅ Repartidores eliminados');
    
    // 7. Clientes
    await prisma.customer.deleteMany({});
    console.log('✅ Clientes eliminados');
    
    console.log('🎉 Limpieza total completada exitosamente');
    
    // Log auditoría de acción crítica
    await auditService.logAction(
      'system_clear_all',
      req.user.id,
      req.user.role,
      {
        timestamp: new Date().toISOString(),
        ipAddress: req.ip
      },
      req.ip,
      req.headers['user-agent']
    );

    // Log actividad sospechosa por si acaso
    await auditService.logSuspiciousActivity(
      'system_clear_all',
      {
        adminId: req.user.id,
        adminEmail: req.user.email
      },
      req.ip
    );
    
    res.json({ 
      success: true, 
      message: 'Todos los datos han sido eliminados exitosamente',
      deleted: {
        orders: 'Todos',
        deliveryPersons: 'Todos',
        customers: 'Todos',
        transactions: 'Todas',
        messages: 'Todos',
        transfers: 'Todas'
      }
    });
  } catch (error) {
    console.error('❌ Error en limpieza total:', error);
    res.status(500).json({ 
      error: 'Error al limpiar los datos',
      details: error.message 
    });
  }
});

// ========== MERCADO PAGO ENDPOINTS ==========
// Endpoint público para generar preferencias de pago (llamado desde el bot)
// Función para obtener configuración de Mercado Pago desde la base de datos
async function getMercadoPagoConfig() {
  try {
    // Primero intentar desde variables de entorno o memoria (prioridad)
    if (mercadoPagoAccessToken) {
      return {
        accessToken: mercadoPagoAccessToken,
        publicKey: mercadoPagoPublicKey || null
      };
    }
    
    // Si no hay en memoria, intentar leer desde la base de datos
    try {
      const setting = await prisma.setting.findUnique({
        where: { key: 'payment_config' }
      });
      
      if (setting && setting.value) {
        const config = JSON.parse(setting.value);
        if (config.mercadoPago && config.mercadoPago.accessToken) {
          return {
            accessToken: config.mercadoPago.accessToken,
            publicKey: config.mercadoPago.publicKey || null
          };
        }
      }
    } catch (dbError) {
      // Si no existe la tabla, continuar sin configuración
      console.warn('⚠️ No se pudo leer configuración de la base de datos:', dbError.message);
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ Error al obtener configuración de Mercado Pago:', error.message);
    return null;
  }
}

// Endpoint para actualizar configuración de Mercado Pago
app.post('/api/admin/payment-config', corsMiddleware, async (req, res) => {
  try {
    const { mercadoPago } = req.body;
    
    if (!mercadoPago || !mercadoPago.accessToken) {
      return res.status(400).json({ error: 'Access Token de Mercado Pago es requerido' });
    }

    // Guardar configuración completa en la base de datos para persistencia
    try {
      const fullConfig = {
        mercadoPago: {
          accessToken: mercadoPago.accessToken,
          publicKey: mercadoPago.publicKey || null,
          enabled: mercadoPago.enabled !== undefined ? mercadoPago.enabled : true
        },
        transferencia: req.body.transferencia || null,
        efectivo: req.body.efectivo || null
      };

      // Guardar en la base de datos
      await prisma.setting.upsert({
        where: { key: 'payment_config' },
        update: { 
          value: JSON.stringify(fullConfig),
          updatedAt: new Date()
        },
        create: {
          key: 'payment_config',
          value: JSON.stringify(fullConfig)
        }
      });

      // Configurar Mercado Pago dinámicamente con el token proporcionado
      mercadoPagoConfig = new MercadoPagoConfig({
        accessToken: mercadoPago.accessToken
      });
      preferenceClient = new Preference(mercadoPagoConfig);
      
      // Actualizar estado de configuración
      mercadoPagoConfigured = true;
      mercadoPagoAccessToken = mercadoPago.accessToken;
      mercadoPagoPublicKey = mercadoPago.publicKey || null;
      
      // También actualizar variables de entorno en memoria para uso inmediato
      process.env.MERCADOPAGO_ACCESS_TOKEN = mercadoPago.accessToken;
      if (mercadoPago.publicKey) {
        process.env.MERCADOPAGO_PUBLIC_KEY = mercadoPago.publicKey;
      }
      
      console.log('✅ Mercado Pago configurado y guardado en la base de datos');
      
      res.json({ 
        success: true, 
        message: 'Configuración de Mercado Pago actualizada y guardada correctamente',
        configured: true
      });
    } catch (error) {
      console.error('⚠️ Error al guardar/configurar Mercado Pago:', error);
      console.error('⚠️ Stack:', error.stack);
      res.status(500).json({ 
        error: 'Error al configurar Mercado Pago',
        details: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  } catch (error) {
    console.error('❌ Error al actualizar configuración de pagos:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al actualizar configuración',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

app.post('/api/payments/mercadopago/create-preference', corsMiddleware, async (req, res) => {
  try {
    const { amount, orderNumber, description } = req.body;

    // Validar y normalizar el monto
    const normalizedAmount = parseFloat(amount);
    
    console.log('💰 [Mercado Pago] Datos recibidos:', {
      amount: amount,
      normalizedAmount: normalizedAmount,
      orderNumber: orderNumber,
      description: description
    });

    // Validar datos requeridos
    if (!amount || isNaN(normalizedAmount) || normalizedAmount <= 0) {
      console.error('❌ [Mercado Pago] Monto inválido:', { amount, normalizedAmount });
      return res.status(400).json({ error: 'El monto es requerido y debe ser mayor a 0' });
    }

    // Verificar si Mercado Pago está configurado (puede haber sido configurado dinámicamente)
    // Si no está configurado, intentar obtener la configuración de la base de datos
    if (!mercadoPagoConfigured || !mercadoPagoAccessToken) {
      const mpConfig = await getMercadoPagoConfig();
      
      if (mpConfig && mpConfig.accessToken) {
        try {
          mercadoPagoConfig = new MercadoPagoConfig({
            accessToken: mpConfig.accessToken
          });
          preferenceClient = new Preference(mercadoPagoConfig);
          mercadoPagoConfigured = true;
          mercadoPagoAccessToken = mpConfig.accessToken;
          mercadoPagoPublicKey = mpConfig.publicKey || null;
          console.log('✅ Mercado Pago configurado dinámicamente desde la base de datos');
        } catch (configError) {
          console.error('⚠️ Error al configurar Mercado Pago dinámicamente:', configError.message);
          return res.status(503).json({ 
            error: 'Error al configurar Mercado Pago',
            fallback: true,
            message: 'Usando link estático de Mercado Pago'
          });
        }
      } else {
        // Si no hay configuración disponible, usar fallback
        console.warn('⚠️ MERCADOPAGO_ACCESS_TOKEN no está configurado. Los links de Mercado Pago usarán el fallback estático.');
        return res.status(503).json({ 
          error: 'Mercado Pago no está configurado',
          fallback: true,
          message: 'Usando link estático de Mercado Pago'
        });
      }
    }

    // Asegurarse de que tenemos el cliente de Preference configurado
    if (!preferenceClient) {
      return res.status(503).json({ 
        error: 'Mercado Pago no está configurado correctamente',
        fallback: true,
        message: 'Usando link estático de Mercado Pago'
      });
    }

    // Crear preferencia de pago
    // Asegurar que el monto esté en el formato correcto (número decimal con 2 decimales)
    const finalAmount = parseFloat(normalizedAmount.toFixed(2));
    
    console.log('💰 [Mercado Pago] Creando preferencia con monto:', finalAmount);
    
    const preferenceData = {
      items: [
        {
          title: description || `Pedido ${orderNumber || 'N/A'} - El Buen Menú`,
          quantity: 1,
          unit_price: finalAmount,
          currency_id: 'ARS'
        }
      ],
      back_urls: {
        success: process.env.MERCADOPAGO_SUCCESS_URL || 'https://elbuenmenu.site/success',
        failure: process.env.MERCADOPAGO_FAILURE_URL || 'https://elbuenmenu.site/failure',
        pending: process.env.MERCADOPAGO_PENDING_URL || 'https://elbuenmenu.site/pending'
      },
      auto_return: 'approved',
      external_reference: orderNumber || `ORDER-${Date.now()}`,
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || `${process.env.API_URL || 'https://elbuenmenu.site'}/api/payments/mercadopago/webhook`,
      statement_descriptor: 'EL BUEN MENU'
    };

    console.log('📋 [Mercado Pago] Preference data:', JSON.stringify(preferenceData, null, 2));
    
    const preference = await preferenceClient.create({ body: preferenceData });

    console.log('✅ [Mercado Pago] Preferencia creada:', {
      id: preference.id,
      init_point: preference.init_point,
      hasInitPoint: !!preference.init_point
    });

    if (preference && preference.init_point) {
      res.json({
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        external_reference: preference.external_reference
      });
    } else {
      console.error('❌ [Mercado Pago] Preferencia creada pero sin init_point:', preference);
      throw new Error('No se pudo generar la preferencia de pago');
    }
  } catch (error) {
    // Logging detallado del error
    console.error('❌ Error al crear preferencia de Mercado Pago:');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    // Intentar obtener más información del error
    try {
      const errorDetails = {
        message: error.message,
        name: error.name,
        code: error.code,
        status: error.status,
        statusCode: error.statusCode
      };
      
      // Si tiene response (error de fetch/axios)
      if (error.response) {
        errorDetails.responseStatus = error.response.status;
        errorDetails.responseData = error.response.data;
        console.error('❌ Mercado Pago API Response Status:', error.response.status);
        console.error('❌ Mercado Pago API Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Si tiene cause
      if (error.cause) {
        errorDetails.cause = error.cause;
        console.error('❌ Error cause:', error.cause);
      }
      
      console.error('❌ Error details:', JSON.stringify(errorDetails, null, 2));
    } catch (logError) {
      console.error('❌ Error al loguear detalles:', logError);
      console.error('❌ Error original (string):', String(error));
    }
    
    res.status(500).json({ 
      error: 'Error al generar link de pago',
      details: error.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      fallback: true
    });
  }
});

// Endpoint para verificar estado de pago de Mercado Pago por preference_id
app.get('/api/payments/mercadopago/check-payment/:preferenceId', corsMiddleware, async (req, res) => {
  try {
    const { preferenceId } = req.params;

    console.log('🔍 [Mercado Pago Check] Verificando estado de preference_id:', preferenceId);

    if (!preferenceId) {
      return res.status(400).json({ error: 'preference_id es requerido' });
    }

    // Cargar configuración de Mercado Pago
    if (!mercadoPagoConfig) {
      const mpConfig = await getMercadoPagoConfig();
      if (mpConfig && mpConfig.accessToken) {
        mercadoPagoConfig = new MercadoPagoConfig({
          accessToken: mpConfig.accessToken
        });
        preferenceClient = new Preference(mercadoPagoConfig);
        mercadoPagoConfigured = true;
      }
    }

    if (!mercadoPagoConfig || !preferenceClient) {
      return res.status(503).json({ 
        error: 'Mercado Pago no está configurado',
        status: 'unknown'
      });
    }

    // Obtener información de la preferencia
    const preference = await preferenceClient.get({ preferenceId });

    if (!preference) {
      return res.status(404).json({ 
        error: 'Preferencia no encontrada',
        status: 'not_found'
      });
    }

    // Buscar el pedido asociado usando external_reference
    let paymentStatus = 'pending';
    let paymentId = null;

    if (preference.external_reference) {
      // Buscar el pedido por order_number (external_reference)
      const order = await prisma.order.findUnique({
        where: { orderNumber: preference.external_reference },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true
        }
      });

      if (order) {
        if (order.paymentStatus === 'approved') {
          // El pago ya fue aprobado (procesado por el webhook)
          paymentStatus = 'approved';
          console.log(`✅ [Mercado Pago Check] Pago ya aprobado en BD para preference_id: ${preferenceId}, order: ${order.orderNumber}`);
        } else {
          // El pedido existe pero el pago no está aprobado aún
          // Intentar buscar pagos directamente en Mercado Pago usando el external_reference
          try {
            const paymentClient = new Payment(mercadoPagoConfig);
            
            // Buscar pagos con este external_reference usando la API de búsqueda
            // La API de Mercado Pago permite buscar por external_reference
            const searchParams = {
              external_reference: preference.external_reference,
              status: 'approved'
            };
            
            // Usar el método search de Payment (si está disponible)
            // Nota: La SDK de Mercado Pago puede tener limitaciones en la búsqueda
            // Por ahora, verificamos el estado del pedido en la BD
            // Si el webhook procesó el pago, el pedido debería estar aprobado
            
            // Si el pedido está en estado 'pending' o 'confirmed' pero paymentStatus es 'pending',
            // significa que el webhook aún no procesó el pago o el pago no se completó
            if (order.status === 'pending' && order.paymentStatus === 'pending') {
              paymentStatus = 'pending';
              console.log(`⏳ [Mercado Pago Check] Pago pendiente para preference_id: ${preferenceId}, order: ${order.orderNumber}`);
            } else {
              paymentStatus = 'pending';
            }
          } catch (paymentError) {
            console.warn('⚠️ [Mercado Pago Check] No se pudo verificar pagos directamente:', paymentError.message);
            // Si no podemos verificar directamente, asumimos que está pendiente
            paymentStatus = 'pending';
          }
        }
      } else {
        // El pedido no existe aún, el pago está pendiente
        paymentStatus = 'pending';
        console.log(`⏳ [Mercado Pago Check] Pedido no encontrado para preference_id: ${preferenceId}, external_reference: ${preference.external_reference}`);
      }
    } else {
      // No hay external_reference, no podemos verificar
      paymentStatus = 'pending';
      console.warn('⚠️ [Mercado Pago Check] Preference sin external_reference:', preferenceId);
    }

    res.json({
      preference_id: preferenceId,
      status: paymentStatus,
      payment_id: paymentId,
      external_reference: preference.external_reference,
      preference_status: preference.status || 'active'
    });
  } catch (error) {
    console.error('❌ [Mercado Pago Check] Error:', error);
    res.status(500).json({ 
      error: 'Error al verificar estado del pago',
      details: error.message,
      status: 'error'
    });
  }
});

// Endpoint para procesar pago desde redirección (backup del webhook)
app.post('/api/payments/mercadopago/process-payment', corsMiddleware, async (req, res) => {
  try {
    const { external_reference, payment_id, status } = req.body;

    console.log('💰 [Mercado Pago Process] Procesando pago desde redirección:', {
      external_reference,
      payment_id,
      status
    });

    if (!external_reference) {
      return res.status(400).json({ error: 'external_reference es requerido' });
    }

    // Si el pago está aprobado, procesarlo
    if (status === 'approved') {
      // Buscar el pedido por order_number
      const order = await prisma.order.findUnique({
        where: { orderNumber: external_reference },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          customerPhone: true
        }
      });

      if (order) {
        // Solo actualizar si el pago aún no está aprobado (evitar duplicados)
        if (order.paymentStatus !== 'approved') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'confirmed',
              paymentStatus: 'approved'
            }
          });

          console.log(`✅ [Mercado Pago Process] Pedido ${external_reference} aprobado desde redirección`);

          // Notificar al cliente vía WhatsApp
          if (order.customerPhone) {
            try {
              const botWebhookUrl = process.env.BOT_WEBHOOK_URL || 'http://localhost:3001';
              const notifyUrl = botWebhookUrl.endsWith('/') 
                ? `${botWebhookUrl}notify-payment` 
                : `${botWebhookUrl}/notify-payment`;
              
              await fetch(notifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phone: order.customerPhone,
                  message: `✅ *PAGO APROBADO*\n\n💰 Tu pago de Mercado Pago fue aprobado correctamente.\n\n🍳 Tu pedido está en preparación.\n\n⏱️ Tiempo estimado: 30-45 minutos\n\n¡Te avisamos cuando esté listo! 🚚`
                })
              });
            } catch (notifyError) {
              console.warn('⚠️ [Mercado Pago Process] No se pudo notificar al cliente:', notifyError.message);
            }
          }
        } else {
          console.log(`ℹ️ [Mercado Pago Process] Pedido ${external_reference} ya estaba aprobado`);
        }
      } else {
        console.warn(`⚠️ [Mercado Pago Process] Pedido ${external_reference} no encontrado`);
      }
    }

    res.json({ success: true, processed: true });
  } catch (error) {
    console.error('❌ [Mercado Pago Process] Error:', error);
    res.status(500).json({ error: 'Error al procesar pago', details: error.message });
  }
});

// Webhook de Mercado Pago (para recibir notificaciones de pago)
// Mercado Pago puede enviar notificaciones en diferentes formatos:
// 1. { type: 'payment', data: { id: '...' } }
// 2. { action: 'payment.created', data: { id: '...' } }
// 3. Query string: ?id=123456789
app.post('/api/payments/mercadopago/webhook', async (req, res) => {
  try {
    // Log completo de la notificación recibida
    console.log('📦 [Mercado Pago Webhook] Notificación recibida:');
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
    console.log('📦 Query params:', JSON.stringify(req.query, null, 2));
    console.log('📦 Headers:', JSON.stringify(req.headers, null, 2));

    // Obtener ID del pago de diferentes formatos posibles
    let paymentId = null;
    
    // Formato 1: { type: 'payment', data: { id: '...' } }
    if (req.body.type === 'payment' && req.body.data?.id) {
      paymentId = req.body.data.id;
    }
    // Formato 2: { action: 'payment.created', data: { id: '...' } }
    else if (req.body.action && req.body.data?.id) {
      paymentId = req.body.data.id;
    }
    // Formato 3: Query string ?id=123456789
    else if (req.query.id) {
      paymentId = req.query.id;
    }
    // Formato 4: Body directo con id
    else if (req.body.id) {
      paymentId = req.body.id;
    }
    // Formato 5: data.id directo
    else if (req.body.data?.id) {
      paymentId = req.body.data.id;
    }

    if (!paymentId) {
      console.warn('⚠️ [Mercado Pago Webhook] No se pudo extraer el ID del pago de la notificación');
      return res.status(200).json({ received: true, warning: 'No payment ID found' });
    }

    console.log(`💰 [Mercado Pago Webhook] Procesando pago: ${paymentId}`);
    
    try {
      // Obtener información del pago desde Mercado Pago
      if (!mercadoPagoConfig) {
        const mpConfig = await getMercadoPagoConfig();
        if (mpConfig && mpConfig.accessToken) {
          mercadoPagoConfig = new MercadoPagoConfig({
            accessToken: mpConfig.accessToken
          });
        }
      }

      if (!mercadoPagoConfig) {
        console.error('❌ [Mercado Pago Webhook] Mercado Pago no está configurado');
        return res.status(200).json({ received: true, error: 'Mercado Pago not configured' });
      }

      const paymentClient = new Payment(mercadoPagoConfig);
      const payment = await paymentClient.get({ id: paymentId });

      console.log('💰 [Mercado Pago Webhook] Información del pago:', {
        id: payment.id,
        status: payment.status,
        status_detail: payment.status_detail,
        external_reference: payment.external_reference,
        transaction_amount: payment.transaction_amount,
        date_approved: payment.date_approved
      });

      // Si el pago está aprobado, actualizar el pedido automáticamente
      if (payment.status === 'approved' && payment.external_reference) {
        const orderNumber = payment.external_reference;
        
        console.log(`🔍 [Mercado Pago Webhook] Buscando pedido con orderNumber: ${orderNumber}`);
        
        // Buscar el pedido por order_number
        const order = await prisma.order.findUnique({
          where: { orderNumber: orderNumber },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            customerPhone: true,
            total: true
          }
        });

        if (order) {
          // Solo actualizar si el pago aún no está aprobado (evitar duplicados)
          if (order.paymentStatus !== 'approved') {
            // Actualizar estado del pedido a confirmado y pago aprobado
            await prisma.order.update({
              where: { id: order.id },
              data: {
                status: 'confirmed',
                paymentStatus: 'approved'
              }
            });

            console.log(`✅ [Mercado Pago Webhook] Pedido ${orderNumber} aprobado automáticamente`);

            // Notificar al cliente vía WhatsApp (si el bot está disponible)
            if (order.customerPhone) {
              try {
                const botWebhookUrl = process.env.BOT_WEBHOOK_URL || 'http://localhost:3001';
                const notifyUrl = botWebhookUrl.endsWith('/') 
                  ? `${botWebhookUrl}notify-payment` 
                  : `${botWebhookUrl}/notify-payment`;
                
                console.log(`📱 [Mercado Pago Webhook] Notificando a cliente ${order.customerPhone} vía ${notifyUrl}`);
                
                const notifyResponse = await fetch(notifyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    phone: order.customerPhone,
                    message: `✅ *PAGO APROBADO*\n\n💰 Tu pago de Mercado Pago fue aprobado correctamente.\n\n🍳 Tu pedido está en preparación.\n\n⏱️ Tiempo estimado: 30-45 minutos\n\n¡Te avisamos cuando esté listo! 🚚`
                  })
                });

                if (notifyResponse.ok) {
                  console.log(`✅ [Mercado Pago Webhook] Cliente notificado exitosamente`);
                } else {
                  console.warn(`⚠️ [Mercado Pago Webhook] Error al notificar cliente: ${notifyResponse.status}`);
                }
              } catch (notifyError) {
                console.error('❌ [Mercado Pago Webhook] Error al notificar al cliente:', notifyError);
                console.error('❌ Stack:', notifyError.stack);
              }
            } else {
              console.warn(`⚠️ [Mercado Pago Webhook] Pedido ${orderNumber} no tiene customerPhone`);
            }
          } else {
            console.log(`ℹ️ [Mercado Pago Webhook] Pedido ${orderNumber} ya estaba aprobado, ignorando notificación duplicada`);
          }
        } else {
          console.warn(`⚠️ [Mercado Pago Webhook] Pedido ${orderNumber} no encontrado en la base de datos`);
        }
      } else {
        console.log(`ℹ️ [Mercado Pago Webhook] Pago ${paymentId} con estado: ${payment.status} (no aprobado aún)`);
        if (!payment.external_reference) {
          console.warn(`⚠️ [Mercado Pago Webhook] Pago ${paymentId} no tiene external_reference`);
        }
      }
    } catch (paymentError) {
      console.error('❌ [Mercado Pago Webhook] Error al procesar pago:', paymentError);
      console.error('❌ Stack:', paymentError.stack);
      // Continuar y responder 200 para que Mercado Pago no reintente
    }
    
    // Siempre responder 200 para que Mercado Pago no reintente
    res.status(200).json({ received: true, paymentId });
  } catch (error) {
    console.error('❌ [Mercado Pago Webhook] Error general:', error);
    console.error('❌ Stack:', error.stack);
    // Responder 200 para que Mercado Pago no reintente
    res.status(200).json({ received: true, error: error.message });
  }
});

// ========== SISTEMA DE ESTADOS (SIN STOCK) ==========
// Obtener estado actual del sistema
app.get('/api/system/emergency-state', corsMiddleware, async (req, res) => {
  try {
    const state = await prisma.systemState.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({
      emergencyMode: false, // Deprecado - usar noStockMode
      noStockMode: state?.noStockMode || false,
      activatedAt: state?.activatedAt || null,
      notes: state?.notes || null
    });
  } catch (error) {
    console.error('Error obteniendo estado:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// ========== HORARIOS ESPECIALES ==========
// Obtener horario especial activo
app.get('/api/system/special-hours', corsMiddleware, async (req, res) => {
  try {
    // Verificar si hay un horario especial activo y no expirado
    const now = new Date();
    const specialHours = await prisma.specialHours.findFirst({
      where: {
        isActive: true,
        expiresAt: {
          gt: now // No expirado
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Si hay uno expirado, desactivarlo automáticamente
    if (specialHours && specialHours.expiresAt < now) {
      await prisma.specialHours.update({
        where: { id: specialHours.id },
        data: { isActive: false }
      });
      return res.json({ isActive: false });
    }

    if (!specialHours) {
      return res.json({ isActive: false });
    }

    res.json({
      isActive: true,
      startTime: specialHours.startTime,
      endTime: specialHours.endTime,
      expiresAt: specialHours.expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo horario especial:', error);
    res.status(500).json({ error: 'Error al obtener horario especial' });
  }
});

// Activar horario especial
app.post('/api/system/special-hours', corsMiddleware, async (req, res) => {
  try {
    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime y endTime son requeridos' });
    }

    // Validar formato HH:mm
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({ error: 'Formato de hora inválido. Use HH:mm' });
    }

    // Desactivar cualquier horario especial anterior
    await prisma.specialHours.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    // Calcular fecha de expiración (mañana a las 00:00 en zona horaria de Argentina)
    const now = new Date();
    const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const expiresAt = new Date(argentinaTime);
    expiresAt.setDate(expiresAt.getDate() + 1);
    expiresAt.setHours(0, 0, 0, 0);

    // Crear nuevo horario especial
    const specialHours = await prisma.specialHours.create({
      data: {
        isActive: true,
        startTime,
        endTime,
        expiresAt
      }
    });

    res.json({
      isActive: true,
      startTime: specialHours.startTime,
      endTime: specialHours.endTime,
      expiresAt: specialHours.expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Error activando horario especial:', error);
    res.status(500).json({ error: 'Error al activar horario especial' });
  }
});

// Desactivar horario especial
app.delete('/api/system/special-hours', corsMiddleware, async (req, res) => {
  try {
    await prisma.specialHours.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    res.json({ isActive: false });
  } catch (error) {
    console.error('Error desactivando horario especial:', error);
    res.status(500).json({ error: 'Error al desactivar horario especial' });
  }
});

app.get('/api/system/no-stock-state', corsMiddleware, async (req, res) => {
  try {
    const state = await prisma.systemState.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({
      noStockMode: state?.noStockMode || false,
      emergencyMode: state?.emergencyMode || false,
      activatedAt: state?.activatedAt || null
    });
  } catch (error) {
    console.error('Error obteniendo estado sin stock:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// DEPRECADO: Activar/Desactivar Modo Emergencia (ahora usar no-stock-mode)
app.post('/api/system/emergency-mode', corsMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    // Redirigir a no-stock-mode
    const state = await prisma.systemState.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!state) {
      await prisma.systemState.create({
        data: {
          emergencyMode: false,
          noStockMode: enabled,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null
        }
      });
    } else {
      await prisma.systemState.update({
        where: { id: state.id },
        data: {
          emergencyMode: false,
          noStockMode: enabled,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null,
          updatedAt: new Date()
        }
      });
    }
    
    console.log(`⚠️ Sin Stock ${enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    
    res.json({
      success: true,
      emergencyMode: enabled, // Compatibilidad
      noStockMode: enabled,
      message: enabled ? 'Sin Stock activado' : 'Sin Stock desactivado'
    });
  } catch (error) {
    console.error('Error activando/desactivando sin stock:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// Activar/Desactivar Sin Stock
app.post('/api/system/no-stock-mode', corsMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    // Obtener o crear estado del sistema
    let state = await prisma.systemState.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!state) {
      state = await prisma.systemState.create({
        data: {
          emergencyMode: false,
          noStockMode: enabled,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null
        }
      });
    } else {
      state = await prisma.systemState.update({
        where: { id: state.id },
        data: {
          noStockMode: enabled,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null,
          updatedAt: new Date()
        }
      });
    }
    
    console.log(`⚠️ Sin Stock ${enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    
    res.json({
      success: true,
      noStockMode: state.noStockMode,
      message: enabled ? 'Sin Stock activado' : 'Sin Stock desactivado'
    });
  } catch (error) {
    console.error('Error activando/desactivando sin stock:', error);
    res.status(500).json({ error: 'Error al cambiar estado sin stock' });
  }
});

// ========== CHECKLIST DIARIO ==========
// Obtener tareas del día actual
app.get('/api/system/checklist/today', corsMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tasks = await prisma.dailyChecklistTask.findMany({
      where: {
        taskDate: {
          gte: today,
          lt: tomorrow
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });
    
    res.json({ tasks });
  } catch (error) {
    console.error('Error obteniendo checklist:', error);
    res.status(500).json({ error: 'Error al obtener checklist' });
  }
});

// Crear tarea
app.post('/api/system/checklist/task', corsMiddleware, async (req, res) => {
  try {
    const { title, description, emoji, assignedTo, priority } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'El título es requerido' });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const task = await prisma.dailyChecklistTask.create({
      data: {
        taskDate: today,
        title: title.trim(),
        description: description || null,
        emoji: emoji || null,
        assignedTo: assignedTo || null,
        priority: priority || 0,
        isCompleted: false
      }
    });
    
    res.json({ task });
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// Actualizar tarea
app.put('/api/system/checklist/task/:id', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted, title, description, assignedTo, priority } = req.body;
    
    const updateData = {};
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
    }
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (priority !== undefined) updateData.priority = priority;
    
    const task = await prisma.dailyChecklistTask.update({
      where: { id },
      data: updateData
    });
    
    res.json({ task });
  } catch (error) {
    console.error('Error actualizando tarea:', error);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// Eliminar tarea
app.delete('/api/system/checklist/task/:id', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.dailyChecklistTask.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando tarea:', error);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// ========== NOTIFICACIONES DEL SISTEMA ==========
// Obtener notificaciones
app.get('/api/system/notifications', corsMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const notifications = await prisma.systemNotification.findMany({
      take: parseInt(String(limit)),
      orderBy: { createdAt: 'desc' }
    });
    
    const unreadCount = await prisma.systemNotification.count({
      where: { isRead: false }
    });
    
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Marcar notificación como leída
app.post('/api/system/notifications/:id/read', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.systemNotification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marcando notificación:', error);
    res.status(500).json({ error: 'Error al marcar notificación' });
  }
});

// Marcar todas como leídas
app.post('/api/system/notifications/read-all', corsMiddleware, async (req, res) => {
  try {
    await prisma.systemNotification.updateMany({
      where: { isRead: false },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marcando todas como leídas:', error);
    res.status(500).json({ error: 'Error al marcar todas como leídas' });
  }
});

// ========== RECOMENDACIONES IA ==========
// Obtener recomendaciones del día
app.get('/api/system/ai-recommendations', corsMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const recommendations = await prisma.aIRecommendation.findMany({
      where: {
        dayGenerated: {
          gte: today
        },
        isAcknowledged: false
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ recommendations });
  } catch (error) {
    console.error('Error obteniendo recomendaciones IA:', error);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
});

// Marcar recomendación como leída
app.post('/api/system/ai-recommendations/:id/acknowledge', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.aIRecommendation.update({
      where: { id },
      data: {
        isAcknowledged: true,
        acknowledgedAt: new Date()
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marcando recomendación:', error);
    res.status(500).json({ error: 'Error al marcar recomendación' });
  }
});

// ========== MODO LLUVIA / PICO DE DEMANDA ==========
// Obtener estado actual
app.get('/api/system/peak-demand-state', corsMiddleware, async (req, res) => {
  try {
    const mode = await prisma.peakDemandMode.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({
      isActive: mode?.isActive || false,
      config: mode ? {
        estimatedTimeMinutes: mode.estimatedTimeMinutes,
        maxOrdersPerHour: mode.maxOrdersPerHour,
        priceMultiplier: mode.priceMultiplier,
        disabledProductIds: mode.disabledProductIds ? JSON.parse(mode.disabledProductIds) : []
      } : null
    });
  } catch (error) {
    console.error('Error obteniendo estado pico de demanda:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// Activar/Desactivar Modo Pico de Demanda
app.post('/api/system/peak-demand-mode', corsMiddleware, async (req, res) => {
  try {
    const { enabled, config } = req.body;
    
    let mode = await prisma.peakDemandMode.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!mode) {
      mode = await prisma.peakDemandMode.create({
        data: {
          isActive: enabled,
          estimatedTimeMinutes: config?.estimatedTimeMinutes || 20,
          maxOrdersPerHour: config?.maxOrdersPerHour || null,
          priceMultiplier: config?.priceMultiplier || 1.0,
          disabledProductIds: config?.disabledProductIds ? JSON.stringify(config.disabledProductIds) : null,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null
        }
      });
    } else {
      mode = await prisma.peakDemandMode.update({
        where: { id: mode.id },
        data: {
          isActive: enabled,
          estimatedTimeMinutes: config?.estimatedTimeMinutes || mode.estimatedTimeMinutes,
          maxOrdersPerHour: config?.maxOrdersPerHour || mode.maxOrdersPerHour,
          priceMultiplier: config?.priceMultiplier || mode.priceMultiplier,
          disabledProductIds: config?.disabledProductIds ? JSON.stringify(config.disabledProductIds) : mode.disabledProductIds,
          activatedAt: enabled ? new Date() : null,
          deactivatedAt: !enabled ? new Date() : null,
          updatedAt: new Date()
        }
      });
    }
    
    console.log(`🌧️ Modo Pico de Demanda ${enabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    
    res.json({
      success: true,
      isActive: mode.isActive,
      config: {
        estimatedTimeMinutes: mode.estimatedTimeMinutes,
        maxOrdersPerHour: mode.maxOrdersPerHour,
        priceMultiplier: mode.priceMultiplier,
        disabledProductIds: mode.disabledProductIds ? JSON.parse(mode.disabledProductIds) : []
      }
    });
  } catch (error) {
    console.error('Error activando/desactivando modo pico de demanda:', error);
    res.status(500).json({ error: 'Error al cambiar modo pico de demanda' });
  }
});

// Actualizar configuración del modo pico de demanda
app.put('/api/system/peak-demand-config', corsMiddleware, async (req, res) => {
  try {
    const { estimatedTimeMinutes, maxOrdersPerHour, priceMultiplier, disabledProductIds } = req.body;
    
    let mode = await prisma.peakDemandMode.findFirst({
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!mode) {
      mode = await prisma.peakDemandMode.create({
        data: {
          isActive: false,
          estimatedTimeMinutes: estimatedTimeMinutes || 20,
          maxOrdersPerHour: maxOrdersPerHour || null,
          priceMultiplier: priceMultiplier || 1.0,
          disabledProductIds: disabledProductIds ? JSON.stringify(disabledProductIds) : null
        }
      });
    } else {
      mode = await prisma.peakDemandMode.update({
        where: { id: mode.id },
        data: {
          estimatedTimeMinutes: estimatedTimeMinutes !== undefined ? estimatedTimeMinutes : mode.estimatedTimeMinutes,
          maxOrdersPerHour: maxOrdersPerHour !== undefined ? maxOrdersPerHour : mode.maxOrdersPerHour,
          priceMultiplier: priceMultiplier !== undefined ? priceMultiplier : mode.priceMultiplier,
          disabledProductIds: disabledProductIds !== undefined ? JSON.stringify(disabledProductIds) : mode.disabledProductIds,
          updatedAt: new Date()
        }
      });
    }
    
    res.json({
      success: true,
      config: {
        estimatedTimeMinutes: mode.estimatedTimeMinutes,
        maxOrdersPerHour: mode.maxOrdersPerHour,
        priceMultiplier: mode.priceMultiplier,
        disabledProductIds: mode.disabledProductIds ? JSON.parse(mode.disabledProductIds) : []
      }
    });
  } catch (error) {
    console.error('Error actualizando configuración pico de demanda:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// ========== GASTOS REALES DEL NEGOCIO ==========
// Obtener gastos por mes
app.get('/api/business/expenses', corsMiddleware, async (req, res) => {
  try {
    const { month } = req.query;
    
    let startDate, endDate;
    if (month) {
      startDate = new Date(`${month}-01`);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    
    const expenses = await prisma.businessExpense.findMany({
      where: {
        date: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: { date: 'desc' }
    });
    
    res.json({ expenses });
  } catch (error) {
    console.error('Error obteniendo gastos:', error);
    res.status(500).json({ error: 'Error al obtener gastos' });
  }
});

// Registrar gasto
app.post('/api/business/expenses', corsMiddleware, async (req, res) => {
  try {
    const { date, category, description, amount, supplierId, notes } = req.body;
    
    if (!category || !description || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Categoría, descripción y monto son requeridos' });
    }
    
    const expense = await prisma.businessExpense.create({
      data: {
        date: new Date(date),
        category,
        description,
        amount: parseFloat(amount),
        supplierId: supplierId || null,
        notes: notes || null
      }
    });
    
    res.json({ expense });
  } catch (error) {
    console.error('Error registrando gasto:', error);
    res.status(500).json({ error: 'Error al registrar gasto' });
  }
});

// ========== ANÁLISIS DE COSTO REAL DEL DÍA ==========
// Obtener análisis por fecha
app.get('/api/business/daily-cost-analysis', corsMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const analysisDate = date ? new Date(date) : new Date();
    analysisDate.setHours(0, 0, 0, 0);
    
    const analysis = await prisma.dailyCostAnalysis.findUnique({
      where: { analysisDate }
    });
    
    if (!analysis) {
      return res.status(404).json({ error: 'No hay análisis para esta fecha' });
    }
    
    res.json({ analysis });
  } catch (error) {
    console.error('Error obteniendo análisis de costo:', error);
    res.status(500).json({ error: 'Error al obtener análisis' });
  }
});

// Generar análisis de costo real del día
app.post('/api/business/daily-cost-analysis/generate', corsMiddleware, async (req, res) => {
  try {
    const { date } = req.body;
    const analysisDate = date ? new Date(date) : new Date();
    analysisDate.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(analysisDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Obtener ventas del día
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: analysisDate,
          lt: tomorrow
        },
        status: { not: 'cancelled' }
      },
      include: {
        items: true
      }
    });
    
    const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    const ordersCount = orders.length;
    const averageTicket = ordersCount > 0 ? totalSales / ordersCount : 0;
    
    // TODO: Calcular costo de insumos usados (requiere recetas y stock)
    const ingredientCost = 0; // Por ahora 0, se calculará con recetas
    
    // TODO: Calcular costo laboral (requiere empleados y horarios)
    const laborCost = 0; // Por ahora 0, se calculará con empleados
    const hoursWorked = 0;
    
    // TODO: Calcular desperdicio/merma
    const wasteCost = 0; // Por ahora 0, se calculará con registros de merma
    
    // Obtener gastos del día
    const expenses = await prisma.businessExpense.findMany({
      where: {
        date: {
          gte: analysisDate,
          lt: tomorrow
        }
      }
    });
    
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalCost = ingredientCost + laborCost + wasteCost + totalExpenses;
    const netProfit = totalSales - totalCost;
    const profitability = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
    
    // Crear o actualizar análisis
    const analysis = await prisma.dailyCostAnalysis.upsert({
      where: { analysisDate },
      create: {
        analysisDate,
        totalSales,
        totalExpenses,
        ingredientCost,
        laborCost,
        wasteCost,
        totalCost,
        netProfit,
        profitability,
        hoursWorked,
        ordersCount,
        averageTicket,
        details: JSON.stringify({ orders: orders.length, expenses: expenses.length })
      },
      update: {
        totalSales,
        totalExpenses,
        ingredientCost,
        laborCost,
        wasteCost,
        totalCost,
        netProfit,
        profitability,
        hoursWorked,
        ordersCount,
        averageTicket,
        details: JSON.stringify({ orders: orders.length, expenses: expenses.length })
      }
    });
    
    res.json({ analysis });
  } catch (error) {
    console.error('Error generando análisis de costo:', error);
    res.status(500).json({ error: 'Error al generar análisis' });
  }
});

// ========== CLIENTES VIP / FIDELIDAD ==========
// Obtener todos los clientes con fidelidad
app.get('/api/customers/loyalty', corsMiddleware, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        // En Prisma necesitaríamos una relación, por ahora usamos consultas separadas
      }
    });
    
    // Obtener datos de fidelidad
    const loyaltyData = await prisma.customerLoyalty.findMany();
    
    // Obtener ventas por cliente
    const orders = await prisma.order.groupBy({
      by: ['customerPhone'],
      where: {
        status: { not: 'cancelled' }
      },
      _count: { id: true },
      _sum: { total: true }
    });
    
    // Combinar datos
    const customersWithLoyalty = customers.map(customer => {
      const loyalty = loyaltyData.find(l => l.customerId === customer.id);
      const orderStats = orders.find(o => o.customerPhone === customer.phone);
      
      return {
        id: loyalty?.id || null,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        tier: loyalty?.tier || 'regular',
        totalOrders: orderStats?._count?.id || 0,
        totalSpent: orderStats?._sum?.total || 0,
        lastOrderDate: null, // TODO: Obtener última fecha de pedido
        favoriteProducts: loyalty?.favoriteProducts ? JSON.parse(loyalty.favoriteProducts) : [],
        discountPercentage: loyalty?.discountPercentage || 0,
        points: loyalty?.points || 0,
        priority: loyalty?.priority || false
      };
    });
    
    res.json({ customers: customersWithLoyalty });
  } catch (error) {
    console.error('Error obteniendo clientes VIP:', error);
    res.status(500).json({ error: 'Error al obtener clientes VIP' });
  }
});

// Recalcular niveles de fidelidad automáticamente
app.post('/api/customers/loyalty/recalculate', corsMiddleware, async (req, res) => {
  try {
    // Obtener todos los clientes
    const customers = await prisma.customer.findMany();
    
    // Obtener estadísticas de pedidos por cliente
    const orders = await prisma.order.groupBy({
      by: ['customerPhone'],
      where: {
        status: { not: 'cancelled' }
      },
      _count: { id: true },
      _sum: { total: true }
    });
    
    // Calcular niveles y actualizar
    for (const customer of customers) {
      const orderStats = orders.find(o => o.customerPhone === customer.phone);
      const totalOrders = orderStats?._count?.id || 0;
      const totalSpent = orderStats?._sum?.total || 0;
      
      // Determinar nivel basado en pedidos y gasto
      let tier = 'regular';
      let discountPercentage = 0;
      let points = totalOrders * 10 + Math.floor(totalSpent / 100); // 10 puntos por pedido + 1 punto por cada $100
      
      if (totalOrders >= 20 || totalSpent >= 50000) {
        tier = 'vip';
        discountPercentage = 15;
      } else if (totalOrders >= 15 || totalSpent >= 35000) {
        tier = 'gold';
        discountPercentage = 10;
      } else if (totalOrders >= 10 || totalSpent >= 25000) {
        tier = 'silver';
        discountPercentage = 5;
      } else if (totalOrders >= 5 || totalSpent >= 15000) {
        tier = 'bronze';
        discountPercentage = 3;
      }
      
      // Actualizar o crear registro de fidelidad
      await prisma.customerLoyalty.upsert({
        where: { customerId: customer.id },
        create: {
          customerId: customer.id,
          tier,
          totalOrders,
          totalSpent,
          discountPercentage,
          points,
          priority: tier === 'vip' || tier === 'gold'
        },
        update: {
          tier,
          totalOrders,
          totalSpent,
          discountPercentage,
          points,
          priority: tier === 'vip' || tier === 'gold',
          updatedAt: new Date()
        }
      });
    }
    
    res.json({ success: true, message: 'Niveles de fidelidad recalculados' });
  } catch (error) {
    console.error('Error recalculando niveles:', error);
    res.status(500).json({ error: 'Error al recalcular niveles' });
  }
});

// Actualizar cliente VIP
app.put('/api/customers/loyalty/:customerId', corsMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { tier, discountPercentage, priority } = req.body;
    
    const loyalty = await prisma.customerLoyalty.update({
      where: { customerId },
      data: {
        tier: tier || undefined,
        discountPercentage: discountPercentage !== undefined ? parseFloat(discountPercentage) : undefined,
        priority: priority !== undefined ? priority : undefined,
        updatedAt: new Date()
      }
    });
    
    res.json({ loyalty });
  } catch (error) {
    console.error('Error actualizando cliente VIP:', error);
    res.status(500).json({ error: 'Error al actualizar cliente VIP' });
  }
});

// ========== ETIQUETAS INTELIGENTES DE PRODUCTOS ==========
// Obtener todas las etiquetas
app.get('/api/products/labels', corsMiddleware, async (req, res) => {
  try {
    const labels = await prisma.productLabel.findMany();
    
    const labelsMap = {};
    labels.forEach(l => {
      labelsMap[l.productId] = l.labels;
    });
    
    res.json({ labels: labelsMap });
  } catch (error) {
    console.error('Error obteniendo etiquetas:', error);
    res.status(500).json({ error: 'Error al obtener etiquetas' });
  }
});

// Actualizar etiquetas de un producto
app.put('/api/products/labels/:productId', corsMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const { labels } = req.body;
    
    const label = await prisma.productLabel.upsert({
      where: { productId },
      create: {
        productId,
        labels: JSON.stringify(labels || [])
      },
      update: {
        labels: JSON.stringify(labels || []),
        updatedAt: new Date()
      }
    });
    
    res.json({ label });
  } catch (error) {
    console.error('Error actualizando etiquetas:', error);
    res.status(500).json({ error: 'Error al actualizar etiquetas' });
  }
});

// Actualizar etiquetas automáticamente basado en ventas
app.post('/api/products/labels/update', corsMiddleware, async (req, res) => {
  try {
    // Obtener todos los productos
    const products = await prisma.product.findMany();
    
    // Obtener estadísticas de ventas (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'cancelled' }
      },
      include: { items: true }
    });
    
    // Contar ventas por producto
    const productSales = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    orders.forEach(order => {
      const isToday = new Date(order.createdAt) >= today;
      order.items.forEach(item => {
        if (item.productId) {
          if (!productSales[item.productId]) {
            productSales[item.productId] = { count: 0, recent: 0 };
          }
          productSales[item.productId].count += item.quantity;
          if (isToday) {
            productSales[item.productId].recent += item.quantity;
          }
        }
      });
    });
    
    // Determinar etiquetas
    const salesValues = Object.values(productSales).map(s => s.count);
    const maxSales = Math.max(...salesValues, 1);
    const minSales = Math.min(...salesValues, 0);
    const avgSales = salesValues.reduce((a, b) => a + b, 0) / (salesValues.length || 1);
    
    for (const product of products) {
      const sales = productSales[product.id] || { count: 0, recent: 0 };
      const labels = [];
      
      // "Muy pedido hoy"
      if (sales.recent > 0) {
        labels.push('muy_pedido_hoy');
      }
      
      // "Más vendido" (top 20%)
      if (sales.count >= maxSales * 0.8) {
        labels.push('más_vendido');
      }
      
      // "Recomendado" (arriba del promedio)
      if (sales.count >= avgSales) {
        labels.push('recomendado');
      }
      
      // "Pocas ventas" (abajo del 20% del promedio)
      if (sales.count > 0 && sales.count < avgSales * 0.2) {
        labels.push('pocas_ventas');
      }
      
      // "Nuevo" (creado en los últimos 7 días)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (new Date(product.createdAt) >= sevenDaysAgo) {
        labels.push('nuevo');
      }
      
      // Actualizar etiquetas
      await prisma.productLabel.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          labels: JSON.stringify(labels)
        },
        update: {
          labels: JSON.stringify(labels),
          updatedAt: new Date()
        }
      });
    }
    
    res.json({ success: true, message: 'Etiquetas actualizadas automáticamente' });
  } catch (error) {
    console.error('Error actualizando etiquetas automáticamente:', error);
    res.status(500).json({ error: 'Error al actualizar etiquetas' });
  }
});

// ========== SISTEMA DE FIDELIDAD PROFESIONAL (BASADO EN @lid) ==========

// Niveles del sistema
const LOYALTY_TIERS = {
  bronze: { pointsRequired: 0, discount: 0, benefits: 'Acceso normal', priority: false },
  silver: { pointsRequired: 500, discount: 3, benefits: '3% OFF permanente', priority: false },
  gold: { pointsRequired: 2000, discount: 7, benefits: '7% OFF + prioridad cocina', priority: true },
  vip: { pointsRequired: 5000, discount: 10, benefits: '10% OFF + combo mensual + menú exclusivo', priority: true }
};

// Cargar configuración por defecto
async function getLoyaltyConfig() {
  try {
    const defaultConfig = {
      pointsPerPurchase: 1, // 1 punto por cada $100
      pointsNewCustomer: 5,
      pointsReferrer: 100,
      pointsBirthday: 50,
      pointsDailyMission: 20,
      pointsWeeklyMission: 50,
      pointsFirstOrder: 20
    };

    const config = await prisma.loyaltyConfig.findMany();
    if (config.length === 0) {
      // Crear configuración por defecto
      for (const [key, value] of Object.entries(defaultConfig)) {
        await prisma.loyaltyConfig.create({
          data: {
            key,
            value: JSON.stringify(value)
          }
        });
      }
      return defaultConfig;
    }

    const configMap = {};
    config.forEach(c => {
      try {
        configMap[c.key] = JSON.parse(c.value);
      } catch {
        configMap[c.key] = c.value;
      }
    });
    return { ...defaultConfig, ...configMap };
  } catch (error) {
    console.error('Error cargando configuración de fidelidad:', error);
    return {
      pointsPerPurchase: 1,
      pointsNewCustomer: 5,
      pointsReferrer: 100,
      pointsBirthday: 50,
      pointsDailyMission: 20,
      pointsWeeklyMission: 50,
      pointsFirstOrder: 20
    };
  }
}

// Calcular nivel basado en puntos
function calculateTier(points) {
  if (points >= LOYALTY_TIERS.vip.pointsRequired) return 'vip';
  if (points >= LOYALTY_TIERS.gold.pointsRequired) return 'gold';
  if (points >= LOYALTY_TIERS.silver.pointsRequired) return 'silver';
  return 'bronze';
}

// Actualizar nivel del cliente
async function updateCustomerTier(customerId) {
  try {
    const loyalty = await prisma.customerLoyalty.findUnique({
      where: { customerId }
    });

    if (!loyalty) return;

    const newTier = calculateTier(loyalty.totalPoints);
    const tierConfig = LOYALTY_TIERS[newTier];

    if (loyalty.tier !== newTier) {
      await prisma.customerLoyalty.update({
        where: { customerId },
        data: {
          tier: newTier,
          discountPercentage: tierConfig.discount,
          priority: tierConfig.priority
        }
      });

      // Registrar cambio de nivel en historial
      await prisma.pointsHistory.create({
        data: {
          customerId,
          points: 0,
          reason: 'level_upgrade',
          description: `Nivel actualizado de ${loyalty.tier} a ${newTier}`
        }
      });

      console.log(`✅ Cliente ${customerId} actualizado a nivel ${newTier}`);
    }
  } catch (error) {
    console.error(`Error actualizando nivel de ${customerId}:`, error);
  }
}

// Otorgar puntos a un cliente
async function awardPoints(customerId, points, reason, description, metadata) {
  try {
    // Obtener o crear registro de fidelidad
    let loyalty = await prisma.customerLoyalty.findUnique({
      where: { customerId }
    });

    if (!loyalty) {
      loyalty = await prisma.customerLoyalty.create({
        data: {
          customerId,
          tier: 'bronze',
          totalPoints: points,
          discountPercentage: 0,
          priority: false,
          isActive: true
        }
      });
    } else {
      loyalty = await prisma.customerLoyalty.update({
        where: { customerId },
        data: {
          totalPoints: {
            increment: points
          }
        }
      });
    }

    // Registrar en historial
    await prisma.pointsHistory.create({
      data: {
        customerId,
        points,
        reason,
        description: description || `${reason}: ${points > 0 ? '+' : ''}${points} puntos`,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });

    // Actualizar nivel si es necesario
    await updateCustomerTier(customerId);

    return loyalty;
  } catch (error) {
    console.error(`Error otorgando puntos a ${customerId}:`, error);
    throw error;
  }
}

// ========== ENDPOINTS DE FIDELIDAD ==========

// Obtener configuración
app.get('/api/loyalty/config', corsMiddleware, async (req, res) => {
  try {
    const config = await getLoyaltyConfig();
    res.json({ config });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// Actualizar configuración
app.put('/api/loyalty/config', corsMiddleware, async (req, res) => {
  try {
    const config = req.body.config || req.body;
    
    for (const [key, value] of Object.entries(config)) {
      await prisma.loyaltyConfig.upsert({
        where: { key },
        create: {
          key,
          value: JSON.stringify(value)
        },
        update: {
          value: JSON.stringify(value),
          updatedAt: new Date()
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// Obtener todos los clientes con fidelidad
app.get('/api/loyalty/customers', corsMiddleware, async (req, res) => {
  try {
    const loyalties = await prisma.customerLoyalty.findMany({
      orderBy: { totalPoints: 'desc' },
      include: {
        pointsHistory: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        referralsMade: {
          where: { status: 'validated' }
        }
      }
    });

    // Obtener información de clientes
    const customers = await prisma.customer.findMany();
    const customerMap = new Map(customers.map(c => [c.phone, c]));

    const customersWithLoyalty = loyalties.map(loyalty => {
      const customer = customerMap.get(loyalty.customerId);
      return {
        id: loyalty.id,
        customerId: loyalty.customerId,
        customerName: customer?.name || null,
        tier: loyalty.tier,
        totalPoints: loyalty.totalPoints,
        totalOrders: loyalty.totalOrders,
        totalSpent: loyalty.totalSpent,
        totalReferrals: loyalty.totalReferrals,
        discountPercentage: loyalty.discountPercentage,
        priority: loyalty.priority,
        isActive: loyalty.isActive,
        lastOrderDate: loyalty.lastOrderDate,
        referredBy: loyalty.referredBy
      };
    });

    res.json({ customers: customersWithLoyalty });
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Obtener información de un cliente específico
app.get('/api/loyalty/customers/:customerId', corsMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;

    let loyalty = await prisma.customerLoyalty.findUnique({
      where: { customerId },
      include: {
        pointsHistory: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        referralsMade: {
          where: { status: 'validated' },
          include: {
            pointsHistory: true
          }
        }
      }
    });

    if (!loyalty) {
      // Crear registro si no existe
      loyalty = await prisma.customerLoyalty.create({
        data: {
          customerId,
          tier: 'bronze',
          totalPoints: 0,
          discountPercentage: 0,
          priority: false,
          isActive: true
        }
      });
    }

    const nextTier = loyalty.totalPoints < LOYALTY_TIERS.vip.pointsRequired 
      ? (loyalty.totalPoints < LOYALTY_TIERS.gold.pointsRequired
          ? (loyalty.totalPoints < LOYALTY_TIERS.silver.pointsRequired
              ? { tier: 'silver', pointsNeeded: LOYALTY_TIERS.silver.pointsRequired - loyalty.totalPoints, config: LOYALTY_TIERS.silver }
              : { tier: 'gold', pointsNeeded: LOYALTY_TIERS.gold.pointsRequired - loyalty.totalPoints, config: LOYALTY_TIERS.gold })
          : { tier: 'vip', pointsNeeded: LOYALTY_TIERS.vip.pointsRequired - loyalty.totalPoints, config: LOYALTY_TIERS.vip })
      : null;

    res.json({
      loyalty: {
        ...loyalty,
        nextTier
      }
    });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

// Modificar puntos manualmente
app.post('/api/loyalty/customers/:customerId/points', corsMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { points, reason, description } = req.body;

    if (!points || points === 0) {
      return res.status(400).json({ error: 'Los puntos deben ser diferentes de 0' });
    }

    const loyalty = await awardPoints(
      customerId,
      parseInt(points),
      reason || 'manual_admin',
      description || `Puntos ${points > 0 ? 'agregados' : 'restados'} manualmente por administrador`
    );

    res.json({ loyalty });
  } catch (error) {
    console.error('Error modificando puntos:', error);
    res.status(500).json({ error: 'Error al modificar puntos' });
  }
});

// Actualizar nivel manualmente
app.put('/api/loyalty/customers/:customerId/tier', corsMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { tier } = req.body;

    if (!LOYALTY_TIERS[tier]) {
      return res.status(400).json({ error: 'Nivel inválido' });
    }

    const tierConfig = LOYALTY_TIERS[tier];

    const loyalty = await prisma.customerLoyalty.update({
      where: { customerId },
      data: {
        tier,
        discountPercentage: tierConfig.discount,
        priority: tierConfig.priority
      }
    });

    res.json({ loyalty });
  } catch (error) {
    console.error('Error actualizando nivel:', error);
    res.status(500).json({ error: 'Error al actualizar nivel' });
  }
});

// Activar/Desactivar cliente
app.put('/api/loyalty/customers/:customerId/active', corsMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { isActive } = req.body;

    const loyalty = await prisma.customerLoyalty.update({
      where: { customerId },
      data: { isActive }
    });

    res.json({ loyalty });
  } catch (error) {
    console.error('Error cambiando estado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// Registrar referencia pendiente (cuando alguien entra al link)
app.post('/api/loyalty/referrals/pending', corsMiddleware, async (req, res) => {
  try {
    const { referredId, referrerId } = req.body;

    if (!referredId || !referrerId) {
      return res.status(400).json({ error: 'referredId y referrerId son requeridos' });
    }

    // Validar formato @lid
    if (!referredId.includes('@lid') || !referrerId.includes('@lid')) {
      return res.status(400).json({ error: 'IDs deben ser formato @lid' });
    }

    // No permitir auto-referencia
    if (referredId === referrerId) {
      return res.status(400).json({ error: 'No puedes referirte a ti mismo' });
    }

    // Verificar que no exista ya un referido válido o pendiente
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId }
    });

    if (existingReferral) {
      return res.status(400).json({ error: 'Este cliente ya tiene un referidor' });
    }

    // Crear o actualizar referencia pendiente
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Expira en 30 días

    await prisma.pendingReferral.upsert({
      where: { referredId },
      create: {
        referredId,
        referrerId,
        expiresAt
      },
      update: {
        referrerId,
        visitedAt: new Date(),
        expiresAt
      }
    });

    // Crear registro de referral pendiente
    await prisma.referral.upsert({
      where: { referredId },
      create: {
        referrerId,
        referredId,
        status: 'pending'
      },
      update: {
        referrerId,
        status: 'pending'
      }
    });

    res.json({ success: true, message: 'Referencia pendiente registrada' });
  } catch (error) {
    console.error('Error registrando referencia pendiente:', error);
    res.status(500).json({ error: 'Error al registrar referencia' });
  }
});

// Validar referido (cuando un pedido es entregado y pagado)
async function validateReferral(referredId, orderId) {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredId },
      include: {
        referrerLoyalty: true
      }
    });

    if (!referral || referral.status !== 'pending') {
      return; // No hay referido pendiente o ya fue validado
    }

    // Verificar que el cliente sea realmente nuevo (no tenga pedidos anteriores)
    const previousOrders = await prisma.order.findMany({
      where: {
        customerPhone: referredId,
        status: { not: 'cancelled' },
        id: { not: orderId }
      }
    });

    if (previousOrders.length > 0) {
      // Cliente no es nuevo, cancelar referido
      await prisma.referral.update({
        where: { referredId },
        data: { status: 'cancelled' }
      });
      return;
    }

    // Verificar que el pedido esté pagado y entregado
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order || order.status !== 'delivered' || order.paymentStatus !== 'approved') {
      return; // Aún no está validado
    }

    // Validar referido
    const config = await getLoyaltyConfig();
    const pointsAwarded = config.pointsReferrer || 100;

    await prisma.referral.update({
      where: { referredId },
      data: {
        status: 'validated',
        validatedAt: new Date(),
        validationOrderId: orderId,
        pointsAwarded
      }
    });

    // Otorgar puntos al invitador
    await awardPoints(
      referral.referrerId,
      pointsAwarded,
      'referidor',
      `Referido validado: ${referredId}`,
      { referralId: referral.id, orderId }
    );

    // Otorgar puntos al nuevo cliente
    await awardPoints(
      referredId,
      config.pointsNewCustomer || 5,
      'cliente_nuevo',
      'Cliente nuevo - referido validado',
      { referralId: referral.id, orderId }
    );

    // Actualizar contador de referidos del invitador
    await prisma.customerLoyalty.update({
      where: { customerId: referral.referrerId },
      data: {
        totalReferrals: {
          increment: 1
        }
      }
    });

    // Registrar en historial del referral
    await prisma.pointsHistory.create({
      data: {
        customerId: referral.referrerId,
        points: pointsAwarded,
        reason: 'referidor',
        referralId: referral.id,
        description: `Referido validado: ${referredId}`
      }
    });

    console.log(`✅ Referido validado: ${referredId} -> ${referral.referrerId} (+${pointsAwarded} pts)`);
    
    // ========== ENVIAR NOTIFICACIONES POR WHATSAPP ==========
    try {
      const API_URL = process.env.API_URL || 'https://elbuenmenu.site';
      
      // Notificar al invitador (Cliente A)
      const referrerMessage = `🎉 *¡Tu invitado hizo su primera compra!*\n\n` +
        `✔ Referido validado\n` +
        `🆔 Invitado: ${referredId.split('@')[0].substring(0, 8)}...\n` +
        `🍽 Pedido ${order.orderNumber}\n` +
        `💰 Monto: $${order.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
        `🏆 *Puntos ganados: +${pointsAwarded}*\n\n` +
        `Seguí invitando y subí de nivel 😉`;
      
      await fetch(`${API_URL}/api/bot/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: referral.referrerId,
          message: referrerMessage
        })
      }).catch(err => console.error('Error notificando invitador:', err));
      
      // Notificar al nuevo cliente (Cliente B)
      const referredMessage = `🎉 *¡Bienvenido a El Buen Menú!*\n\n` +
        `Por ser cliente nuevo recibiste:\n` +
        `🏅 +${config.pointsNewCustomer || 5} puntos de regalo\n\n` +
        `Tu próxima compra ya suma puntos automáticamente 🙌\n\n` +
        `💡 Escribí "mis puntos" para ver tu progreso.`;
      
      await fetch(`${API_URL}/api/bot/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: referredId,
          message: referredMessage
        })
      }).catch(err => console.error('Error notificando nuevo cliente:', err));
      
    } catch (notifError) {
      console.error('Error enviando notificaciones de referido:', notifError);
      // No fallar la validación si hay error en notificaciones
    }
    
  } catch (error) {
    console.error('Error validando referido:', error);
  }
}

// ========== REFERIDOS ==========
// Obtener referidos de un cliente
app.get('/api/loyalty/referrals', corsMiddleware, async (req, res) => {
  try {
    const { referrerId } = req.query;
    
    if (!referrerId) {
      return res.status(400).json({ error: 'referrerId es requerido' });
    }
    
    const referrals = await prisma.referral.findMany({
      where: { referrerId },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ referrals });
  } catch (error) {
    console.error('Error obteniendo referidos:', error);
    res.status(500).json({ error: 'Error al obtener referidos' });
  }
});

// ========== NOTIFICACIONES DEL BOT ==========
// Endpoint para enviar notificaciones por WhatsApp
app.post('/api/bot/send-notification', corsMiddleware, async (req, res) => {
  try {
    const { customerPhone, message } = req.body;
    
    if (!customerPhone || !message) {
      return res.status(400).json({ error: 'customerPhone y message son requeridos' });
    }
    
    // Enviar notificación al bot de WhatsApp
    const webhookUrl = process.env.BOT_WEBHOOK_URL || 'http://localhost:3001';
    
    const response = await fetch(`${webhookUrl}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: customerPhone,
        message: message
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error enviando notificación (${response.status}):`, errorText);
      return res.status(500).json({ error: 'Error al enviar notificación' });
    }
    
    res.json({ success: true, message: 'Notificación enviada' });
  } catch (error) {
    console.error('Error en send-notification:', error);
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
});

// ========== CÓDIGOS PROMOCIONALES ==========

// Obtener todos los códigos
app.get('/api/loyalty/promo-codes', corsMiddleware, async (req, res) => {
  try {
    const codes = await prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        redemptions: {
          take: 10,
          orderBy: { redeemedAt: 'desc' }
        }
      }
    });

    const codesWithStats = codes.map(code => ({
      ...code,
      levelRestriction: code.levelRestriction ? JSON.parse(code.levelRestriction) : null,
      validHours: code.validHours ? JSON.parse(code.validHours) : null
    }));

    res.json({ codes: codesWithStats });
  } catch (error) {
    console.error('Error obteniendo códigos:', error);
    res.status(500).json({ error: 'Error al obtener códigos' });
  }
});

// Crear código promocional
app.post('/api/loyalty/promo-codes', corsMiddleware, async (req, res) => {
  try {
    const { code, type, value, description, productId, levelRestriction, maxTotalUses, maxUsesPerCustomer, validFrom, validUntil, validHours, isActive } = req.body;

    if (!code || !type || value === undefined || value <= 0) {
      return res.status(400).json({ error: 'Código, tipo y valor son requeridos' });
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase().trim(),
        type,
        value: parseFloat(value),
        description: description || null,
        productId: productId || null,
        levelRestriction: levelRestriction && levelRestriction.length > 0 ? JSON.stringify(levelRestriction) : null,
        maxTotalUses: maxTotalUses || null,
        maxUsesPerCustomer: maxUsesPerCustomer || 1,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        validHours: validHours ? JSON.stringify(validHours) : null,
        isActive: isActive !== undefined ? isActive : true
      }
    });

    res.json({ code: promoCode });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El código ya existe' });
    }
    console.error('Error creando código:', error);
    res.status(500).json({ error: 'Error al crear código' });
  }
});

// Actualizar código promocional
app.put('/api/loyalty/promo-codes/:id', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, type, value, description, productId, levelRestriction, maxTotalUses, maxUsesPerCustomer, validFrom, validUntil, validHours, isActive } = req.body;

    const updateData = {};
    if (code !== undefined) updateData.code = code.toUpperCase().trim();
    if (type !== undefined) updateData.type = type;
    if (value !== undefined) updateData.value = parseFloat(value);
    if (description !== undefined) updateData.description = description || null;
    if (productId !== undefined) updateData.productId = productId || null;
    if (levelRestriction !== undefined) updateData.levelRestriction = levelRestriction && levelRestriction.length > 0 ? JSON.stringify(levelRestriction) : null;
    if (maxTotalUses !== undefined) updateData.maxTotalUses = maxTotalUses || null;
    if (maxUsesPerCustomer !== undefined) updateData.maxUsesPerCustomer = maxUsesPerCustomer;
    if (validFrom !== undefined) updateData.validFrom = new Date(validFrom);
    if (validUntil !== undefined) updateData.validUntil = new Date(validUntil);
    if (validHours !== undefined) updateData.validHours = validHours ? JSON.stringify(validHours) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const promoCode = await prisma.promoCode.update({
      where: { id },
      data: updateData
    });

    res.json({ code: promoCode });
  } catch (error) {
    console.error('Error actualizando código:', error);
    res.status(500).json({ error: 'Error al actualizar código' });
  }
});

// Activar/Desactivar código
app.put('/api/loyalty/promo-codes/:id/active', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const promoCode = await prisma.promoCode.update({
      where: { id },
      data: { isActive }
    });

    res.json({ code: promoCode });
  } catch (error) {
    console.error('Error cambiando estado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

// Eliminar código
app.delete('/api/loyalty/promo-codes/:id', corsMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.promoCode.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando código:', error);
    res.status(500).json({ error: 'Error al eliminar código' });
  }
});

// Validar y canjear código promocional
app.post('/api/loyalty/promo-codes/redeem', corsMiddleware, async (req, res) => {
  try {
    const { code, customerId, orderId } = req.body;

    if (!code || !customerId) {
      return res.status(400).json({ error: 'Código y customerId son requeridos' });
    }

    // Buscar código
    const promoCode = await prisma.promoCode.findUnique({
      where: { code: code.toUpperCase().trim() }
    });

    if (!promoCode) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    // Validar si está activo
    if (!promoCode.isActive) {
      return res.status(400).json({ error: 'El código no está activo' });
    }

    // Validar fechas
    const now = new Date();
    if (new Date(promoCode.validFrom) > now) {
      return res.status(400).json({ error: 'El código aún no es válido' });
    }

    if (new Date(promoCode.validUntil) < now) {
      return res.status(400).json({ error: 'El código ha expirado' });
    }

    // Validar límite de usos totales
    if (promoCode.maxTotalUses && promoCode.totalUses >= promoCode.maxTotalUses) {
      return res.status(400).json({ error: 'El código ha alcanzado su límite de usos' });
    }

    // Validar nivel del cliente
    if (promoCode.levelRestriction) {
      const levelRestriction = JSON.parse(promoCode.levelRestriction);
      const loyalty = await prisma.customerLoyalty.findUnique({
        where: { customerId }
      });

      if (!loyalty || !levelRestriction.includes(loyalty.tier)) {
        return res.status(403).json({ error: 'Tu nivel no permite usar este código' });
      }
    }

    // Validar usos por cliente
    const customerUses = await prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: promoCode.id,
        customerId
      }
    });

    if (customerUses >= promoCode.maxUsesPerCustomer) {
      return res.status(400).json({ error: 'Ya has usado este código el máximo de veces permitido' });
    }

    // Validar horarios
    if (promoCode.validHours) {
      const validHours = JSON.parse(promoCode.validHours);
      const currentHour = now.getHours();
      const fromHour = parseInt(validHours.from.split(':')[0]);
      const toHour = parseInt(validHours.to.split(':')[0]);

      if (fromHour > toHour) {
        // Horario que cruza medianoche (ej: 18:00 a 02:00)
        if (currentHour < fromHour && currentHour >= toHour) {
          return res.status(400).json({ error: 'El código no es válido en este horario' });
        }
      } else {
        // Horario normal
        if (currentHour < fromHour || currentHour >= toHour) {
          return res.status(400).json({ error: 'El código no es válido en este horario' });
        }
      }
    }

    // Todo válido, registrar canje
    let pointsAwarded = 0;
    if (promoCode.type === 'bonus_points') {
      pointsAwarded = promoCode.value;
      await awardPoints(
        customerId,
        pointsAwarded,
        'codigo_promocional',
        `Código promocional: ${promoCode.code}`,
        { promoCodeId: promoCode.id, orderId }
      );
    }

    // Registrar canje
    await prisma.promoCodeRedemption.create({
      data: {
        promoCodeId: promoCode.id,
        customerId,
        orderId: orderId || null,
        pointsAwarded
      }
    });

    // Incrementar contador de usos
    await prisma.promoCode.update({
      where: { id: promoCode.id },
      data: {
        totalUses: {
          increment: 1
        }
      }
    });

    res.json({
      success: true,
      promoCode: {
        ...promoCode,
        type: promoCode.type,
        value: promoCode.value,
        description: promoCode.description
      },
      pointsAwarded
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Este código ya fue usado para este pedido' });
    }
    console.error('Error canjeando código:', error);
    res.status(500).json({ error: 'Error al canjear código' });
  }
});

// ========== ENDPOINT PARA LIMPIAR RATE LIMITING (SOLO DESARROLLO) ==========
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/admin/clear-rate-limit', authenticateAdmin, async (req, res) => {
    try {
      // Limpiar el store de rate limiting
      const { rateLimitStore } = await import('./src/middlewares/rate-limit-advanced.middleware.js');
      if (rateLimitStore) {
        rateLimitStore.clear();
        console.log('✅ Rate limiting limpiado manualmente');
      }
      res.json({ success: true, message: 'Rate limiting limpiado' });
    } catch (error) {
      console.error('Error limpiando rate limit:', error);
      res.status(500).json({ error: 'Error al limpiar rate limiting' });
    }
  });
}

// ========== ERROR HANDLER (debe ir al final) ==========
app.use(errorHandler);

// ========== HEALTHCHECK (simple JSON) ==========
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    time: new Date().toISOString()
  });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en https://elbuenmenu.site`);
  console.log(`🔒 Seguridad habilitada: JWT, bcrypt, rate limiting, validación`);
});

