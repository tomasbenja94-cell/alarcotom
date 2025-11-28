import { useEffect, useState, useCallback } from 'react';

interface WhatsAppStatus {
  status: 'connected' | 'disconnected' | 'pending_qr' | 'connecting';
  phoneNumber?: string;
  name?: string;
}

interface WhatsAppMetrics {
  messagesProcessed: number;
  messagesBlocked: number;
  errors: number;
  lastMessageAt: string | null;
  lastErrorAt: string | null;
}

interface WhatsAppLogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface WhatsAppControlPanelProps {
  storeId?: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api').replace(/\/$/, '');

export default function WhatsAppControlPanel({ storeId }: WhatsAppControlPanelProps) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [customMessageTarget, setCustomMessageTarget] = useState('');
  const [customMessageBody, setCustomMessageBody] = useState('');
  const [isBotEnabled, setIsBotEnabled] = useState<boolean | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const authHeaders = token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    : { 'Content-Type': 'application/json' };

  const handleApiError = (error: unknown) => {
    console.error('[WhatsApp Control] Error:', error);
    setActionError(error instanceof Error ? error.message : 'Error desconocido');
  };

  const fetchQR = useCallback(async (): Promise<string | null> => {
    if (!storeId) return null;
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/qr`, {
        headers: authHeaders
      });
      if (response.ok) {
        const data = await response.json();
        // El endpoint puede devolver { qr: null } o { qr: "data:image..." }
        if (data.qr && data.qr !== null && data.qr !== 'null') {
          // Aceptar cualquier formato de QR (data URL, URL, o string base64)
          setQrCode(data.qr);
          return data.qr;
        } else {
          setQrCode(null);
          return null;
        }
      } else {
        setQrCode(null);
        return null;
      }
    } catch (error) {
      console.error('Error obteniendo QR:', error);
      setQrCode(null);
      return null;
    }
  }, [storeId, authHeaders]);

  const fetchStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/status`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error('No se pudo obtener el estado');
      const data = await response.json();
      setStatus(data);
      
      // Si el estado es pending_qr, obtener el QR
      if (data.status === 'pending_qr') {
        await fetchQR();
      } else {
        setQrCode(null);
      }
    } catch (error) {
      handleApiError(error);
    }
  }, [storeId, authHeaders, fetchQR]);

  const fetchMetrics = useCallback(async () => {
    if (!storeId) return;
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/metrics`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error('No se pudieron obtener las métricas');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      handleApiError(error);
    }
  }, [storeId, authHeaders]);

  const fetchLogs = useCallback(async () => {
    if (!storeId) return;
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/logs?limit=50`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error('No se pudieron obtener los logs');
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      handleApiError(error);
    }
  }, [storeId, authHeaders]);

  const fetchAll = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setActionError(null);
    await Promise.all([fetchStatus(), fetchMetrics(), fetchLogs()]);
    setLoading(false);
  }, [storeId, fetchStatus, fetchMetrics, fetchLogs]);

  useEffect(() => {
    setActionMessage(null);
    setActionError(null);
    setIsBotEnabled(null);
    if (storeId) {
      fetchAll();
      fetchToggleState();
    }
  }, [storeId]);

  // Polling para actualizar el QR automáticamente cuando está pendiente
  useEffect(() => {
    if (!storeId || status?.status !== 'pending_qr') {
      setQrCode(null);
      return;
    }
    
    // Obtener QR inmediatamente
    fetchQR();
    
    // Luego hacer polling cada 3 segundos
    const interval = setInterval(async () => {
      await fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [storeId, status?.status, fetchStatus, fetchQR]);

  const fetchToggleState = async () => {
    if (!storeId) return;
    try {
      const response = await fetch(`${API_BASE}/store-settings/${storeId}`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error('No se pudo obtener el estado del bot');
      const data = await response.json();
      setIsBotEnabled(Boolean(data?.whatsappBotEnabled));
    } catch (error) {
      handleApiError(error);
    }
  };

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      await action();
      setActionMessage(successMessage);
      await fetchAll();
      await fetchToggleState();
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/connect`, {
        method: 'POST',
        headers: authHeaders
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error iniciando conexión');
      }
      
      setActionMessage('Sesión iniciada. Generando QR...');
      
      // Esperar y obtener el QR con múltiples intentos
      let attempts = 0;
      const maxAttempts = 10; // Aumentar intentos
      const checkQR = async () => {
        attempts++;
        
        // Actualizar estado primero
        await fetchStatus();
        
        // Obtener QR y verificar si se recibió
        const qr = await fetchQR();
        
        if (qr) {
          setActionMessage('QR generado. Escaneá el código.');
          await fetchMetrics();
          setLoading(false);
        } else if (attempts >= maxAttempts) {
          setActionError('No se pudo generar el QR después de varios intentos. Verifica que el servicio esté funcionando.');
          await fetchMetrics();
          setLoading(false);
        } else {
          // Reintentar después de 2 segundos
          setTimeout(checkQR, 2000);
        }
      };
      
      // Empezar a verificar después de 3 segundos (dar tiempo a que se genere)
      setTimeout(checkQR, 3000);
    } catch (error) {
      handleApiError(error);
      setLoading(false);
    }
  };

  const handleDisconnect = () =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/disconnect`, {
          method: 'POST',
          headers: authHeaders
        });
      },
      'Sesión desconectada correctamente.'
    );

  const handleReloadConfig = () =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/reload-config`, {
          method: 'POST',
          headers: authHeaders
        });
      },
      'Configuración recargada.'
    );

  const handleRestart = () =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/restart`, {
          method: 'POST',
          headers: authHeaders
        });
      },
      'Bot reiniciado correctamente.'
    );

  const handleToggle = (enabled: boolean) =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/toggle`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ enabled })
        });
      },
      enabled ? 'Bot activado.' : 'Bot desactivado.'
    );

  const handleSendTest = () =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/test`, {
          method: 'POST',
          headers: authHeaders
        });
      },
      'Mensaje de prueba enviado.'
    );

  const handleSendCustomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customMessageTarget || !customMessageBody) {
      setActionError('Debes completar el número y el mensaje.');
      return;
    }
    await runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/send`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            to: customMessageTarget,
            message: customMessageBody
          })
        });
      },
      'Mensaje enviado correctamente.'
    );
    setCustomMessageTarget('');
    setCustomMessageBody('');
  };

  if (!storeId) {
    return (
      <div className="p-6">
        <div className="bg-white border border-orange-200 rounded-2xl p-6 text-center shadow-md">
          <p className="text-lg text-gray-600">Selecciona una tienda para gestionar el bot de WhatsApp.</p>
        </div>
      </div>
    );
  }

  const statusColor = {
    connected: 'text-green-600',
    disconnected: 'text-red-600',
    pending_qr: 'text-yellow-600',
    connecting: 'text-blue-600'
  }[status?.status || 'disconnected'];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex-1 border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Estado</p>
              <p className={`text-sm font-semibold ${statusColor}`}>
                {status?.status === 'connected' && 'Conectado'}
                {status?.status === 'disconnected' && 'Desconectado'}
                {status?.status === 'pending_qr' && 'QR pendiente'}
                {status?.status === 'connecting' && 'Conectando'}
                {!status?.status && 'Desconocido'}
              </p>
              {status?.phoneNumber && (
                <p className="text-[10px] text-gray-500 mt-0.5">{status.phoneNumber}</p>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleConnect}
                className="px-2 py-1 text-[10px] rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition"
                disabled={loading}
              >
                QR
              </button>
              <button
                onClick={handleDisconnect}
                className="px-2 py-1 text-[10px] rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition"
                disabled={loading}
              >
                Desconectar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleReloadConfig}
              className="px-2 py-1.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50 font-medium"
              disabled={loading}
            >
              <i className="ri-refresh-line text-xs mr-1"></i>
              Recargar
            </button>
            <button
              onClick={handleRestart}
              className="px-2 py-1.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50 font-medium"
              disabled={loading}
            >
              <i className="ri-loop-left-line text-xs mr-1"></i>
              Reiniciar
            </button>
            <button
              onClick={() => handleToggle(!(isBotEnabled ?? true))}
              className={`px-2 py-1.5 text-[10px] rounded border font-medium ${
                isBotEnabled ? 'border-gray-200 text-gray-700' : 'border-gray-200 text-gray-700'
              }`}
              disabled={loading}
            >
              {isBotEnabled ? (
                <>
                  <i className="ri-stop-circle-line text-xs mr-1"></i> Desactivar
                </>
              ) : (
                <>
                  <i className="ri-play-circle-line text-xs mr-1"></i> Activar
                </>
              )}
            </button>
            <button
              onClick={handleSendTest}
              className="px-2 py-1.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50 font-medium"
              disabled={loading}
            >
              <i className="ri-message-2-line text-xs mr-1"></i>
              Test
            </button>
          </div>

          {(actionMessage || actionError) && (
            <div
              className={`mt-3 text-[10px] font-medium px-2 py-1.5 rounded border ${
                actionError ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {actionError || actionMessage}
            </div>
          )}

          {/* QR Code */}
          {status?.status === 'pending_qr' && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-[10px] font-medium text-gray-800 mb-2 text-center">Escanea el código QR</p>
              {qrCode ? (
                <>
                  <div className="flex justify-center">
                    <img 
                      src={qrCode} 
                      alt="QR Code" 
                      className="w-48 h-48 rounded border border-gray-300 bg-white p-2"
                      onError={() => {
                        console.error('Error cargando imagen QR');
                        setQrCode(null);
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-gray-600 text-center">
                    WhatsApp → Dispositivos vinculados → Vincular dispositivo
                  </p>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-black mx-auto mb-2"></div>
                  <p className="text-[10px] text-gray-500 mb-1">Generando QR...</p>
                  {actionError && actionError.includes('QR') && (
                    <p className="text-[10px] text-red-600 mt-2">{actionError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:w-48 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-2">Métricas</p>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Procesados:</span>
              <span className="font-medium">{metrics?.messagesProcessed ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Bloqueados:</span>
              <span className="font-medium">{metrics?.messagesBlocked ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Errores:</span>
              <span className="font-medium">{metrics?.errors ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-800">Enviar mensaje</h3>
          <button
            onClick={fetchAll}
            className="px-2 py-1 text-[10px] rounded border border-gray-200 hover:bg-gray-50"
            disabled={loading}
          >
            <i className="ri-refresh-line text-xs mr-1"></i>
            Actualizar
          </button>
        </div>

        <form onSubmit={handleSendCustomMessage} className="grid gap-2 md:grid-cols-3">
          <input
            type="text"
            value={customMessageTarget}
            onChange={(e) => setCustomMessageTarget(e.target.value)}
            placeholder="Número (ej: 54911...)"
            className="px-2 py-1.5 text-[10px] rounded border border-gray-200 focus:ring-1 focus:ring-black focus:border-black outline-none"
          />
          <input
            type="text"
            value={customMessageBody}
            onChange={(e) => setCustomMessageBody(e.target.value)}
            placeholder="Mensaje"
            className="px-2 py-1.5 text-[10px] rounded border border-gray-200 focus:ring-1 focus:ring-black focus:border-black outline-none md:col-span-2"
          />
          <button
            type="submit"
            className="bg-black text-white font-medium py-1.5 px-3 rounded border border-black hover:bg-gray-800 transition md:col-span-3 text-[10px]"
            disabled={loading}
          >
            <i className="ri-send-plane-fill text-xs mr-1"></i>
            Enviar mensaje
          </button>
        </form>
      </div>

      <div className="border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-800">Actividad</h3>
          <span className="text-[10px] text-gray-500">{logs.length} eventos</span>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.length === 0 && <p className="text-[10px] text-gray-500">Sin eventos.</p>}
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="border border-gray-100 rounded p-2 text-[10px]">
              <div className="flex justify-between text-[9px] text-gray-500">
                <span>{new Date(log.timestamp).toLocaleString()}</span>
                <span className="uppercase font-medium">{log.level}</span>
              </div>
              <p className="text-gray-800 mt-0.5">{log.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

