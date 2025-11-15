import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { orderId, newStatus } = await req.json()

    if (!orderId || !newStatus) {
      return new Response(
        JSON.stringify({ error: 'orderId y newStatus son requeridos' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Buscar el pedido
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido no encontrado' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Actualizar estado del pedido
    const { error: updateError } = await supabaseClient
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (updateError) {
      throw updateError
    }

    // Obtener mensaje del bot según el estado
    const { data: botMessage } = await supabaseClient
      .from('bot_messages')
      .select('message_text')
      .eq('message_key', `order_${newStatus}`)
      .single()

    let message = ''
    
    switch (newStatus) {
      case 'preparing':
        message = botMessage?.message_text || '👨‍🍳 Tu pedido se está preparando'
        break
      case 'ready':
        message = botMessage?.message_text || '✅ ¡Tu pedido está listo!'
        break
      case 'out_for_delivery':
        message = botMessage?.message_text || '🛵 ¡Tu pedido está en camino!'
        break
      case 'delivered':
        message = botMessage?.message_text || '🏁 ¡Pedido entregado!'
        break
      default:
        message = `📋 Tu pedido ${order.order_code} cambió de estado`
    }

    // Enviar notificación al bot de WhatsApp
    if (message && order.customer_phone) {
      try {
        const webhookResponse = await fetch('http://localhost:3001/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: order.customer_phone,
            message: `🆔 Pedido ${order.order_code}\n\n${message}`
          })
        })

        if (!webhookResponse.ok) {
          console.error('Error al enviar webhook:', await webhookResponse.text())
        }
      } catch (webhookError) {
        console.error('Error al conectar con bot de WhatsApp:', webhookError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Estado actualizado y notificación enviada',
        order: { ...order, status: newStatus }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})