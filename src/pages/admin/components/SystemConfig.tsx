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

  // Inicializar logs y estado (solo una vez al montar, sin polling automático)
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await loadSystemStatus();
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

    // NO hacer polling automático para evitar timeouts del proxy
    // El usuario puede actualizar manualmente con el botón de refresh

    return () => {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleDisconnectWhatsApp}
            disabled={actionLoading === 'disconnect'}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'disconnect' ? '⏳ Desconectando...' : '📱 Desconectar WhatsApp'}
          </button>
          
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
        </div>
        
        <div className="mt-4">
          <button
            onClick={() => handleRestartService('all')}
            disabled={actionLoading === 'restart-all'}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {actionLoading === 'restart-all' ? '⏳ Reiniciando todo...' : '🔄 Reiniciar Todo (Backend + WhatsApp)'}
          </button>
        </div>
      </div>

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

