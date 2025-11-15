
import { detectUserIntent } from '../ai.js';

// Obtener mensaje de bienvenida
export function getWelcomeMessage(config) {
    return config.mensajes?.bienvenida || "¡Hola! 👋 Bienvenido a El Buen Menú 🍔\\n1️⃣ Ver menú\\n2️⃣ Consultar pedido\\n3️⃣ Horarios";
}

// Obtener respuesta del menú
export function getMenuResponse(config) {
    return config.mensajes?.menu || `🛒 Podés ver nuestro menú completo aquí: ${config.menuUrl || 'https://elbuenmenu.com/menu'}`;
}

// Obtener respuesta de consulta de pedido
export function getOrderResponse(config) {
    return config.mensajes?.consultar_pedido || "Por favor, enviame tu número de pedido o nombre para consultar su estado 📦";
}

// Obtener respuesta de horarios
export function getHoursResponse(config) {
    return `🕕 **HORARIOS:**\\n\\n${config.horarios || 'Lunes a Domingo de 11:00 a 23:00'}\\n\\n¡Estamos abiertos! 😊`;
}

// Obtener respuesta de opciones de pago
export function getPaymentResponse(config) {
    return config.mensajes?.pago_opciones || "Recibimos tu pedido 🧾\\nPor favor confirmá el método de pago:\\n💳 Transferencia / Mercado Pago / Efectivo";
}

// Respuestas predeterminadas por categoría (mantenidas para compatibilidad)
const DEFAULT_RESPONSES = {
    greeting: [
        '¡Hola! 👋 Bienvenido a El Buen Menú. ¿En qué puedo ayudarte?',
        '¡Buenas! 😊 ¿Querés ver nuestro menú o hacer un pedido?',
        '¡Hola! 🍔 ¿Te ayudo con algo del menú?'
    ],
    
    menu: [
        '📋 **NUESTRO MENÚ:**\\n\\n🍔 **Hamburguesas** (desde $1800)\\n- Clásica, Completa, Doble carne, Vegetariana\\n\\n🍕 **Pizzas** (desde $2500)\\n- Muzzarella, Napolitana, Fugazzeta, Especial\\n\\n🥟 **Empanadas** (docena $2000)\\n- Carne, Pollo, Jamón y queso, Verdura\\n\\n🍗 **Milanesas** (desde $2200)\\n- Napolitana, Completa, Simple\\n\\n🥤 **Bebidas** (desde $600)\\n- Gaseosas, Aguas, Jugos naturales\\n\\n¿Te interesa algo en particular?'
    ],
    
    order: [
        '🛒 ¡Perfecto! Para hacer tu pedido podés:\\n\\n1️⃣ Decime qué querés y te armo el pedido\\n2️⃣ Llamarnos al teléfono\\n3️⃣ Seguir chateando por acá\\n\\n¿Qué preferís?'
    ],
    
    price: [
        '💰 **PRECIOS:**\\n\\n🍔 Hamburguesas: desde $1800\\n🍕 Pizzas: desde $2500\\n🥟 Empanadas (docena): $2000\\n🍗 Milanesas: desde $2200\\n🥤 Bebidas: desde $600\\n\\n¿Querés saber el precio de algo específico?'
    ],
    
    delivery: [
        '🚚 **DELIVERY:**\\n\\n📍 Zona centro: GRATIS\\n📍 Otras zonas: $500\\n⏱️ Tiempo: 30-45 minutos\\n\\n💳 **Formas de pago:**\\n- Efectivo\\n- Transferencia\\n- MercadoPago\\n\\n¿En qué zona estás?'
    ],
    
    hours: [
        '🕕 **HORARIOS:**\\n\\nLunes a Domingo\\n11:00 a 23:00\\n\\n¡Estamos abiertos ahora! 😊'
    ],
    
    thanks: [
        '¡De nada! 😊 ¿Necesitás algo más?',
        '¡Un placer ayudarte! 🍔 ¿Algo más?',
        '¡Gracias a vos! ¿Te ayudo con algo más?'
    ],
    
    general: [
        '🤔 No estoy seguro de entender. ¿Podrías ser más específico?\\n\\nPodés preguntarme sobre:\\n• Menú\\n• Precios\\n• Delivery\\n• Horarios\\n• Hacer un pedido',
        '😅 Disculpá, no entendí bien. ¿Querés ver el menú o hacer un pedido?',
        '🍔 ¡Hola! ¿Te puedo ayudar con nuestro menú, precios o hacer un pedido?'
    ]
};

// Función principal para obtener respuesta predeterminada
export function getDefaultResponse(userMessage) {
    const intent = detectUserIntent(userMessage);
    const responses = DEFAULT_RESPONSES[intent] || DEFAULT_RESPONSES.general;
    
    // Seleccionar respuesta aleatoria
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return randomResponse;
}

// Obtener botones del menú principal
export function getMenuButtons() {
    return [
        { text: '🛒 Ver productos', action: 'products' },
        { text: '🚚 Estado del pedido', action: 'order_status' },
        { text: '💬 Hablar con soporte', action: 'support' }
    ];
}

// Obtener estado del pedido
export function getOrderStatus(orderCode) {
    return `📦 **Estado del pedido #${orderCode}:**\\n\\n✅ Pedido confirmado\\n🍳 En preparación\\n⏱️ Tiempo estimado: 25 minutos\\n\\n¡Te avisamos cuando esté en camino! 🚚`;
}

// Respuestas específicas para productos
export function getProductResponse(productType) {
    const productResponses = {
        hamburguesas: {
            text: '🍔 **NUESTRAS HAMBURGUESAS:**\\n\\n• **Clásica** - $1800\\n  Carne, lechuga, tomate\\n\\n• **Completa** - $2200\\n  Carne, lechuga, tomate, queso, huevo\\n\\n• **Doble carne** - $2800\\n  Doble carne, queso, lechuga, tomate\\n\\n• **Vegetariana** - $2000\\n  Medallón de verduras, lechuga, tomate\\n\\n¿Cuál preferís?'
        },
        
        pizzas: {
            text: '🍕 **NUESTRAS PIZZAS:**\\n\\n• **Muzzarella** - $2500\\n  Salsa, muzzarella\\n\\n• **Napolitana** - $2800\\n  Salsa, muzzarella, tomate, ajo\\n\\n• **Fugazzeta** - $3000\\n  Muzzarella, cebolla, oregano\\n\\n• **Especial** - $3500\\n  Salsa, muzzarella, jamón, morrones\\n\\n¿Cuál te gusta?'
        },
        
        empanadas: {
            text: '🥟 **NUESTRAS EMPANADAS:**\\n\\n**Docena: $2000**\\n\\n• **Carne** - Carne cortada a cuchillo, cebolla, huevo\\n• **Pollo** - Pollo desmenuzado, verdeo\\n• **Jamón y queso** - Jamón cocido, queso\\n• **Verdura** - Acelga, cebolla, queso\\n\\n¿Cuántas docenas querés?'
        },
        
        milanesas: {
            text: '🍗 **NUESTRAS MILANESAS:**\\n\\n• **Simple** - $2200\\n  Milanesa de carne con papas fritas\\n\\n• **Napolitana** - $2800\\n  Milanesa con salsa, jamón y queso\\n\\n• **Completa** - $3200\\n  Milanesa napolitana con huevo frito\\n\\n¿Cuál preferís?'
        }
    };
    
    return productResponses[productType] || getDefaultResponse('menu');
}

// Mensajes de confirmación de pedido
export function getOrderConfirmation(orderDetails) {
    return `✅ **PEDIDO CONFIRMADO**\\n\\n📋 **Detalle:**\\n${orderDetails.items.map(item => `• ${item.name} x${item.quantity} - $${item.price}`).join('\\n')}\\n\\n💰 **Total: $${orderDetails.total}**\\n🚚 **Delivery: $${orderDetails.delivery}**\\n\\n⏱️ **Tiempo estimado:** 30-45 minutos\\n📍 **Dirección:** ${orderDetails.address}\\n\\n¡Gracias por tu pedido! Te avisamos cuando esté en camino 🚚`;
}

// Mensajes de error
export function getErrorMessage(errorType = 'general') {
    const errorMessages = {
        general: '❌ Ups, algo salió mal. Intentá de nuevo o contactá con soporte.',
        order_not_found: '❌ No encontré ese pedido. Verificá el código e intentá de nuevo.',
        invalid_code: '❌ El código ingresado no es válido. Debe ser de 4 dígitos.',
        system_error: '❌ Error del sistema. Estamos trabajando para solucionarlo.',
        invalid_order: '❌ No pude entender tu pedido. Por favor, envíalo con el formato:\\n\\nPedido:\\n- 2 Milanesa con papas\\n- 1 Coca 500ml\\nTotal: $9.400'
    };
    
    return errorMessages[errorType] || errorMessages.general;
}

// Mensaje de soporte
export function getSupportMessage() {
    return '💬 **CONTACTAR SOPORTE:**\\n\\nPodés contactarnos por:\\n\\n📞 **Teléfono:** +54 9 3487 30 2858\\n⏰ **Horario:** Lunes a Domingo 11:00-23:00\\n\\n¿En qué te podemos ayudar?';
}

// Mensajes de estado de pedido
export function getOrderStatusMessages() {
    return {
        confirmado: '✅ Tu pedido ha sido confirmado y está en cola de preparación.',
        preparando: '🍳 Tu pedido está siendo preparado en la cocina.',
        listo: '🔔 ¡Tu pedido está listo! Preparando para el envío.',
        en_camino: '🚴‍♂️ ¡Tu pedido está en camino! El repartidor llegará pronto.',
        entregado: '🏁 Pedido entregado correctamente. ¡Gracias por elegirnos! ❤️'
    };
}
