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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Obtener transferencias pendientes que tengan más de 30 minutos
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    
    const { data: pendingTransfers, error: fetchError } = await supabaseClient
      .from('pending_transfers')
      .select('*')
      .eq('estado', 'pendiente')
      .lt('fecha', thirtyMinutesAgo)

    if (fetchError) {
      console.error('Error fetching transfers:', fetchError)
      throw fetchError
    }

    let approvedCount = 0
    let notifiedCount = 0

    // Procesar cada transferencia pendiente
    for (const transfer of pendingTransfers || []) {
      try {
        // Auto-aprobar la transferencia
        const { error: updateError } = await supabaseClient
          .from('pending_transfers')
          .update({ 
            estado: 'aprobado', 
            fecha_actualizacion: new Date().toISOString() 
          })
          .eq('id', transfer.id)

        if (updateError) {
          console.error('Error updating transfer:', updateError)
          continue
        }

        // Actualizar el pedido correspondiente
        const { error: orderError } = await supabaseClient
          .from('orders')
          .update({ 
            status: 'confirmed',
            payment_method: 'transferencia',
            payment_status: 'paid'
          })
          .eq('id', transfer.pedido_id)

        if (orderError) {
          console.error('Error updating order:', orderError)
        }

        approvedCount++

        // Enviar notificación al cliente vía WhatsApp (simulado)
        try {
          const whatsappMessage = {
            to: transfer.cliente_telefono,
            message: `✅ **TRANSFERENCIA APROBADA**\n\n📋 Código: ${transfer.pedido_id}\n💰 Total: $${transfer.monto.toLocaleString()}\n👤 Titular: ${transfer.titular_nombre}\n\n🍳 **Tu pedido está en preparación**\n⏰ Tiempo estimado: 15-30 minutos\n\n¡Gracias por tu compra! 🍔`,
            timestamp: new Date().toISOString()
          }

          // Guardar mensaje para que el bot lo procese
          const { error: messageError } = await supabaseClient
            .from('whatsapp_messages')
            .insert({
              phone_number: transfer.cliente_telefono,
              message: whatsappMessage.message,
              direction: 'outgoing',
              status: 'pending',
              created_at: new Date().toISOString()
            })

          if (!messageError) {
            notifiedCount++
          }

        } catch (notifyError) {
          console.error('Error sending notification:', notifyError)
        }

      } catch (transferError) {
        console.error('Error processing transfer:', transfer.id, transferError)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Procesadas ${approvedCount} transferencias, ${notifiedCount} notificaciones enviadas`,
        approved: approvedCount,
        notified: notifiedCount
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in auto-approve-transfers:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})