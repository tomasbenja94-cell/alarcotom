import OpenAI from 'openai';
import pino from 'pino';

const logger = pino({ level: 'info' });

// Configurar OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
});

// Contexto del restaurante para la IA
const RESTAURANT_CONTEXT = `
Eres un asistente virtual de "El Buen Menú", un restaurante de delivery.

INFORMACIÓN DEL RESTAURANTE:
- Nombre: El Buen Menú
- Tipo: Restaurante de delivery
- Especialidad: Comida casera, pizzas, hamburguesas, empanadas
- Horarios: Lunes a Domingo de 18:00 a 00:00
- Delivery: Gratis en zona centro, $500 en otras zonas
- Tiempo de entrega: 30-45 minutos
- Formas de pago: Efectivo, transferencia, MercadoPago

MENÚ PRINCIPAL:
🍕 Pizzas (desde $2500)
- Muzzarella, Napolitana, Fugazzeta, Especial

🍔 Hamburguesas (desde $1800)
- Clásica, Completa, Doble carne, Vegetariana

🥟 Empanadas (docena $2000)
- Carne, Pollo, Jamón y queso, Verdura

🍗 Pollo (desde $2200)
- Al horno, Milanesas, Supremas

🥤 Bebidas (desde $600)
- Gaseosas, Aguas, Jugos naturales

INSTRUCCIONES:
- Sé amable, profesional y útil
- Responde en español argentino
- Si preguntan por el menú, menciona las opciones principales
- Si quieren hacer un pedido, pídeles que llamen o usen WhatsApp
- Si preguntan por horarios, delivery o precios, usa la información de arriba
- Mantén las respuestas concisas pero informativas
- Usa emojis para hacer las respuestas más amigables
`;

// Función principal para manejar respuestas de IA
export async function handleAIResponse(userMessage, conversationHistory = []) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            logger.warn('⚠️ OpenAI API Key no configurada');
            return null;
        }

        // Preparar mensajes para la IA
        const messages = [
            { role: 'system', content: RESTAURANT_CONTEXT },
            ...conversationHistory.slice(-10), // Últimos 10 mensajes para contexto
        ];

        logger.info('🤖 Consultando IA...', { userMessage });

        // Llamar a OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages,
            max_tokens: 300,
            temperature: 0.7,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
        });

        const aiResponse = completion.choices[0]?.message?.content;

        if (aiResponse) {
            logger.info('✅ Respuesta de IA generada', { 
                response: aiResponse.substring(0, 100) + '...' 
            });
            
            return {
                text: aiResponse,
                source: 'ai'
            };
        }

        return null;

    } catch (error) {
        logger.error('❌ Error en IA:', error.message);
        
        // Si hay error de cuota o API, devolver null para usar respuesta predeterminada
        if (error.message.includes('quota') || error.message.includes('rate_limit')) {
            logger.warn('⚠️ Límite de API alcanzado, usando respuestas predeterminadas');
        }
        
        return null;
    }
}

// Función para generar respuesta contextual sin IA
export function generateContextualResponse(userMessage, conversationHistory = []) {
    const message = userMessage.toLowerCase();
    
    // Analizar contexto de la conversación
    const recentMessages = conversationHistory.slice(-5).map(m => m.content.toLowerCase()).join(' ');
    
    // Respuestas contextuales basadas en palabras clave
    if (message.includes('precio') || message.includes('cuanto') || message.includes('cuesta')) {
        if (recentMessages.includes('pizza')) {
            return '🍕 Nuestras pizzas van desde $2500. ¿Te interesa alguna en particular?';
        }
        if (recentMessages.includes('hamburguesa')) {
            return '🍔 Las hamburguesas van desde $1800. ¿Querés saber de alguna específica?';
        }
        if (recentMessages.includes('empanada')) {
            return '🥟 La docena de empanadas está $2000. Tenemos de carne, pollo, jamón y queso, y verdura.';
        }
        return '💰 Te paso algunos precios:\\n🍕 Pizzas desde $2500\\n🍔 Hamburguesas desde $1800\\n🥟 Empanadas docena $2000';
    }
    
    if (message.includes('delivery') || message.includes('envio') || message.includes('envío')) {
        return '🚚 El delivery es gratis en zona centro y $500 en otras zonas. Tardamos entre 30-45 minutos. ¿En qué zona estás?';
    }
    
    if (message.includes('horario') || message.includes('abierto') || message.includes('cerrado')) {
        return '🕕 Estamos abiertos de lunes a domingo de 18:00 a 00:00. ¡Te esperamos!';
    }
    
    return null;
}

// Función para detectar intención del usuario
export function detectUserIntent(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('menu') || msg.includes('carta') || msg.includes('comida')) {
        return 'menu';
    }
    
    if (msg.includes('pedido') || msg.includes('pedir') || msg.includes('quiero')) {
        return 'order';
    }
    
    if (msg.includes('precio') || msg.includes('cuanto') || msg.includes('cuesta')) {
        return 'price';
    }
    
    if (msg.includes('delivery') || msg.includes('envio')) {
        return 'delivery';
    }
    
    if (msg.includes('horario') || msg.includes('abierto')) {
        return 'hours';
    }
    
    if (msg.includes('hola') || msg.includes('buenas') || msg.includes('buenos')) {
        return 'greeting';
    }
    
    if (msg.includes('gracias') || msg.includes('perfecto') || msg.includes('ok')) {
        return 'thanks';
    }
    
    return 'general';
}