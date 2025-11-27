/**
 * Handlers para cada estado de la FSM
 * Cada handler procesa el mensaje y retorna la respuesta + siguiente estado
 */

import { ConversationStates } from './conversation-state.js';

/**
 * Handler para estado IDLE
 */
export async function handleIdle(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  // Detectar intención
  if (text.includes('hola') || text.includes('buenas') || text.includes('hi')) {
    conversation.transition(ConversationStates.GREETING);
    return {
      response: context.messages.greeting || '¡Hola! 👋 Bienvenido a nuestro local. ¿En qué puedo ayudarte?',
      options: ['📋 Ver Menú', '🛒 Mi Carrito', '📍 Seguir Pedido'],
    };
  }
  
  if (text.includes('menu') || text.includes('menú') || text.includes('carta')) {
    conversation.transition(ConversationStates.BROWSING_MENU);
    return {
      response: '📋 *MENÚ*\n\nSelecciona una categoría:',
      showCategories: true,
    };
  }
  
  if (text.includes('pedido') || text.includes('seguir') || text.includes('tracking')) {
    conversation.transition(ConversationStates.TRACKING_ORDER);
    return {
      response: '📍 Para ver el estado de tu pedido, envíame el número de pedido o tu código de seguimiento.',
    };
  }
  
  if (text.includes('carrito') || text.includes('cart')) {
    conversation.transition(ConversationStates.VIEWING_CART);
    return {
      response: formatCart(conversation),
      options: conversation.data.cart.length > 0 
        ? ['✅ Finalizar Pedido', '🗑️ Vaciar Carrito', '📋 Seguir Comprando']
        : ['📋 Ver Menú'],
    };
  }
  
  // Default: mostrar opciones
  return {
    response: '¡Hola! 👋 ¿Cómo puedo ayudarte?\n\nEscribe:\n• *menu* para ver nuestros productos\n• *carrito* para ver tu carrito\n• *pedido* para seguir tu pedido',
  };
}

/**
 * Handler para estado GREETING
 */
export async function handleGreeting(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  if (text.includes('menu') || text.includes('1') || text.includes('ver')) {
    conversation.transition(ConversationStates.BROWSING_MENU);
    return {
      response: '📋 *MENÚ*\n\nSelecciona una categoría:',
      showCategories: true,
    };
  }
  
  if (text.includes('carrito') || text.includes('2')) {
    conversation.transition(ConversationStates.VIEWING_CART);
    return {
      response: formatCart(conversation),
    };
  }
  
  // Volver a idle si no entiende
  conversation.transition(ConversationStates.IDLE);
  return {
    response: 'No entendí tu mensaje. Escribe *menu* para ver nuestros productos.',
  };
}

/**
 * Handler para estado BROWSING_MENU
 */
export async function handleBrowsingMenu(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  // Si es un número, seleccionar categoría
  const categoryIndex = parseInt(text) - 1;
  if (!isNaN(categoryIndex) && context.categories && context.categories[categoryIndex]) {
    const category = context.categories[categoryIndex];
    conversation.transition(ConversationStates.SELECTING_CATEGORY, { 
      selectedCategory: category.id 
    });
    return {
      response: `📂 *${category.name.toUpperCase()}*\n\nSelecciona un producto:`,
      showProducts: true,
      categoryId: category.id,
    };
  }
  
  if (text.includes('carrito') || text.includes('cart')) {
    conversation.transition(ConversationStates.VIEWING_CART);
    return {
      response: formatCart(conversation),
    };
  }
  
  if (text.includes('volver') || text.includes('salir') || text.includes('0')) {
    conversation.transition(ConversationStates.IDLE);
    return {
      response: '¡Hasta pronto! Escribe *menu* cuando quieras volver a ver nuestros productos.',
    };
  }
  
  return {
    response: 'Por favor, selecciona un número de categoría válido.',
    showCategories: true,
  };
}

/**
 * Handler para estado SELECTING_PRODUCT
 */
export async function handleSelectingProduct(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  // Si es un número, seleccionar producto
  const productIndex = parseInt(text) - 1;
  if (!isNaN(productIndex) && context.products && context.products[productIndex]) {
    const product = context.products[productIndex];
    conversation.transition(ConversationStates.ADDING_TO_CART, {
      selectedProduct: product,
    });
    return {
      response: formatProductDetail(product),
      options: ['✅ Agregar al carrito', '📋 Volver al menú'],
    };
  }
  
  if (text.includes('volver') || text.includes('0')) {
    conversation.transition(ConversationStates.BROWSING_MENU);
    return {
      response: '📋 *MENÚ*\n\nSelecciona una categoría:',
      showCategories: true,
    };
  }
  
  return {
    response: 'Por favor, selecciona un número de producto válido.',
  };
}

/**
 * Handler para estado ADDING_TO_CART
 */
export async function handleAddingToCart(message, conversation, context) {
  const text = message.toLowerCase().trim();
  const product = conversation.data.selectedProduct;
  
  if (text.includes('agregar') || text.includes('si') || text.includes('1') || text.includes('✅')) {
    // Agregar al carrito
    conversation.addToCart(product, 1);
    conversation.transition(ConversationStates.VIEWING_CART);
    
    return {
      response: `✅ *${product.name}* agregado al carrito!\n\n${formatCart(conversation)}`,
      options: ['✅ Finalizar Pedido', '📋 Seguir Comprando'],
    };
  }
  
  if (text.includes('volver') || text.includes('menu') || text.includes('2') || text.includes('no')) {
    conversation.transition(ConversationStates.BROWSING_MENU);
    return {
      response: '📋 *MENÚ*\n\nSelecciona una categoría:',
      showCategories: true,
    };
  }
  
  // Cantidad específica
  const quantity = parseInt(text);
  if (!isNaN(quantity) && quantity > 0 && quantity <= 10) {
    conversation.addToCart(product, quantity);
    conversation.transition(ConversationStates.VIEWING_CART);
    
    return {
      response: `✅ ${quantity}x *${product.name}* agregado al carrito!\n\n${formatCart(conversation)}`,
      options: ['✅ Finalizar Pedido', '📋 Seguir Comprando'],
    };
  }
  
  return {
    response: '¿Cuántas unidades deseas agregar? (1-10)',
  };
}

/**
 * Handler para estado VIEWING_CART
 */
export async function handleViewingCart(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  if (text.includes('finalizar') || text.includes('pedir') || text.includes('1') || text.includes('✅')) {
    if (conversation.data.cart.length === 0) {
      return {
        response: '🛒 Tu carrito está vacío. Escribe *menu* para ver nuestros productos.',
      };
    }
    
    conversation.transition(ConversationStates.CHECKOUT_ADDRESS);
    return {
      response: '📍 *DIRECCIÓN DE ENTREGA*\n\nPor favor, envíame tu dirección completa (calle, número, entre calles, referencias):',
    };
  }
  
  if (text.includes('vaciar') || text.includes('limpiar') || text.includes('borrar')) {
    conversation.data.cart = [];
    return {
      response: '🗑️ Carrito vaciado. Escribe *menu* para ver nuestros productos.',
    };
  }
  
  if (text.includes('seguir') || text.includes('menu') || text.includes('2')) {
    conversation.transition(ConversationStates.BROWSING_MENU);
    return {
      response: '📋 *MENÚ*\n\nSelecciona una categoría:',
      showCategories: true,
    };
  }
  
  return {
    response: formatCart(conversation),
    options: conversation.data.cart.length > 0 
      ? ['✅ Finalizar Pedido', '📋 Seguir Comprando', '🗑️ Vaciar Carrito']
      : ['📋 Ver Menú'],
  };
}

/**
 * Handler para estado CHECKOUT_ADDRESS
 */
export async function handleCheckoutAddress(message, conversation, context) {
  const text = message.trim();
  
  if (text.length < 10) {
    return {
      response: '⚠️ La dirección parece muy corta. Por favor, incluye calle, número y referencias.',
    };
  }
  
  conversation.transition(ConversationStates.CHECKOUT_PAYMENT, {
    address: text,
  });
  
  return {
    response: `📍 Dirección guardada:\n${text}\n\n💳 *MÉTODO DE PAGO*\n\nSelecciona cómo deseas pagar:\n\n1️⃣ Efectivo\n2️⃣ Transferencia\n3️⃣ MercadoPago`,
  };
}

/**
 * Handler para estado CHECKOUT_PAYMENT
 */
export async function handleCheckoutPayment(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  let paymentMethod = null;
  
  if (text.includes('efectivo') || text === '1') {
    paymentMethod = 'efectivo';
  } else if (text.includes('transfer') || text === '2') {
    paymentMethod = 'transferencia';
  } else if (text.includes('mercado') || text === '3') {
    paymentMethod = 'mercadopago';
  }
  
  if (!paymentMethod) {
    return {
      response: '⚠️ Por favor, selecciona un método de pago válido:\n\n1️⃣ Efectivo\n2️⃣ Transferencia\n3️⃣ MercadoPago',
    };
  }
  
  conversation.transition(ConversationStates.CHECKOUT_CONFIRM, {
    paymentMethod,
  });
  
  const total = conversation.getCartTotal();
  const deliveryFee = context.deliveryFee || 0;
  
  return {
    response: `📋 *RESUMEN DEL PEDIDO*\n\n${formatCartItems(conversation)}\n\n📍 *Dirección:* ${conversation.data.address}\n💳 *Pago:* ${paymentMethod}\n\n💰 *Subtotal:* $${total.toFixed(2)}\n🚗 *Envío:* $${deliveryFee.toFixed(2)}\n━━━━━━━━━━━━━━\n💵 *TOTAL:* $${(total + deliveryFee).toFixed(2)}\n\n¿Confirmas el pedido?\n\n✅ *SI* para confirmar\n❌ *NO* para cancelar`,
  };
}

/**
 * Handler para estado CHECKOUT_CONFIRM
 */
export async function handleCheckoutConfirm(message, conversation, context) {
  const text = message.toLowerCase().trim();
  
  if (text.includes('si') || text.includes('confirmar') || text.includes('✅') || text === 'yes') {
    // Crear pedido
    const order = await context.createOrder(conversation);
    
    if (conversation.data.paymentMethod === 'transferencia') {
      conversation.transition(ConversationStates.WAITING_TRANSFER, {
        currentOrderId: order.id,
      });
      
      return {
        response: `✅ *PEDIDO #${order.orderNumber} CREADO*\n\n📲 Por favor, realiza la transferencia a:\n\n🏦 *Alias:* ${context.transferAlias || 'TIENDA.MP'}\n💰 *Monto:* $${order.total.toFixed(2)}\n\nUna vez realizada, envíame el comprobante para confirmar tu pedido.`,
      };
    }
    
    conversation.transition(ConversationStates.ORDER_PLACED, {
      currentOrderId: order.id,
    });
    
    return {
      response: `✅ *¡PEDIDO #${order.orderNumber} CONFIRMADO!*\n\n📍 Dirección: ${conversation.data.address}\n💳 Pago: ${conversation.data.paymentMethod}\n💰 Total: $${order.total.toFixed(2)}\n\n⏱️ Tiempo estimado: 30-45 min\n\n¡Gracias por tu compra! Te avisaremos cuando esté en camino. 🚗`,
    };
  }
  
  if (text.includes('no') || text.includes('cancelar') || text.includes('❌')) {
    conversation.transition(ConversationStates.VIEWING_CART);
    return {
      response: '❌ Pedido cancelado. Tu carrito sigue guardado.\n\n' + formatCart(conversation),
    };
  }
  
  return {
    response: '¿Confirmas el pedido?\n\n✅ *SI* para confirmar\n❌ *NO* para cancelar',
  };
}

// ============ HELPERS ============

function formatCart(conversation) {
  if (conversation.data.cart.length === 0) {
    return '🛒 *TU CARRITO*\n\n_El carrito está vacío_';
  }
  
  let text = '🛒 *TU CARRITO*\n\n';
  text += formatCartItems(conversation);
  text += `\n━━━━━━━━━━━━━━\n💰 *Total:* $${conversation.getCartTotal().toFixed(2)}`;
  
  return text;
}

function formatCartItems(conversation) {
  return conversation.data.cart.map((item, i) => {
    return `${i + 1}. ${item.quantity}x ${item.productName} - $${(item.price * item.quantity).toFixed(2)}`;
  }).join('\n');
}

function formatProductDetail(product) {
  let text = `📦 *${product.name.toUpperCase()}*\n\n`;
  if (product.description) {
    text += `${product.description}\n\n`;
  }
  text += `💰 *Precio:* $${product.price.toFixed(2)}`;
  return text;
}

// Exportar todos los handlers
export const stateHandlers = {
  [ConversationStates.IDLE]: handleIdle,
  [ConversationStates.GREETING]: handleGreeting,
  [ConversationStates.BROWSING_MENU]: handleBrowsingMenu,
  [ConversationStates.SELECTING_CATEGORY]: handleBrowsingMenu, // Mismo handler
  [ConversationStates.SELECTING_PRODUCT]: handleSelectingProduct,
  [ConversationStates.ADDING_TO_CART]: handleAddingToCart,
  [ConversationStates.VIEWING_CART]: handleViewingCart,
  [ConversationStates.CHECKOUT_ADDRESS]: handleCheckoutAddress,
  [ConversationStates.CHECKOUT_PAYMENT]: handleCheckoutPayment,
  [ConversationStates.CHECKOUT_CONFIRM]: handleCheckoutConfirm,
};

export default stateHandlers;

