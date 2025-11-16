
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import Button from '../../../components/base/Button';
import LoadingSpinner from '../../../components/base/LoadingSpinner';

interface BotMessage {
  id: number;
  message_key: string;
  message_text: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const defaultMessages = [
  {
    message_key: 'welcome',
    message_text: `👋 ¡Hola! Bienvenido a El Buen Menú 🍔
¿Qué querés hacer hoy?

1️⃣ Ver menú
2️⃣ Consultar pedido  
3️⃣ Ver horarios

Escribí el número o palabra clave.`,
    description: 'Mensaje de bienvenida inicial'
  },
  {
    message_key: 'menu',
    message_text: `📋 Acá tenés nuestro menú completo 👇

🌐 https://elbuenmenu.store/menu

¡Elegí tus productos favoritos y hacé tu pedido! 🍔`,
    description: 'Respuesta cuando el cliente pide ver el menú'
  },
  {
    message_key: 'hours',
    message_text: `🕐 NUESTROS HORARIOS:

📅 Lunes a Domingo
🌅 11:00 - 23:00 hs

¡Estamos abiertos ahora! 😊
¿Querés hacer un pedido? 🍔`,
    description: 'Información de horarios de atención'
  },
  {
    message_key: 'order_confirm',
    message_text: `🧾 ¿Confirmás este pedido?

✅ Sí
❌ No

Escribí "sí" o "no"`,
    description: 'Confirmación de pedido del cliente'
  },
  {
    message_key: 'payment_options',
    message_text: `💳 Elegí un método de pago:

1️⃣ Transferencia (Alias/CVU)
2️⃣ Mercado Pago  
3️⃣ Efectivo

Escribí el número de tu opción.`,
    description: 'Opciones de métodos de pago'
  },
  {
    message_key: 'transfer_data',
    message_text: `💵 Datos para transferencia:

🏦 Alias: ELBUENMENU.MP
💰 CVU: 0000003100037891234456

📸 Enviá el comprobante de pago acá mismo.`,
    description: 'Datos bancarios para transferencia'
  },
  {
    message_key: 'mercadopago',
    message_text: `💳 Pagá con Mercado Pago:

🔗 https://mpago.la/elbuenmenu

Una vez realizado el pago, enviá el comprobante.`,
    description: 'Link de Mercado Pago'
  },
  {
    message_key: 'cash',
    message_text: `💵 Perfecto, el pago se realiza al recibir el pedido.

🧾 Tu pedido está confirmado.`,
    description: 'Confirmación de pago en efectivo'
  },
  {
    message_key: 'order_received',
    message_text: `🔄 Pedido recibido, estamos preparándolo 👨‍🍳

Vas a recibir una actualización cuando esté listo.`,
    description: 'Confirmación de pedido recibido'
  },
  {
    message_key: 'order_preparing',
    message_text: `👨‍🍳 Tu pedido se está preparando

⏰ Tiempo estimado: 20-30 minutos`,
    description: 'Notificación de pedido en preparación'
  },
  {
    message_key: 'order_ready',
    message_text: `✅ ¡Tu pedido está listo!

🛵 El repartidor está saliendo hacia tu dirección.`,
    description: 'Notificación de pedido listo'
  },
  {
    message_key: 'order_delivery',
    message_text: `🛵 ¡Tu pedido está en camino!

📍 Llegará en aproximadamente 15-20 minutos
📱 Mantené el teléfono cerca`,
    description: 'Notificación de pedido en camino'
  },
  {
    message_key: 'order_delivered',
    message_text: `🏁 ¡Pedido entregado!

✅ Gracias por elegirnos 
⭐ ¿Cómo estuvo todo?`,
    description: 'Confirmación de pedido entregado'
  },
  {
    message_key: 'location',
    message_text: `📍 Estamos ubicados en:

Av. San Martín 123
📞 348-720-7406

🚚 Hacemos delivery en toda la zona`,
    description: 'Información de ubicación del local'
  },
  {
    message_key: 'delivery_info',
    message_text: `🚚 DELIVERY DISPONIBLE

📍 Cobertura: Toda la ciudad
💰 Costo: $500
⏰ Tiempo: 30-45 minutos

¿Querés hacer un pedido?`,
    description: 'Información sobre el servicio de delivery'
  },
  {
    message_key: 'not_understood',
    message_text: `🤔 No entendí tu mensaje.

¿Querés que te ayude con algo?

1️⃣ Ver menú
2️⃣ Consultar pedido
3️⃣ Ver horarios

Escribí el número de la opción.`,
    description: 'Mensaje cuando no se entiende la consulta del cliente'
  }
];

export default function BotMessagesManager() {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('bot_messages')
        .select('*')
        .order('message_key');

      if (error) throw error;

      if (!data || data.length === 0) {
        // Si no hay mensajes, crear los por defecto
        await initializeDefaultMessages();
      } else {
        setMessages(data);
      }
    } catch (error) {
      console.error('Error al cargar mensajes:', error);
      addToast('Error al cargar mensajes del bot', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_messages')
        .insert(defaultMessages)
        .select();

      if (error) throw error;

      setMessages(data || []);
      addToast('Mensajes inicializados correctamente', 'success');
    } catch (error) {
      console.error('Error al inicializar mensajes:', error);
      addToast('Error al inicializar mensajes', 'error');
    }
  };

  const startEdit = (message: BotMessage) => {
    setEditingId(message.id);
    setEditText(message.message_text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveMessage = async (messageId: number) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('bot_messages')
        .update({ 
          message_text: editText,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) throw error;

      // Actualizar estado local
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, message_text: editText, updated_at: new Date().toISOString() }
          : msg
      ));

      // Notificar al bot para recargar mensajes
      await notifyBotReload();

      setEditingId(null);
      setEditText('');
      addToast('Mensaje actualizado correctamente', 'success');
    } catch (error) {
      console.error('Error al guardar mensaje:', error);
      addToast('Error al guardar mensaje', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveAllMessages = async () => {
    try {
      setSaving(true);

      // Actualizar todos los mensajes modificados
      const updates = messages.map(msg => ({
        id: msg.id,
        message_text: msg.message_text,
        updated_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('bot_messages')
          .update(update)
          .eq('id', update.id);

        if (error) throw error;
      }

      // Notificar al bot para recargar mensajes
      await notifyBotReload();

      addToast('Todos los mensajes guardados correctamente', 'success');
    } catch (error) {
      console.error('Error al guardar todos los mensajes:', error);
      addToast('Error al guardar mensajes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!confirm('¿Estás seguro de que querés restaurar todos los mensajes a los valores por defecto?')) {
      return;
    }

    try {
      setSaving(true);

      // Eliminar todos los mensajes existentes
      const { error: deleteError } = await supabase
        .from('bot_messages')
        .delete()
        .neq('id', 0); // Eliminar todos

      if (deleteError) throw deleteError;

      // Insertar mensajes por defecto
      const { data, error: insertError } = await supabase
        .from('bot_messages')
        .insert(defaultMessages)
        .select();

      if (insertError) throw insertError;

      setMessages(data || []);
      
      // Notificar al bot para recargar mensajes
      await notifyBotReload();

      addToast('Mensajes restaurados a valores por defecto', 'success');
    } catch (error) {
      console.error('Error al restaurar mensajes:', error);
      addToast('Error al restaurar mensajes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const notifyBotReload = async () => {
    try {
      await fetch('https://elbuenmenu.site/reload-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.log('Bot no disponible para recarga automática');
    }
  };

  const getMessageTitle = (key: string) => {
    const titles: { [key: string]: string } = {
      welcome: '👋 Mensaje de Bienvenida',
      menu: '📋 Ver Menú',
      hours: '🕐 Horarios',
      order_confirm: '🧾 Confirmar Pedido',
      payment_options: '💳 Opciones de Pago',
      transfer_data: '💵 Datos de Transferencia',
      mercadopago: '💳 Mercado Pago',
      cash: '💵 Pago en Efectivo',
      order_received: '🔄 Pedido Recibido',
      order_preparing: '👨‍🍳 En Preparación',
      order_ready: '✅ Pedido Listo',
      order_delivery: '🛵 En Camino',
      order_delivered: '🏁 Entregado',
      location: '📍 Ubicación',
      delivery_info: '🚚 Info Delivery',
      not_understood: '🤔 No Entendido'
    };
    return titles[key] || key;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mensajes del Bot</h2>
          <p className="text-gray-600 mt-1">
            Configurá todos los mensajes automáticos del bot de WhatsApp
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={resetToDefaults}
            variant="outline"
            disabled={saving}
            className="text-orange-600 border-orange-600 hover:bg-orange-50"
          >
            🔄 Restaurar
          </Button>
          <Button
            onClick={saveAllMessages}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? '💾 Guardando...' : '💾 Guardar Todo'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {messages.map((message) => (
          <div key={message.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getMessageTitle(message.message_key)}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {message.description}
                </p>
              </div>
              <div className="flex gap-2">
                {editingId === message.id ? (
                  <>
                    <Button
                      onClick={() => saveMessage(message.id)}
                      disabled={saving}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      💾 Guardar
                    </Button>
                    <Button
                      onClick={cancelEdit}
                      variant="outline"
                      size="sm"
                      disabled={saving}
                    >
                      ❌ Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => startEdit(message)}
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    ✏️ Editar
                  </Button>
                )}
              </div>
            </div>

            {editingId === message.id ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Escribí el mensaje del bot..."
              />
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {message.message_text}
                </pre>
              </div>
            )}

            <div className="mt-3 text-xs text-gray-400">
              Última actualización: {new Date(message.updated_at).toLocaleString('es-AR')}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">💡 Consejos para editar mensajes:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Usá emojis para hacer los mensajes más atractivos</li>
          <li>• Mantené un tono amigable y profesional</li>
          <li>• Incluí instrucciones claras para el cliente</li>
          <li>• Los cambios se aplican automáticamente al bot</li>
          <li>• Podés usar saltos de línea para organizar mejor el texto</li>
        </ul>
      </div>
    </div>
  );
}
