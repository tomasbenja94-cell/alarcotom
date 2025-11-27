/**
 * Panel de tareas globales para repartidores
 * Pool global, aceptación, retiro y envío múltiple
 */

import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  orderNumber: string;
  store: {
    id: string;
    name: string;
    image?: string;
  };
  customer: {
    name: string;
    address: string;
    phone?: string;
    lat?: number;
    lng?: number;
  };
  items: string[];
  total: number;
  deliveryFee: number;
  deliveryCode?: string;
  deliveryStatus?: string;
  multiRouteOrder?: number;
  acceptedAt?: string;
  pickedUpAt?: string;
  createdAt?: string;
}

interface ActiveRoute {
  id: string;
  totalOrders: number;
  completedOrders: number;
  currentOrderIndex: number;
  orders: Task[];
}

interface TasksPanelProps {
  driverId: string;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function TasksPanel({ driverId, onToast }: TasksPanelProps) {
  const [activeTab, setActiveTab] = useState<'available' | 'myTasks' | 'route'>('available');
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<{
    accepted: Task[];
    pickedUp: Task[];
    inRoute: Task[];
  }>({ accepted: [], pickedUp: [], inRoute: [] });
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [selectedForRoute, setSelectedForRoute] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
  const getToken = () => localStorage.getItem('driverToken');

  // Cargar tareas disponibles
  const loadAvailableTasks = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/delivery-tasks/available`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableTasks(data);
      }
    } catch (error) {
      console.error('Error cargando tareas disponibles:', error);
    }
  }, [API_URL]);

  // Cargar mis tareas
  const loadMyTasks = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/delivery-tasks/my-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setMyTasks(data);
      }
    } catch (error) {
      console.error('Error cargando mis tareas:', error);
    }
  }, [API_URL]);

  // Cargar ruta activa
  const loadActiveRoute = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/delivery-tasks/active-route`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setActiveRoute(data.activeRoute);
        if (data.activeRoute) {
          setActiveTab('route');
        }
      }
    } catch (error) {
      console.error('Error cargando ruta activa:', error);
    }
  }, [API_URL]);

  // Cargar todo al iniciar
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadAvailableTasks(), loadMyTasks(), loadActiveRoute()]);
      setLoading(false);
    };
    loadAll();

    // Polling cada 30 segundos
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAvailableTasks, loadMyTasks, loadActiveRoute]);

  // Aceptar tarea
  const handleAcceptTask = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/delivery-tasks/${taskId}/accept`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        onToast('Tarea aceptada', 'success');
        await Promise.all([loadAvailableTasks(), loadMyTasks()]);
        setActiveTab('myTasks');
      } else {
        const error = await response.json();
        onToast(error.error || 'Error aceptando tarea', 'error');
      }
    } catch (error) {
      onToast('Error de conexión', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Marcar como retirado
  const handlePickup = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/delivery-tasks/${taskId}/pickup`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        onToast(`Pedido retirado. Código: ${data.deliveryCode}`, 'success');
        await loadMyTasks();
      } else {
        const error = await response.json();
        onToast(error.error || 'Error marcando retiro', 'error');
      }
    } catch (error) {
      onToast('Error de conexión', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Iniciar ruta múltiple
  const handleStartMultiRoute = async () => {
    if (selectedForRoute.size === 0) {
      onToast('Seleccioná al menos un pedido', 'error');
      return;
    }

    setActionLoading('multi-route');
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/delivery-tasks/start-multi-route`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderIds: Array.from(selectedForRoute) })
      });

      if (response.ok) {
        const data = await response.json();
        onToast(`Ruta iniciada con ${data.totalOrders} pedidos`, 'success');
        setSelectedForRoute(new Set());
        await Promise.all([loadMyTasks(), loadActiveRoute()]);
      } else {
        const error = await response.json();
        onToast(error.error || 'Error iniciando ruta', 'error');
      }
    } catch (error) {
      onToast('Error de conexión', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Marcar como entregado
  const handleDeliver = async (taskId: string, code?: string) => {
    setActionLoading(taskId);
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/delivery-tasks/${taskId}/deliver`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      if (response.ok) {
        onToast('Pedido entregado', 'success');
        await Promise.all([loadMyTasks(), loadActiveRoute()]);
      } else {
        const error = await response.json();
        onToast(error.error || 'Error marcando entrega', 'error');
      }
    } catch (error) {
      onToast('Error de conexión', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Cancelar/liberar tarea
  const handleCancelTask = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/delivery-tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Liberado por el repartidor' })
      });

      if (response.ok) {
        onToast('Tarea liberada', 'info');
        await Promise.all([loadAvailableTasks(), loadMyTasks()]);
      } else {
        const error = await response.json();
        onToast(error.error || 'Error liberando tarea', 'error');
      }
    } catch (error) {
      onToast('Error de conexión', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle selección para ruta
  const toggleSelectForRoute = (taskId: string) => {
    setSelectedForRoute(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Render de una tarea
  const renderTask = (task: Task, actions: React.ReactNode) => (
    <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
      <div className="flex items-start gap-3">
        {task.store.image ? (
          <img src={task.store.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold">
            {task.store.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500">#{task.orderNumber}</span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs font-medium text-rose-500">{task.store.name}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 truncate">{task.customer.name}</p>
          <p className="text-xs text-gray-500 truncate">{task.customer.address}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm font-bold text-gray-900">${task.total.toLocaleString('es-AR')}</span>
            <span className="text-xs text-gray-400">Envío: ${task.deliveryFee.toLocaleString('es-AR')}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {actions}
      </div>
    </div>
  );

  if (loading && availableTasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('available')}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'available' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500'
          }`}
        >
          Disponibles ({availableTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('myTasks')}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'myTasks' 
              ? 'bg-white text-gray-900 shadow-sm' 
              : 'text-gray-500'
          }`}
        >
          Mis tareas ({myTasks.accepted.length + myTasks.pickedUp.length})
        </button>
        {activeRoute && (
          <button
            onClick={() => setActiveTab('route')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'route' 
                ? 'bg-rose-500 text-white shadow-sm' 
                : 'bg-rose-100 text-rose-600'
            }`}
          >
            🚚 En ruta ({activeRoute.completedOrders}/{activeRoute.totalOrders})
          </button>
        )}
      </div>

      {/* Contenido */}
      {activeTab === 'available' && (
        <div>
          {availableTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <i className="ri-inbox-line text-4xl mb-2"></i>
              <p>No hay tareas disponibles</p>
            </div>
          ) : (
            availableTasks.map(task => renderTask(task, (
              <button
                onClick={() => handleAcceptTask(task.id)}
                disabled={actionLoading === task.id}
                className="flex-1 py-2 bg-rose-500 text-white text-sm font-medium rounded-lg hover:bg-rose-600 disabled:opacity-50"
              >
                {actionLoading === task.id ? 'Aceptando...' : 'Aceptar'}
              </button>
            )))
          )}
        </div>
      )}

      {activeTab === 'myTasks' && (
        <div className="space-y-6">
          {/* Aceptadas - Pendientes de retiro */}
          {myTasks.accepted.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                Pendientes de retiro ({myTasks.accepted.length})
              </h3>
              {myTasks.accepted.map(task => renderTask(task, (
                <>
                  <button
                    onClick={() => handlePickup(task.id)}
                    disabled={actionLoading === task.id}
                    className="flex-1 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {actionLoading === task.id ? 'Marcando...' : '📦 Retirar'}
                  </button>
                  <button
                    onClick={() => handleCancelTask(task.id)}
                    disabled={actionLoading === task.id}
                    className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
                  >
                    Liberar
                  </button>
                </>
              )))}
            </div>
          )}

          {/* Retiradas - Listas para ruta */}
          {myTasks.pickedUp.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Retiradas - Listas para ruta ({myTasks.pickedUp.length})
              </h3>
              {myTasks.pickedUp.map(task => (
                <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={selectedForRoute.has(task.id)}
                      onChange={() => toggleSelectForRoute(task.id)}
                      className="w-5 h-5 rounded border-gray-300 text-rose-500 focus:ring-rose-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">#{task.orderNumber}</span>
                        <span className="text-xs text-rose-500">{task.store.name}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{task.customer.name}</p>
                      <p className="text-xs text-gray-500">{task.customer.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">${task.total.toLocaleString('es-AR')}</p>
                      {task.deliveryCode && (
                        <p className="text-xs text-green-600 font-medium">Código: {task.deliveryCode}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Botón de iniciar ruta */}
              <button
                onClick={handleStartMultiRoute}
                disabled={selectedForRoute.size === 0 || actionLoading === 'multi-route'}
                className="w-full py-3 bg-gradient-to-r from-rose-500 to-orange-500 text-white font-semibold rounded-xl hover:from-rose-600 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'multi-route' ? (
                  'Iniciando...'
                ) : (
                  <>
                    🚚 Iniciar entrega ({selectedForRoute.size} {selectedForRoute.size === 1 ? 'pedido' : 'pedidos'})
                  </>
                )}
              </button>
            </div>
          )}

          {myTasks.accepted.length === 0 && myTasks.pickedUp.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <i className="ri-clipboard-line text-4xl mb-2"></i>
              <p>No tenés tareas asignadas</p>
              <p className="text-sm mt-1">Aceptá tareas desde la pestaña "Disponibles"</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'route' && activeRoute && (
        <div className="space-y-4">
          {/* Progress */}
          <div className="bg-gradient-to-r from-rose-500 to-orange-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Ruta activa</span>
              <span className="text-sm">{activeRoute.completedOrders}/{activeRoute.totalOrders} entregados</span>
            </div>
            <div className="w-full bg-white/30 rounded-full h-2">
              <div 
                className="bg-white rounded-full h-2 transition-all"
                style={{ width: `${(activeRoute.completedOrders / activeRoute.totalOrders) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Lista de pedidos en ruta */}
          {activeRoute.orders.map((task, index) => {
            const isDelivered = task.deliveryStatus === 'delivered';
            const isCurrent = task.deliveryStatus === 'delivering';
            
            return (
              <div 
                key={task.id} 
                className={`rounded-xl p-4 border ${
                  isDelivered 
                    ? 'bg-green-50 border-green-200' 
                    : isCurrent 
                      ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500' 
                      : 'bg-white border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    isDelivered 
                      ? 'bg-green-500 text-white' 
                      : isCurrent 
                        ? 'bg-rose-500 text-white' 
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isDelivered ? '✓' : index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">#{task.orderNumber}</span>
                      <span className="text-xs text-rose-500">{task.storeName}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{task.customer.name}</p>
                    <p className="text-xs text-gray-500">{task.customer.address}</p>
                    {task.customer.phone && (
                      <a 
                        href={`tel:${task.customer.phone}`}
                        className="text-xs text-blue-500 flex items-center gap-1 mt-1"
                      >
                        <i className="ri-phone-line"></i> {task.customer.phone}
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">${task.total.toLocaleString('es-AR')}</p>
                    {task.deliveryCode && (
                      <p className="text-xs text-green-600 font-medium">Código: {task.deliveryCode}</p>
                    )}
                  </div>
                </div>
                
                {isCurrent && (
                  <div className="mt-3 flex gap-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${task.customer.lat},${task.customer.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg text-center"
                    >
                      🗺️ Navegar
                    </a>
                    <button
                      onClick={() => handleDeliver(task.id)}
                      disabled={actionLoading === task.id}
                      className="flex-1 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {actionLoading === task.id ? 'Marcando...' : '✅ Entregado'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

