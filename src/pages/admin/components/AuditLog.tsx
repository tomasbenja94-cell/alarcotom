import { useState, useEffect } from 'react';

interface AuditEntry {
  id: string;
  action: string;
  user: string;
  entity_type: string;
  entity_id: string;
  changes?: Record<string, { old: any; new: any }>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    action: string;
    entity: string;
    date: string;
  }>({ action: 'all', entity: 'all', date: 'all' });

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const params = new URLSearchParams({ storeId: storeId || '' });
      if (filter.action !== 'all') params.append('action', filter.action);
      if (filter.entity !== 'all') params.append('entity', filter.entity);
      if (filter.date !== 'all') params.append('date', filter.date);
      
      const response = await fetch(`${API_URL}/audit/logs?${params.toString()}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data || []);
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('create')) return 'bg-green-100 text-green-700';
    if (action.includes('update')) return 'bg-blue-100 text-blue-700';
    if (action.includes('delete')) return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Registro de Auditoría</h2>
      </div>

      {/* Filtros */}
      <div className="grid md:grid-cols-3 gap-3">
        <select
          value={filter.action}
          onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">Todas las acciones</option>
          <option value="create">Crear</option>
          <option value="update">Actualizar</option>
          <option value="delete">Eliminar</option>
        </select>

        <select
          value={filter.entity}
          onChange={(e) => setFilter({ ...filter, entity: e.target.value })}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">Todas las entidades</option>
          <option value="order">Pedidos</option>
          <option value="product">Productos</option>
          <option value="customer">Clientes</option>
        </select>

        <select
          value={filter.date}
          onChange={(e) => setFilter({ ...filter, date: e.target.value })}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">Todas las fechas</option>
          <option value="today">Hoy</option>
          <option value="week">Última semana</option>
          <option value="month">Último mes</option>
        </select>
      </div>

      {/* Lista de Logs */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-file-list-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay registros de auditoría</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getActionColor(log.action)}`}>
                      {log.action.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500">{log.entity_type}</span>
                    <span className="text-xs text-slate-400">{log.id.slice(0, 8)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mb-1">
                    {log.user} - {log.action}
                  </p>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-2 p-2 bg-slate-50 rounded text-xs">
                      {Object.entries(log.changes).map(([key, change]) => (
                        <div key={key} className="mb-1">
                          <span className="font-medium">{key}:</span>{' '}
                          <span className="text-red-600 line-through">{String(change.old)}</span>{' '}
                          →{' '}
                          <span className="text-green-600">{String(change.new)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    {new Date(log.created_at).toLocaleString('es-AR')}
                    {log.ip_address && ` • IP: ${log.ip_address}`}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

