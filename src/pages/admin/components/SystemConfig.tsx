import { useState, useEffect, useRef } from 'react';
import { adminApi, systemApi } from '../../../lib/api';

interface ServiceStatus {
  status: string;
  uptime: number;
  restarts: number;
  memory: number;
  cpu: number;
}

interface SystemStatus {
  services: {
    backend: ServiceStatus;
    'whatsapp-bot': ServiceStatus;
  };
}

export default function SystemConfig() {
  const [backendLogs, setBackendLogs] = useState<string>('');
  const [whatsappLogs, setWhatsappLogs] = useState<string>('');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [activeLogTab, setActiveLogTab] = useState<'backend' | 'whatsapp'>('backend');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrAvailable, setQrAvailable] = useState(false);
  
  const backendLogsRef = useRef<HTMLDivElement>(null);
  const whatsappLogsRef = useRef<HTMLDivElement>(null);
  const logsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar logs usando systemApi
  const loadLogs = async (service: 'backend' | 'whatsapp-bot', lines: number = 100) => {
    try {
      const data = await systemApi.getLogs(service, lines);
      return data.logs || '';
    } catch (error: any) {
      console.error(`Error cargando logs de ${service}:`, error);
      return `❌ Error al cargar logs: ${error instanceof Error ? error.message : 'Error desconocido'}`;
    }
  };

  // Cargar estado del sistema usando systemApi (mejor manejo de errores y CORS)
  const loadSystemStatus = async () => {
    try {
      const data = await systemApi.getStatus();
      setSystemStatus(data);
      setError(null); // Limpiar error si la petición fue exitosa
    } catch (error: any) {
      console.error('Error cargando estado:', error);
      setError(`Error al cargar estado: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Cargar QR code del bot a través del backend
  const loadQRCode = async () => {
    try {
      const data = await systemApi.getQRCode();
      if (data.available && data.qr) {
        setQrCode(data.qr);
        setQrAvailable(true);
      } else {
        setQrCode(null);
        setQrAvailable(false);
      }
    } catch (error) {
      // Silenciar errores si el bot no está disponible
      setQrCode(null);
      setQrAvailable(false);
    }
  };

  // Inicializar logs y estado (solo una vez al montar, sin polling automático)
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await loadSystemStatus();
        await loadQRCode();
        const backend = await loadLogs('backend');
        const whatsapp = await loadLogs('whatsapp-bot');
        setBackendLogs(backend);
        setWhatsappLogs(whatsapp);
      } catch (error) {
        console.error('Error inicializando datos del sistema:', error);
      } finally {
        setLoading(false);
      }
    };
    
    init();

    // Polling solo para el QR (cada 5 segundos) si el bot no está conectado
    const qrInterval = setInterval(() => {
      if (systemStatus?.services['whatsapp-bot']?.status !== 'online') {
        loadQRCode();
      }
    }, 5000);

    return () => {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      clearInterval(qrInterval);
    };
  }, [systemStatus]);

  // Auto-scroll en logs
  useEffect(() => {
    if (activeLogTab === 'backend' && backendLogsRef.current) {
      backendLogsRef.current.scrollTop = backendLogsRef.current.scrollHeight;
    }
    if (activeLogTab === 'whatsapp' && whatsappLogsRef.current) {
      whatsappLogsRef.current.scrollTop = whatsappLogsRef.current.scrollHeight;
    }
  }, [backendLogs, whatsappLogs, activeLogTab]);

  // Desconectar WhatsApp
  const handleDisconnectWhatsApp = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar WhatsApp? Esto borrará la sesión y mostrará un nuevo QR.')) {
      return;
    }

    setActionLoading('disconnect');
    setError(null);
    setSuccess(null);

    try {
      const data = await systemApi.disconnectWhatsApp();
      setSuccess(data.message || 'WhatsApp desconectado correctamente');
      
      // Recargar logs después de un momento
      setTimeout(async () => {
        const logs = await loadLogs('whatsapp-bot');
        setWhatsappLogs(logs);
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al desconectar WhatsApp');
    } finally {
      setActionLoading(null);
    }
  };

  // Reiniciar servicio
  const handleRestartService = async (service: 'backend' | 'whatsapp-bot' | 'all') => {
    const serviceName = service === 'all' ? 'todos los servicios' : service;
    if (!confirm(`¿Estás seguro de que deseas reiniciar ${serviceName}?`)) {
      return;
    }

    setActionLoading(`restart-${service}`);
    setError(null);
    setSuccess(null);

    try {
      const data = await systemApi.restartService(service);
      setSuccess(data.message || `Servicio ${serviceName} reiniciado correctamente`);
      
      // Recargar estado después de un momento
      setTimeout(loadSystemStatus, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al reiniciar servicio');
    } finally {
      setActionLoading(null);
    }
  };

  // Actualizar servicio desde GitHub
  const handleUpdateService = async (service: 'backend' | 'whatsapp-bot' | 'all') => {
    const serviceName = service === 'all' ? 'todos los servicios' : service;
    if (!confirm(`¿Estás seguro de que deseas actualizar ${serviceName} desde GitHub?\n\nEsto ejecutará:\n1. git pull\n2. npm install (si es necesario)\n3. Reinicio del servicio\n\nEsto puede tardar varios minutos.`)) {
      return;
    }

    setActionLoading(`update-${service}`);
    setError(null);
    setSuccess(null);

    try {
      const data = await systemApi.updateService(service);
      setSuccess(data.message || `Actualización de ${serviceName} iniciada. Revisa los logs para ver el progreso.`);
      
      // Recargar estado y logs después de un momento (la actualización puede tardar)
      setTimeout(async () => {
        await loadSystemStatus();
        const backend = await loadLogs('backend', 50);
        const whatsapp = await loadLogs('whatsapp-bot', 50);
        setBackendLogs(backend);
        setWhatsappLogs(whatsapp);
      }, 5000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al iniciar actualización');
    } finally {
      // No quitar el loading inmediatamente, la actualización puede tardar
      setTimeout(() => {
        setActionLoading(null);
      }, 10000);
    }
  };

  // Formatear tiempo de actividad
  const formatUptime = (ms: number) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Formatear memoria
  const formatMemory = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  // Obtener color de estado
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'stopped':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'errored':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Configuraciones del Sistema</h1>
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await loadSystemStatus();
              await loadQRCode();
              const backend = await loadLogs('backend');
              const whatsapp = await loadLogs('whatsapp-bot');
              setBackendLogs(backend);
              setWhatsappLogs(whatsapp);
              setSuccess('Datos actualizados correctamente');
              setTimeout(() => setSuccess(null), 3000);
            } catch (error) {
              setError('Error al actualizar datos');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          🔄 {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Mensajes de éxito/error */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          ❌ {error}
        </div>
      )}

      {/* Estado de servicios */}
      {systemStatus && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Estado de Servicios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Backend */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">Backend</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(systemStatus.services.backend.status)}`}>
                  {systemStatus.services.backend.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <div>⏱️ Uptime: {formatUptime(systemStatus.services.backend.uptime)}</div>
                <div>🔄 Reinicios: {systemStatus.services.backend.restarts}</div>
                <div>💾 Memoria: {formatMemory(systemStatus.services.backend.memory)}</div>
                <div>⚡ CPU: {systemStatus.services.backend.cpu.toFixed(1)}%</div>
              </div>
            </div>

            {/* WhatsApp Bot */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">WhatsApp Bot</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(systemStatus.services['whatsapp-bot'].status)}`}>
                  {systemStatus.services['whatsapp-bot'].status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <div>⏱️ Uptime: {formatUptime(systemStatus.services['whatsapp-bot'].uptime)}</div>
                <div>🔄 Reinicios: {systemStatus.services['whatsapp-bot'].restarts}</div>
                <div>💾 Memoria: {formatMemory(systemStatus.services['whatsapp-bot'].memory)}</div>
                <div>⚡ CPU: {systemStatus.services['whatsapp-bot'].cpu.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🎮 Controles del Sistema</h2>
        
        {/* Sección de Reinicio */}
        <div className="mb-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3">🔄 Reiniciar Servicios</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => handleRestartService('backend')}
              disabled={actionLoading === 'restart-backend'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'restart-backend' ? '⏳ Reiniciando...' : '🔄 Reiniciar Backend'}
            </button>
            
            <button
              onClick={() => handleRestartService('whatsapp-bot')}
              disabled={actionLoading === 'restart-whatsapp-bot'}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'restart-whatsapp-bot' ? '⏳ Reiniciando...' : '🔄 Reiniciar WhatsApp Bot'}
            </button>
            
            <button
              onClick={() => handleRestartService('all')}
              disabled={actionLoading === 'restart-all'}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'restart-all' ? '⏳ Reiniciando todo...' : '🔄 Reiniciar Todo'}
            </button>
          </div>
        </div>

        {/* Sección de Actualización */}
        <div className="mb-6 border-t pt-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3">⬇️ Actualizar Código desde GitHub</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => handleUpdateService('backend')}
              disabled={actionLoading === 'update-backend'}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'update-backend' ? '⏳ Actualizando...' : '⬇️ Actualizar Backend'}
            </button>
            
            <button
              onClick={() => handleUpdateService('whatsapp-bot')}
              disabled={actionLoading === 'update-whatsapp-bot'}
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'update-whatsapp-bot' ? '⏳ Actualizando...' : '⬇️ Actualizar Bot'}
            </button>
            
            <button
              onClick={() => handleUpdateService('all')}
              disabled={actionLoading === 'update-all'}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'update-all' ? '⏳ Actualizando todo...' : '⬇️ Actualizar Todo'}
            </button>
          </div>
        </div>

        {/* Sección de WhatsApp */}
        <div className="border-t pt-6">
          <h3 className="text-md font-semibold text-gray-700 mb-3">📱 WhatsApp</h3>
          <button
            onClick={handleDisconnectWhatsApp}
            disabled={actionLoading === 'disconnect'}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {actionLoading === 'disconnect' ? '⏳ Desconectando...' : '📱 Desconectar WhatsApp'}
          </button>
        </div>
      </div>

      {/* QR Code para WhatsApp */}
      {qrAvailable && qrCode && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📱 Código QR de WhatsApp</h2>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
            </div>
            <div className="text-center text-sm text-gray-600">
              <p className="font-semibold mb-2">📱 Instrucciones:</p>
              <ol className="list-decimal list-inside space-y-1 text-left max-w-md">
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Configuración → Dispositivos vinculados</li>
                <li>Toca "Vincular un dispositivo"</li>
                <li>Escanea el código QR de arriba</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📋 Logs del Sistema</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveLogTab('backend')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeLogTab === 'backend'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Backend
            </button>
            <button
              onClick={() => setActiveLogTab('whatsapp')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeLogTab === 'whatsapp'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>

        {/* Logs de Backend */}
        {activeLogTab === 'backend' && (
          <div
            ref={backendLogsRef}
            className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto"
            style={{ fontFamily: 'monospace' }}
          >
            {backendLogs || 'Cargando logs...'}
          </div>
        )}

        {/* Logs de WhatsApp */}
        {activeLogTab === 'whatsapp' && (
          <div
            ref={whatsappLogsRef}
            className="bg-black text-cyan-400 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto"
            style={{ fontFamily: 'monospace' }}
          >
            {whatsappLogs || 'Cargando logs...'}
          </div>
        )}
      </div>
    </div>
  );
}

