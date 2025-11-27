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

  const fetchStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const response = await fetch(`${API_BASE}/whatsapp/${storeId}/status`, {
        headers: authHeaders
      });
      if (!response.ok) throw new Error('No se pudo obtener el estado');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      handleApiError(error);
    }
  }, [storeId, token]);

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
  }, [storeId, token]);

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
  }, [storeId, token]);

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

  const handleConnect = () =>
    runAction(
      async () => {
        await fetch(`${API_BASE}/whatsapp/${storeId}/connect`, {
          method: 'POST',
          headers: authHeaders
        });
      },
      'Sesión iniciada. Escaneá el nuevo QR.'
    );

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
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">Estado de WhatsApp</p>
              <p className={`text-2xl font-bold ${statusColor}`}>
                {status?.status === 'connected' && 'Conectado'}
                {status?.status === 'disconnected' && 'Desconectado'}
                {status?.status === 'pending_qr' && 'QR pendiente'}
                {status?.status === 'connecting' && 'Conectando'}
                {!status?.status && 'Desconocido'}
              </p>
              {status?.phoneNumber && (
                <p className="text-sm text-gray-500 mt-1">Número vinculado: {status.phoneNumber}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <button
                onClick={handleConnect}
                className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 font-semibold hover:bg-green-200 transition"
                disabled={loading}
              >
                Generar QR
              </button>
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition"
                disabled={loading}
              >
                Desconectar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <button
              onClick={handleReloadConfig}
              className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold"
              disabled={loading}
            >
              <i className="ri-refresh-line mr-1"></i>
              Recargar config
            </button>
            <button
              onClick={handleRestart}
              className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold"
              disabled={loading}
            >
              <i className="ri-loop-left-line mr-1"></i>
              Reiniciar bot
            </button>
            <button
              onClick={() => handleToggle(!(isBotEnabled ?? true))}
              className={`px-3 py-2 rounded-xl border font-semibold ${
                isBotEnabled ? 'border-red-200 text-red-600' : 'border-green-200 text-green-600'
              }`}
              disabled={loading}
            >
              {isBotEnabled ? (
                <>
                  <i className="ri-stop-circle-line mr-1"></i> Desactivar bot
                </>
              ) : (
                <>
                  <i className="ri-play-circle-line mr-1"></i> Activar bot
                </>
              )}
            </button>
            <button
              onClick={handleSendTest}
              className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 font-semibold"
              disabled={loading}
            >
              <i className="ri-message-2-line mr-1"></i>
              Enviar mensaje test
            </button>
          </div>

          {(actionMessage || actionError) && (
            <div
              className={`mt-4 text-sm font-semibold px-3 py-2 rounded-xl ${
                actionError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'
              }`}
            >
              {actionError || actionMessage}
            </div>
          )}
        </div>

        <div className="w-full lg:w-72 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-2">Métricas (últimas sesiones)</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Mensajes procesados:</span>
              <span className="font-semibold">{metrics?.messagesProcessed ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Mensajes bloqueados:</span>
              <span className="font-semibold">{metrics?.messagesBlocked ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Errores:</span>
              <span className="font-semibold">{metrics?.errors ?? '—'}</span>
            </div>
            <div className="text-xs text-gray-500 mt-4">
              <p>Último mensaje: {metrics?.lastMessageAt ? new Date(metrics.lastMessageAt).toLocaleString() : '—'}</p>
              <p>Último error: {metrics?.lastErrorAt ? new Date(metrics.lastErrorAt).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Enviar mensaje manual</h3>
          <button
            onClick={fetchAll}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            disabled={loading}
          >
            <i className="ri-refresh-line mr-1"></i>
            Actualizar
          </button>
        </div>

        <form onSubmit={handleSendCustomMessage} className="grid gap-3 md:grid-cols-3">
          <input
            type="text"
            value={customMessageTarget}
            onChange={(e) => setCustomMessageTarget(e.target.value)}
            placeholder="Número de teléfono (ej: 54911...)"
            className="px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
          />
          <input
            type="text"
            value={customMessageBody}
            onChange={(e) => setCustomMessageBody(e.target.value)}
            placeholder="Mensaje a enviar"
            className="px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none md:col-span-2"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold py-2 px-4 rounded-xl shadow hover:shadow-lg transition md:col-span-3"
            disabled={loading}
          >
            <i className="ri-send-plane-fill mr-1"></i>
            Enviar mensaje
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Actividad reciente</h3>
          <span className="text-sm text-gray-500">{logs.length} eventos</span>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {logs.length === 0 && <p className="text-sm text-gray-500">Sin eventos registrados.</p>}
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="border border-gray-100 rounded-xl p-3 text-sm">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{new Date(log.timestamp).toLocaleString()}</span>
                <span className="uppercase font-semibold">{log.level}</span>
              </div>
              <p className="text-gray-800 mt-1">{log.message}</p>
              {log.meta && Object.keys(log.meta).length > 0 && (
                <pre className="mt-2 text-xs bg-gray-50 rounded-lg p-2 text-gray-600 overflow-x-auto">
                  {JSON.stringify(log.meta, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

