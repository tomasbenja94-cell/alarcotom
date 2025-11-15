import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { type, customer_phone, customer_name, order_id, amount } = await req.json()

    // URL del webhook del bot de WhatsApp
    const botWebhookUrl = 'http://localhost:3001/webhook'

    let message = ''
    
    if (type === 'transfer_approved') {
      message = `✅ *TRANSFERENCIA APROBADA*

¡Excelente! Tu transferencia ha sido verificada y aprobada.

📋 *Detalles del pedido:*
🆔 Código: #${order_id}
💰 Monto: $${amount}
👤 Cliente: ${customer_name}

🍽️ *Tu pedido está siendo preparado*
⏱️ Tiempo estimado: 30-45 minutos

📱 Te avisaremos cuando esté listo para entregar.

¡Gracias por elegirnos! 🙏`
    } else if (type === 'transfer_rejected') {
      message = `❌ *TRANSFERENCIA RECHAZADA*

Lo sentimos, tu transferencia no pudo ser verificada.

💰 Monto: $${amount}
👤 Cliente: ${customer_name}

📞 *Por favor contactanos:*
• WhatsApp: +54 9 348 720 7406
• Para resolver el inconveniente

Disculpas por las molestias. 🙏`
    } else if (type === 'order_ready') {
      message = `🍽️ *PEDIDO LISTO PARA ENTREGAR*

¡Tu pedido está listo!

📋 *Detalles:*
🆔 Código: #${order_id}
👤 Cliente: ${customer_name}

🚗 *El repartidor está en camino*
📱 Te contactará cuando esté cerca

🔢 *Código para entregar: ${Math.random().toString(36).substr(2, 6).toUpperCase()}*

¡Que lo disfrutes! 😋`
    }

    // Enviar mensaje al bot de WhatsApp
    const response = await fetch(botWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: customer_phone,
        message: message
      })
    })

    if (!response.ok) {
      throw new Error(`Error del bot: ${response.status}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error en webhook:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})