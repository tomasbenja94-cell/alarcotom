import { useState, useEffect, useCallback } from 'react';
import { transfersApi, ordersApi } from '../../../lib/api';

interface Transfer {
  id: string;
  order_id: string;
  order?: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    total: number;
  };
  amount: number;
  proof_image_url?: string;
  transfer_reference?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
  verified_at?: string;
}

interface TransfersPendingProps {
  storeId?: string | null;
}

export default function TransfersPending({ storeId }: TransfersPendingProps = {}) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(true);

  // Debug: Log cuando el componente se monta o storeId cambia
  useEffect(() => {
    console.log('[TransfersPending] Componente montado/actualizado. storeId:', storeId);
  }, [storeId]);

  // Cargar transferencias desde la API local
  const loadTransfers = useCallback(async () => {
    try {
      setLoadingTransfers(true);
      
      // Pasar storeId si está disponible (IMPORTANTE: cada tienda debe ver solo sus transferencias)
      if (!storeId) {
        console.warn('[TransfersPending] ⚠️ No hay storeId, no se pueden cargar transferencias');
        setTransfers([]);
        return;
      }
      
      console.log('[TransfersPending] Cargando transferencias para storeId:', storeId);
      console.log('[TransfersPending] Llamando a transfersApi.getPending con:', { storeId });
      const data = await transfersApi.getPending({ storeId });
      console.log('[TransfersPending] Transferencias recibidas:', data?.length || 0);
      
      // Transformar datos a formato esperado
      const transformed = data.map((transfer: any) => ({
        id: transfer.id,
        order_id: transfer.order_id,
        order: transfer.order,
        amount: transfer.amount,
        proof_image_url: transfer.proof_image_url,
        transfer_reference: transfer.transfer_reference,
        status: transfer.status,
        created_at: transfer.created_at,
        updated_at: transfer.updated_at,
        verified_at: transfer.verified_at
      }));

      setTransfers(transformed);
      
    } catch (error) {
      console.error('Error al cargar transferencias:', error);
      setTransfers([]);
    } finally {
      setLoadingTransfers(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      loadTransfers();
      
      // Recargar cada 30 segundos
      const interval = setInterval(loadTransfers, 30000);
      return () => clearInterval(interval);
    }
  }, [storeId, loadTransfers]);

  const handleApprove = async (transfer: Transfer) => {
    try {
      setIsLoading(true);
      
      // 1. Actualizar estado de transferencia a 'approved'
      await transfersApi.update(transfer.id, {
        status: 'approved',
        verified_at: new Date().toISOString()
      });

      // 2. Actualizar el pedido asociado a 'preparing' (está siendo preparado)
      if (transfer.order_id) {
        const order = await ordersApi.getById(transfer.order_id);
        
        console.log('🔍 [DEBUG TRANSFER] ============================================');
        console.log('🔍 [DEBUG TRANSFER] Pedido obtenido:', {
          id: order.id,
          order_number: order.order_number,
          customer_phone: order.customer_phone,
          customer_name: order.customer_name,
          status: order.status
        });
        console.log('🔍 [DEBUG TRANSFER] ============================================');
        
        await ordersApi.update(transfer.order_id, {
          payment_status: 'completed',
          status: 'pending' // Cambiar a 'pending' para que aparezca en PENDIENTES
        });
        
        // Validar y notificar al cliente
        const validatePhoneNumber = (phone: string): { isValid: boolean; reason?: string } => {
          if (!phone || phone.trim() === '') {
            return { isValid: false, reason: 'Número vacío' };
          }
          
          // Si es un JID @lid, aceptarlo directamente (el bot puede enviar a JIDs @lid)
          if (phone.includes('@lid')) {
            return { isValid: true };
          }
          
          // Si contiene @ pero no es @lid, podría ser un JID válido
          if (phone.includes('@')) {
            return { isValid: true };
          }
          
          // Limpiar el número
          const cleanPhone = phone.replace(/[^\d]/g, '');
          
          // Detectar IDs internos de WhatsApp (generalmente tienen más de 13 dígitos o son muy largos)
          // PERO si tiene formato @lid, ya lo aceptamos arriba
          if (cleanPhone.length > 13) {
            return { isValid: false, reason: 'ID interno de WhatsApp detectado' };
          }
          
          // Detectar números que parecen IDs internos (empiezan con 1 y tienen 15 dígitos, como 180375909310641)
          if (cleanPhone.length === 15 && cleanPhone.startsWith('1') && cleanPhone.match(/^1\d{14}$/)) {
            return { isValid: false, reason: 'ID interno de WhatsApp (Linked Device ID)' };
          }
          
          // Validar que tenga entre 10-13 dígitos (formato válido de teléfono)
          if (cleanPhone.length < 10 || cleanPhone.length > 13) {
            return { isValid: false, reason: 'Formato de número inválido' };
          }
          
          return { isValid: true };
        };
        
        const phoneValidation = validatePhoneNumber(order.customer_phone || '');
        
        if (!phoneValidation.isValid) {
          const reason = phoneValidation.reason || 'Número inválido';
          const warningMsg = `⚠️ No se puede notificar al cliente del pedido ${order.order_number}.\n\nRazón: ${reason}\n\nEl número guardado es: "${order.customer_phone || '(vacío)'}"\n\n💡 Solución:\n1. El cliente debe enviar un mensaje desde WhatsApp con el código de pedido ${order.order_number}\n2. Esto actualizará el número de teléfono con el número real del cliente\n3. Luego podrás enviar notificaciones normalmente`;
          console.warn(`⚠️ [NOTIFICACIÓN WEB] ${warningMsg}`);
          alert(warningMsg);
        } else if (order.customer_phone && order.customer_phone.trim() !== '') {
          try {
            const notificationData = {
              customerPhone: order.customer_phone,
              orderNumber: order.order_number,
              message: '👨‍🍳 ¡Excelente! Tu pedido está siendo preparado con mucho cuidado.\n\n⏰ Te avisaremos en cuanto esté en camino hacia tu dirección.\n\n¡Gracias por tu paciencia! ❤️'
            };
            
            // Usar el endpoint del backend en lugar de llamar directamente al bot
            const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
            const notifyUrl = `${API_URL}/orders/${order.id}/notify`;
            
            console.log('📤 [NOTIFICACIÓN WEB] ============================================');
            console.log('📤 [NOTIFICACIÓN WEB] Enviando notificación al cliente');
            console.log('📤 [NOTIFICACIÓN WEB] URL:', notifyUrl);
            console.log('📤 [NOTIFICACIÓN WEB] Datos:', JSON.stringify(notificationData, null, 2));
            console.log('📤 [NOTIFICACIÓN WEB] ============================================');
            
            const token = localStorage.getItem('adminToken');
            const response = await fetch(notifyUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
              },
              body: JSON.stringify(notificationData)
            });
            
            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            
            console.log('📥 [NOTIFICACIÓN WEB] Respuesta recibida:', {
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              contentType: contentType,
              isJson: isJson,
              headers: Object.fromEntries(response.headers.entries())
            });
            
            // Obtener el texto de la respuesta primero para poder verificar si es HTML
            const responseText = await response.text();
            
            // Verificar si la respuesta es HTML (error común cuando la URL está mal)
            if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
              console.error('❌ [NOTIFICACIÓN WEB] El servidor devolvió HTML en lugar de JSON. Esto indica que la URL está incorrecta o el endpoint no existe.');
              console.error('❌ [NOTIFICACIÓN WEB] URL intentada:', notifyUrl);
              console.error('❌ [NOTIFICACIÓN WEB] Respuesta HTML (primeros 500 caracteres):', responseText.substring(0, 500));
              
              alert(`❌ Error: El servidor devolvió una página HTML en lugar de una respuesta JSON.\n\nEsto significa que la URL del endpoint está incorrecta o el endpoint no existe.\n\nURL intentada: ${notifyUrl}\n\n💡 Verifica:\n1. Que el backend esté corriendo\n2. Que la variable VITE_API_URL esté configurada correctamente\n3. Que el endpoint /api/orders/:id/notify exista en el backend`);
              return;
            }
            
            if (!response.ok) {
              let errorData: any;
              try {
                errorData = JSON.parse(responseText);
              } catch {
                errorData = { error: responseText.substring(0, 200) };
              }
              console.error(`❌ [NOTIFICACIÓN WEB] Error en webhook (${response.status}):`, errorData);
              
              // Mensaje más amigable según el tipo de error
              let errorMessage = 'Error al enviar notificación';
              if (errorData.error && errorData.error.includes('Número de teléfono inválido')) {
                errorMessage = `⚠️ El número de teléfono guardado no es válido.\n\nNúmero: ${order.customer_phone}\n\n💡 El cliente debe enviar un mensaje desde WhatsApp con el código ${order.order_number} para actualizar su número.`;
              } else {
                errorMessage = `⚠️ Error al enviar notificación: ${errorData.error || errorData.message || 'Error desconocido'}`;
              }
              
              alert(errorMessage);
            } else {
              let result: any;
              try {
                result = JSON.parse(responseText);
              } catch (parseError) {
                console.error('❌ [NOTIFICACIÓN WEB] Error al parsear respuesta JSON:', parseError);
                console.error('❌ [NOTIFICACIÓN WEB] Respuesta recibida:', responseText.substring(0, 500));
                alert(`❌ Error: La respuesta del servidor no es JSON válido.\n\nRespuesta: ${responseText.substring(0, 200)}`);
                return;
              }
              
              console.log(`✅ [NOTIFICACIÓN WEB] Notificación enviada exitosamente:`, result);
              alert(`✅ Notificación enviada exitosamente a ${order.customer_phone}`);
            }
          } catch (error: any) {
            console.error('❌ [NOTIFICACIÓN WEB] Error notifying customer:', error);
            console.error('❌ [NOTIFICACIÓN WEB] Stack:', error.stack);
            alert(`❌ Error al enviar notificación: ${error.message}\n\nRevisa la consola (F12) para más detalles.`);
          }
        } else {
          const warningMsg = `⚠️ No se puede notificar: El pedido ${order.order_number} no tiene número de teléfono guardado.\n\nEl cliente debe enviar un mensaje desde WhatsApp primero para que se guarde su número.`;
          console.warn(`⚠️ [NOTIFICACIÓN WEB] ${warningMsg}`);
          alert(warningMsg);
        }
      }

      // 3. Recargar transferencias
      await loadTransfers();
      
      alert('✅ Transferencia aprobada exitosamente. El cliente ha sido notificado.');
      
    } catch (error) {
      console.error('Error al aprobar transferencia:', error);
      alert('❌ Error al aprobar transferencia');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (transfer: Transfer) => {
    try {
      setIsLoading(true);
      
      // 1. Actualizar estado de transferencia a 'rejected'
      await transfersApi.update(transfer.id, {
        status: 'rejected',
        verified_at: new Date().toISOString()
      });

      // 2. Recargar transferencias
      await loadTransfers();
      
      alert('❌ Transferencia rechazada');
      
    } catch (error) {
      console.error('Error al rechazar transferencia:', error);
      alert('❌ Error al rechazar transferencia');
    } finally {
      setIsLoading(false);
    }
  };

  const pendingTransfers = transfers.filter(t => t.status === 'pending');
  const processedTransfers = transfers.filter(t => t.status !== 'pending');

  if (loadingTransfers) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#111111]">TRANSFERENCIAS</h2>
          <div className="text-xs text-[#C7C7C7] font-medium">
            Cargando...
          </div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando transferencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Más Pequeño */}
      <div className="bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400 rounded-2xl shadow-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-gray-800 flex items-center space-x-2">
              <i className="ri-bank-card-line text-green-500 text-3xl"></i>
              <span>TRANSFERENCIAS</span>
            </h2>
            <p className="text-sm text-gray-600 font-semibold">Aproba los pagos por transferencia</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">
              {pendingTransfers.length} PENDIENTES
            </div>
            <button
              onClick={loadTransfers}
              className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-105 flex items-center space-x-2"
            >
              <i className="ri-refresh-line text-xl"></i>
              <span>ACTUALIZAR</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transferencias Pendientes - Mejorado */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-[#111111] uppercase tracking-wider flex items-center space-x-2">
          <i className="ri-file-list-line text-green-500"></i>
          <span>Transferencias Pendientes</span>
        </h3>

        {pendingTransfers.length === 0 ? (
          <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg p-12 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✅</span>
            </div>
            <h3 className="text-xl font-bold text-[#111111] mb-2">Todo al día</h3>
            <p className="text-sm text-[#666] font-medium">No hay transferencias pendientes de revisión</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingTransfers.map((transfer) => (
              <div key={transfer.id} className="bg-white border-4 border-gray-300 rounded-3xl shadow-2xl p-8 hover:border-green-400 hover:shadow-2xl transition-all transform hover:scale-[1.02]">
                <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center space-x-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-3xl flex items-center justify-center shadow-2xl">
                      <i className="ri-money-dollar-circle-line text-white text-5xl"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-3xl mb-2">
                        Pedido {transfer.order?.order_number || `#${transfer.order_id.slice(0, 8)}`}
                      </h3>
                      <p className="text-lg text-gray-600 font-semibold">
                        {new Date(transfer.created_at).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-5xl font-bold text-gray-800 mb-3">${transfer.amount.toLocaleString()}</p>
                    <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white px-6 py-3 rounded-2xl text-xl font-bold shadow-xl">
                      PENDIENTE
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                          <div className="bg-gray-50 p-6 rounded-2xl border-4 border-gray-200">
                    <p className="text-xl text-gray-600 font-bold mb-2 flex items-center space-x-2">
                      <i className="ri-phone-line text-blue-500"></i>
                      <span>CLIENTE</span>
                    </p>
                    <p className="text-2xl font-bold text-gray-800">{transfer.order?.customer_phone || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 p-6 rounded-2xl border-4 border-gray-200">
                    <p className="text-xl text-gray-600 font-bold mb-2 flex items-center space-x-2">
                      <i className="ri-user-line text-orange-500"></i>
                      <span>NOMBRE</span>
                    </p>
                    <p className="text-2xl font-bold text-gray-800">{transfer.order?.customer_name || 'N/A'}</p>
                  </div>
                </div>

                {/* Comprobante - GRANDE Y CLARO */}
                {transfer.proof_image_url ? (
                  <div className="mb-8 p-6 bg-gray-50 border-4 border-gray-300 rounded-3xl">
                    <div className="mb-4">
                      <h4 className="text-2xl font-bold text-gray-800 mb-4 flex items-center space-x-2">
                        <i className="ri-image-line text-green-500"></i>
                        <span>COMPROBANTE DE PAGO:</span>
                      </h4>
                        <div className="bg-white p-3 rounded-sm border border-[#C7C7C7]">
                          {(() => {
                            // Construir URL correcta para la imagen
                            // SIEMPRE usar api.elbuenmenu.site/api/proofs/... (este es el dominio correcto)
                            let imageUrl = transfer.proof_image_url || '';
                            
                            // Función para construir la URL base del API
                            // Usar api.elbuenmenu.site para las imágenes de comprobantes
                            const buildApiBaseUrl = () => {
                              // Usar api.elbuenmenu.site como dominio base para comprobantes
                              let baseUrl = 'https://api.elbuenmenu.site';
                              
                              // Si estamos en desarrollo, usar localhost
                              if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                                baseUrl = window.location.origin;
                              }
                              
                              // Asegurar que termine en /api
                              if (!baseUrl.endsWith('/api')) {
                                baseUrl = `${baseUrl}/api`;
                              }
                              
                              return baseUrl;
                            };
                            
                            const apiBaseUrl = buildApiBaseUrl();
                            
                            // Normalizar cualquier URL a api.elbuenmenu.site/api/proofs/filename
                            const normalizeToApiProof = (url: string) => {
                              if (!url) return url;
                              
                              // Extraer el nombre del archivo de cualquier URL
                              let filename = '';
                              
                              // Si es una URL completa, extraer el filename
                              if (url.includes('/')) {
                                const parts = url.split('/');
                                filename = parts.pop() || parts[parts.length - 1] || url;
                              } else {
                                filename = url;
                              }
                              
                              // Limpiar el filename (remover query params si los hay)
                              filename = filename.split('?')[0];
                              
                              // Construir URL final: siempre api.elbuenmenu.site/api/proofs/filename
                              return `${apiBaseUrl}/proofs/${filename}`;
                            };
                            
                            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                              imageUrl = normalizeToApiProof(imageUrl);
                            } else if (imageUrl) {
                              // Si es una ruta relativa, extraer el filename y construir la URL
                              const filename = imageUrl.includes('/') ? imageUrl.split('/').pop() ?? imageUrl : imageUrl;
                              imageUrl = `${apiBaseUrl}/proofs/${filename}`;
                            }
                            
                            if (!imageUrl) {
                              return <p className="text-xs text-[#C7C7C7]">⚠️ URL de imagen no disponible</p>;
                            }
                            
                            return (
                              <img 
                                src={imageUrl}
                                alt="Comprobante de transferencia"
                                className="max-w-full h-auto rounded-sm cursor-pointer hover:opacity-90 transition-opacity max-h-96 border border-[#C7C7C7]"
                                onClick={() => window.open(imageUrl, '_blank')}
                                onError={(e) => {
                                  // Silenciar el error en consola, solo mostrar mensaje visual
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent && !parent.querySelector('.error-message')) {
                                    const errorMsg = document.createElement('p');
                                    errorMsg.className = 'text-xs text-[#C7C7C7] error-message';
                                    errorMsg.innerHTML = `⚠️ Imagen no disponible<br/><span class="text-[10px] opacity-75">${imageUrl}</span>`;
                                    parent.appendChild(errorMsg);
                                  }
                                }}
                                onLoad={() => {
                                  // Solo loggear en desarrollo
                                  if (import.meta.env.DEV) {
                                    console.log('✅ Imagen cargada correctamente:', imageUrl);
                                  }
                                }}
                              />
                            );
                          })()}
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 p-4 bg-white border border-[#C7C7C7] rounded-sm">
                    <div className="flex items-start space-x-3">
                      <i className="ri-alert-line text-[#C7C7C7] mt-1"></i>
                      <div className="flex-1">
                        <h4 className="text-xs font-medium text-[#111111] mb-2 uppercase tracking-wider">Comprobante de Transferencia:</h4>
                        <p className="text-xs text-[#C7C7C7]">⚠️ No se recibió imagen del comprobante</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Botones de acción - SÚPER GRANDES Y CLAROS */}
                <div className="flex flex-col space-y-4 pt-6 border-t-4 border-gray-200">
                  <button
                    onClick={() => handleApprove(transfer)}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-5 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-2xl flex items-center justify-center space-x-4"
                  >
                    <span className="text-4xl">✅</span>
                    <span>APROBAR PAGO</span>
                  </button>
                  <button
                    onClick={() => handleReject(transfer)}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-5 px-6 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-2xl flex items-center justify-center space-x-4"
                  >
                    <span className="text-4xl">❌</span>
                    <span>RECHAZAR</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial - Premium Style */}
      {processedTransfers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[#111111] uppercase tracking-wider">Historial Reciente</h3>
          <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
            <div className="space-y-3">
              {processedTransfers.slice(0, 10).map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between py-3 border-b border-[#C7C7C7] last:border-0">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                      transfer.status === 'approved' ? 'bg-[#111111] border-[#FFC300]' : 'bg-white border-[#C7C7C7]'
                    }`}>
                      <i className={`text-sm ${
                        transfer.status === 'approved' ? 'ri-check-line text-white' : 'ri-close-line text-[#111111]'
                      }`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-sm text-[#111111]">
                        {transfer.order?.order_number || `#${transfer.order_id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-[#C7C7C7]">{transfer.order?.customer_name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-[#111111]">${transfer.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-1 rounded-sm border ${
                      transfer.status === 'approved' 
                        ? 'bg-white border-[#C7C7C7] text-[#111111]' 
                        : 'bg-white border-[#C7C7C7] text-[#111111]'
                    }`}>
                      {transfer.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
