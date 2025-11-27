/**
 * Comandos de administración por WhatsApp
 * Solo disponibles para números de admin configurados
 */

import prisma from '../../../server/src/utils/prisma.js';

// Comandos disponibles
export const ADMIN_COMMANDS = {
  PAUSAR_TIENDA: '*pausar_tienda*',
  REANUDAR_TIENDA: '*reanudar_tienda*',
  VER_PEDIDOS_HOY: '*ver_pedidos_hoy*',
  VER_PENDIENTES: '*ver_pendientes*',
  PRODUCTO_SIN_STOCK: '*producto_sin_stock*',
  ESTADO_TIENDA: '*estado_tienda*',
  AYUDA_ADMIN: '*ayuda_admin*',
};

/**
 * Verificar si un número es admin
 */
export function isAdminNumber(phone, adminNumbers) {
  const cleanPhone = phone.replace(/\D/g, '');
  return adminNumbers.some(admin => cleanPhone.includes(admin.replace(/\D/g, '')));
}

/**
 * Procesar comando de admin
 */
export async function processAdminCommand(message, storeId, context) {
  const text = message.toLowerCase().trim();
  
  // *pausar_tienda*
  if (text.includes('pausar_tienda')) {
    return await pauseStore(storeId);
  }
  
  // *reanudar_tienda*
  if (text.includes('reanudar_tienda')) {
    return await resumeStore(storeId);
  }
  
  // *ver_pedidos_hoy*
  if (text.includes('ver_pedidos_hoy')) {
    return await getTodayOrders(storeId);
  }
  
  // *ver_pendientes*
  if (text.includes('ver_pendientes')) {
    return await getPendingOrders(storeId);
  }
  
  // *producto_sin_stock {id o nombre}*
  if (text.includes('producto_sin_stock')) {
    const match = text.match(/producto_sin_stock\s+(.+)/);
    if (match) {
      return await markProductOutOfStock(storeId, match[1].trim());
    }
    return { response: '⚠️ Uso: *producto_sin_stock {nombre o id}*' };
  }
  
  // *estado_tienda*
  if (text.includes('estado_tienda')) {
    return await getStoreStatus(storeId);
  }
  
  // *ayuda_admin*
  if (text.includes('ayuda_admin')) {
    return getAdminHelp();
  }
  
  return null; // No es un comando admin
}

/**
 * Pausar tienda
 */
async function pauseStore(storeId) {
  try {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { isOpen: false },
    });
    
    return {
      response: `⏸️ *TIENDA PAUSADA*\n\nLa tienda ha sido pausada. Los clientes verán un mensaje de "cerrado".\n\nPara reanudar, envía: *reanudar_tienda*`,
    };
  } catch (error) {
    return { response: `❌ Error al pausar: ${error.message}` };
  }
}

/**
 * Reanudar tienda
 */
async function resumeStore(storeId) {
  try {
    await prisma.storeSettings.update({
      where: { storeId },
      data: { isOpen: true },
    });
    
    return {
      response: `▶️ *TIENDA REANUDADA*\n\nLa tienda está nuevamente abierta y recibiendo pedidos.`,
    };
  } catch (error) {
    return { response: `❌ Error al reanudar: ${error.message}` };
  }
}

/**
 * Obtener pedidos de hoy
 */
async function getTodayOrders(storeId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: today },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    if (orders.length === 0) {
      return { response: '📋 *PEDIDOS HOY*\n\n_No hay pedidos hoy_' };
    }
    
    const totalVentas = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const entregados = orders.filter(o => o.status === 'delivered').length;
    const pendientes = orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length;
    const cancelados = orders.filter(o => o.status === 'cancelled').length;
    
    let response = `📋 *PEDIDOS HOY*\n\n`;
    response += `📊 *Resumen:*\n`;
    response += `• Total: ${orders.length} pedidos\n`;
    response += `• Entregados: ${entregados}\n`;
    response += `• Pendientes: ${pendientes}\n`;
    response += `• Cancelados: ${cancelados}\n`;
    response += `• Ventas: $${totalVentas.toFixed(2)}\n\n`;
    
    // Últimos 5 pedidos
    response += `📝 *Últimos pedidos:*\n`;
    orders.slice(0, 5).forEach(order => {
      const statusEmoji = getStatusEmoji(order.status);
      response += `${statusEmoji} #${order.orderNumber} - ${order.customerName} - $${Number(order.total).toFixed(2)}\n`;
    });
    
    return { response };
  } catch (error) {
    return { response: `❌ Error: ${error.message}` };
  }
}

/**
 * Obtener pedidos pendientes
 */
async function getPendingOrders(storeId) {
  try {
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: { in: ['pending', 'confirmed', 'preparing', 'ready'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    
    if (orders.length === 0) {
      return { response: '✅ *SIN PEDIDOS PENDIENTES*\n\n¡No hay pedidos pendientes!' };
    }
    
    let response = `⏳ *PEDIDOS PENDIENTES (${orders.length})*\n\n`;
    
    orders.forEach(order => {
      const statusEmoji = getStatusEmoji(order.status);
      const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
      response += `${statusEmoji} *#${order.orderNumber}*\n`;
      response += `   👤 ${order.customerName}\n`;
      response += `   📍 ${order.customerAddress || 'Sin dirección'}\n`;
      response += `   ⏱️ Hace ${mins} min\n`;
      response += `   💰 $${Number(order.total).toFixed(2)}\n\n`;
    });
    
    return { response };
  } catch (error) {
    return { response: `❌ Error: ${error.message}` };
  }
}

/**
 * Marcar producto sin stock
 */
async function markProductOutOfStock(storeId, productIdentifier) {
  try {
    // Buscar por ID o nombre
    const product = await prisma.product.findFirst({
      where: {
        storeId,
        OR: [
          { id: productIdentifier },
          { name: { contains: productIdentifier, mode: 'insensitive' } },
        ],
      },
    });
    
    if (!product) {
      return { response: `❌ Producto no encontrado: "${productIdentifier}"` };
    }
    
    await prisma.product.update({
      where: { id: product.id },
      data: { isAvailable: false },
    });
    
    return {
      response: `🚫 *PRODUCTO SIN STOCK*\n\n"${product.name}" ha sido marcado como no disponible.\n\nPara habilitarlo, ve al panel de admin.`,
    };
  } catch (error) {
    return { response: `❌ Error: ${error.message}` };
  }
}

/**
 * Obtener estado de la tienda
 */
async function getStoreStatus(storeId) {
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId },
      include: { store: true },
    });
    
    if (!settings) {
      return { response: '❌ Configuración de tienda no encontrada' };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = await prisma.order.count({
      where: { storeId, createdAt: { gte: today } },
    });
    
    const pendingOrders = await prisma.order.count({
      where: {
        storeId,
        status: { in: ['pending', 'confirmed', 'preparing', 'ready'] },
      },
    });
    
    let response = `🏪 *ESTADO DE ${settings.store?.name?.toUpperCase() || 'TIENDA'}*\n\n`;
    response += `${settings.isOpen ? '🟢 ABIERTA' : '🔴 CERRADA'}\n\n`;
    response += `📊 *Hoy:*\n`;
    response += `• Pedidos: ${todayOrders}\n`;
    response += `• Pendientes: ${pendingOrders}\n\n`;
    response += `⚙️ *Configuración:*\n`;
    response += `• Delivery: ${settings.deliveryEnabled ? '✅' : '❌'}\n`;
    response += `• Retiro: ${settings.pickupEnabled ? '✅' : '❌'}\n`;
    response += `• Efectivo: ${settings.cashEnabled ? '✅' : '❌'}\n`;
    response += `• Transferencia: ${settings.transferEnabled ? '✅' : '❌'}\n`;
    
    return { response };
  } catch (error) {
    return { response: `❌ Error: ${error.message}` };
  }
}

/**
 * Mostrar ayuda de comandos admin
 */
function getAdminHelp() {
  return {
    response: `🔧 *COMANDOS DE ADMINISTRADOR*\n\n` +
      `*pausar_tienda* - Pausar recepción de pedidos\n` +
      `*reanudar_tienda* - Reanudar tienda\n` +
      `*ver_pedidos_hoy* - Ver resumen del día\n` +
      `*ver_pendientes* - Ver pedidos pendientes\n` +
      `*producto_sin_stock {nombre}* - Marcar sin stock\n` +
      `*estado_tienda* - Ver estado actual\n` +
      `*ayuda_admin* - Ver esta ayuda\n`,
  };
}

// Helpers
function getStatusEmoji(status) {
  const emojis = {
    pending: '🟡',
    confirmed: '🔵',
    preparing: '🟠',
    ready: '🟢',
    in_transit: '🚗',
    delivered: '✅',
    cancelled: '❌',
  };
  return emojis[status] || '⚪';
}

export default { processAdminCommand, isAdminNumber, ADMIN_COMMANDS };

