import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    if (req.method === 'POST') {
      const body = await req.json()
      console.log('Webhook de Mercado Pago recibido:', body)

      // Verificar que es una notificación de pago
      if (body.type === 'payment') {
        const paymentId = body.data.id
        
        // Obtener detalles del pago desde MP
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`
          }
        })

        if (mpResponse.ok) {
          const paymentData = await mpResponse.json()
          console.log('Datos del pago:', paymentData)

          // Si el pago fue aprobado
          if (paymentData.status === 'approved') {
            const externalReference = paymentData.external_reference
            
            // Buscar el pedido en la base de datos
            const { data: orders, error: fetchError } = await supabaseClient
              .from('orders')
              .select('*')
              .eq('id', externalReference)
              .single()

            if (fetchError) {
              console.error('Error al buscar pedido:', fetchError)
              return new Response(JSON.stringify({ error: 'Pedido no encontrado' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              })
            }

            // Actualizar estado del pedido a pagado
            const { error: updateError } = await supabaseClient
              .from('orders')
              .update({ 
                status: 'paid',
                payment_method: 'mercado_pago',
                payment_id: paymentId,
                updated_at: new Date().toISOString()
              })
              .eq('id', externalReference)

            if (updateError) {
              console.error('Error al actualizar pedido:', updateError)
              return new Response(JSON.stringify({ error: 'Error al actualizar pedido' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              })
            }

            // Guardar mensaje de WhatsApp para enviar confirmación
            const { error: messageError } = await supabaseClient
              .from('whatsapp_messages')
              .insert({
                phone: orders.customer_phone,
                message: '✅ **Pago acreditado correctamente**\nTu pedido ya está confirmado y comenzamos la preparación 🍔🔥',
                type: 'outgoing',
                status: 'pending',
                created_at: new Date().toISOString()
              })

            if (messageError) {
              console.error('Error al guardar mensaje:', messageError)
            }

            console.log(`Pedido ${externalReference} marcado como pagado`)
            
            return new Response(JSON.stringify({ 
              success: true, 
              message: 'Pago procesado correctamente' 
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        }
      }

      return new Response(JSON.stringify({ message: 'Webhook recibido' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error en webhook:', error)
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})