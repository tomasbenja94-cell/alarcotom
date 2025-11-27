import { useState, useEffect } from 'react';

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
  action_url?: string;
  action_label?: string;
}

export default function SmartAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'critical' | 'high'>('all');

  useEffect(() => {
    loadAlerts();
    
    // Verificar alertas cada 30 segundos
    const interval = setInterval(loadAlerts, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      // Detectar alertas automáticamente
      const newAlerts: Alert[] = [];
      
      // Verificar pedidos pendientes por mucho tiempo
      try {
        const ordersResponse = await fetch(`${API_URL}/orders?storeId=${storeId}&status=pending`, {
          headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
        });
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json() || [];
          const oldOrders = orders.filter((o: any) => {
            const orderDate = new Date(o.created_at);
            const minutesAgo = (Date.now() - orderDate.getTime()) / 1000 / 60;
            return minutesAgo > 30; // Más de 30 minutos
          });
          
          if (oldOrders.length > 0) {
            newAlerts.push({
              id: `alert_old_orders_${Date.now()}`,
              type: 'warning',
              title: 'Pedidos Pendientes por Mucho Tiempo',
              message: `${oldOrders.length} pedido(s) pendiente(s) hace más de 30 minutos`,
              priority: 'high',
              created_at: new Date().toISOString(),
              resolved: false,
              action_url: '/admin?tab=pedidos',
              action_label: 'Ver Pedidos',
            });
          }
        }
      } catch (error) {
        console.error('Error checking orders:', error);
      }
      
      // Verificar stock bajo
      try {
        const inventoryResponse = await fetch(`${API_URL}/inventory?storeId=${storeId}`, {
          headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
        });
        if (inventoryResponse.ok) {
          const items = await inventoryResponse.json() || [];
          const lowStock = items.filter((i: any) => 
            i.current_stock <= i.min_stock && i.current_stock > 0
          );
          const outOfStock = items.filter((i: any) => i.current_stock === 0);
          
          if (outOfStock.length > 0) {
            newAlerts.push({
              id: `alert_out_of_stock_${Date.now()}`,
              type: 'error',
              title: 'Productos Sin Stock',
              message: `${outOfStock.length} producto(s) sin stock`,
              priority: 'critical',
              created_at: new Date().toISOString(),
              resolved: false,
              action_url: '/admin?advancedTab=stock',
              action_label: 'Ver Inventario',
            });
          } else if (lowStock.length > 0) {
            newAlerts.push({
              id: `alert_low_stock_${Date.now()}`,
              type: 'warning',
              title: 'Stock Bajo',
              message: `${lowStock.length} producto(s) con stock bajo`,
              priority: 'medium',
              created_at: new Date().toISOString(),
              resolved: false,
              action_url: '/admin?advancedTab=inventory',
              action_label: 'Ver Inventario',
            });
          }
        }
      } catch (error) {
        console.error('Error checking inventory:', error);
      }
      
      // Cargar alertas guardadas
      const savedAlerts = localStorage.getItem('admin_alerts');
      const saved = savedAlerts ? JSON.parse(savedAlerts) : [];
      
      // Combinar y filtrar duplicados
      const allAlerts = [...newAlerts, ...saved].filter((alert, index, self) =>
        index === self.findIndex(a => a.id === alert.id)
      );
      
      setAlerts(allAlerts);
      localStorage.setItem('admin_alerts', JSON.stringify(allAlerts));
      
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveAlert = (id: string) => {
    setAlerts((prev) => {
      const updated = prev.map((a) =>
        a.id === id
          ? { ...a, resolved: true, resolved_at: new Date().toISOString() }
          : a
      );
      localStorage.setItem('admin_alerts', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteAlert = (id: string) => {
    setAlerts((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      localStorage.setItem('admin_alerts', JSON.stringify(updated));
      return updated;
    });
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'unresolved') return !alert.resolved;
    if (filter === 'critical') return alert.priority === 'critical' && !alert.resolved;
    if (filter === 'high') return (alert.priority === 'high' || alert.priority === 'critical') && !alert.resolved;
    return true;
  });

  const stats = {
    total: alerts.length,
    unresolved: alerts.filter(a => !a.resolved).length,
    critical: alerts.filter(a => a.priority === 'critical' && !a.resolved).length,
    high: alerts.filter(a => a.priority === 'high' && !a.resolved).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'from-red-500 to-red-600';
      case 'high': return 'from-orange-500 to-amber-500';
      case 'medium': return 'from-yellow-400 to-amber-400';
      default: return 'from-blue-500 to-indigo-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'error': return 'ri-error-warning-line';
      case 'warning': return 'ri-alert-line';
      case 'success': return 'ri-checkbox-circle-line';
      default: return 'ri-information-line';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Alertas Inteligentes</h2>
        <button
          onClick={loadAlerts}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <i className="ri-refresh-line mr-2"></i>
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-xs text-slate-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Sin Resolver</p>
          <p className="text-2xl font-bold text-blue-700">{stats.unresolved}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-600 mb-1">Críticas</p>
          <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <p className="text-xs text-orange-600 mb-1">Altas</p>
          <p className="text-2xl font-bold text-orange-700">{stats.high}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'Todas' },
          { id: 'unresolved', label: 'Sin Resolver' },
          { id: 'critical', label: 'Críticas' },
          { id: 'high', label: 'Altas' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === f.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de Alertas */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-notification-off-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay alertas activas</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border-2 ${
                alert.resolved
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : alert.priority === 'critical'
                  ? 'bg-red-50 border-red-300'
                  : alert.priority === 'high'
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${getPriorityColor(alert.priority)} flex items-center justify-center`}>
                      <i className={`${getTypeIcon(alert.type)} text-white text-lg`}></i>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800">{alert.title}</h3>
                      <p className="text-sm text-slate-600 mt-1">{alert.message}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold bg-gradient-to-r ${getPriorityColor(alert.priority)} text-white`}>
                      {alert.priority.toUpperCase()}
                    </span>
                    {alert.resolved && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        RESUELTA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                    <span>{new Date(alert.created_at).toLocaleString('es-AR')}</span>
                    {alert.action_url && (
                      <a
                        href={alert.action_url}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {alert.action_label || 'Ver detalles'} →
                      </a>
                    )}
                  </div>
                </div>
                {!alert.resolved && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Resolver
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

