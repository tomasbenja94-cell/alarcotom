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

    // Obtener todas las configuraciones de Supabase
    const { data: settings, error } = await supabaseClient
      .from('settings')
      .select('*')

    if (error) {
      throw error
    }

    // Convertir array de settings a objeto
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {})

    // Crear la configuración para el bot
    const botConfig = {
      alias: settingsMap.bank_alias || "ELBUENMENU.CVU",
      cvu: settingsMap.bank_cvu || "0000007900001234567890",
      mercadoPagoLink: settingsMap.mercado_pago_link || "https://mpago.la/elbuenmenu",
      horarios: `Lunes a Viernes: ${settingsMap.weekday_open || '11:00'} - ${settingsMap.weekday_close || '23:00'}\nSábados y Domingos: ${settingsMap.weekend_open || '12:00'} - ${settingsMap.weekend_close || '24:00'}`,
      menuUrl: settingsMap.menu_url || "https://buenmenuapp.online/menu",
      mensajes: {
        bienvenida: settingsMap.welcome_message || "¡Hola! 👋 Bienvenido a El Buen Menú 🍔\n1️⃣ Ver menú\n2️⃣ Consultar pedido\n3️⃣ Horarios",
        menu: `🛒 Podés ver nuestro menú completo aquí: ${settingsMap.menu_url || "https://buenmenuapp.online/menu"}`,
        consultar_pedido: "Por favor, enviame tu número de pedido o nombre para consultar su estado 📦",
        pago_opciones: settingsMap.order_confirmation_message || "Recibimos tu pedido 🧾\nPor favor confirmá el método de pago:\n💳 Transferencia / Mercado Pago / Efectivo",
        pago_confirmado: settingsMap.payment_confirmed_message || "💰 Transferencia confirmada. Tu pedido está en preparación 🍳",
        pedido_preparacion: "🍳 Tu pedido está en preparación.",
        pedido_en_camino: settingsMap.delivery_message || "🚴‍♂️ ¡Tu pedido está en camino!",
        pedido_entregado: settingsMap.delivery_completed_message || "🏁 Pedido entregado. ¡Gracias por elegirnos! ❤️",
        fuera_horario: settingsMap.out_of_hours_message || "🕐 Estamos cerrados en este momento.\nHorarios de atención:\nLunes a Viernes: 11:00 - 23:00\nSábados y Domingos: 12:00 - 24:00",
        no_entiendo: "No entendí tu mensaje. Por favor elegí una opción:\n1️⃣ Ver menú\n2️⃣ Consultar pedido\n3️⃣ Horarios"
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        config: botConfig,
        message: 'Configuración sincronizada correctamente'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})