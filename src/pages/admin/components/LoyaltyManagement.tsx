import { useState, useEffect } from 'react';

interface LoyaltyProgram {
  points_per_order: number;
  points_per_currency: number;
  discount_per_points: number;
  is_active: boolean;
}

interface LoyaltyUser {
  id: string;
  customer_name: string;
  customer_phone: string;
  total_points: number;
  redeemed_points: number;
  available_points: number;
  level: 'bronze' | 'silver' | 'gold' | 'platinum';
  total_orders: number;
}

export default function LoyaltyManagement() {
  const [program, setProgram] = useState<LoyaltyProgram>({
    points_per_order: 10,
    points_per_currency: 1,
    discount_per_points: 100,
    is_active: true,
  });
  const [users, setUsers] = useState<LoyaltyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProgramModal, setShowProgramModal] = useState(false);

  useEffect(() => {
    loadProgram();
    loadUsers();
  }, []);

  const loadProgram = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/loyalty/program?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProgram(data || program);
      }
    } catch (error) {
      console.error('Error loading loyalty program:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/loyalty/users?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data || []);
      }
    } catch (error) {
      console.error('Error loading loyalty users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgram = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/loyalty/program`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...program, store_id: storeId })
      });
      
      if (response.ok) {
        await loadProgram();
        setShowProgramModal(false);
      }
    } catch (error) {
      console.error('Error saving loyalty program:', error);
      alert('Error al guardar el programa de fidelidad');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  const topUsers = [...users].sort((a, b) => b.total_points - a.total_points).slice(0, 5);
  const stats = {
    total: users.length,
    totalPoints: users.reduce((sum, u) => sum + u.total_points, 0),
    redeemedPoints: users.reduce((sum, u) => sum + u.redeemed_points, 0),
    active: users.filter(u => u.available_points > 0).length,
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'bronze': return 'from-amber-600 to-amber-800';
      case 'silver': return 'from-slate-400 to-slate-600';
      case 'gold': return 'from-yellow-400 to-yellow-600';
      case 'platinum': return 'from-purple-400 to-purple-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Programa de Fidelidad</h2>
        <button
          onClick={() => setShowProgramModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-settings-3-line mr-2"></i>
          Configurar
        </button>
      </div>

      {/* Program Status */}
      <div className={`rounded-xl p-4 border-2 ${
        program.is_active
          ? 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200'
          : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-800 mb-1">
              Programa de Fidelidad {program.is_active ? 'Activo' : 'Inactivo'}
            </p>
            <div className="text-sm text-slate-600 space-y-1">
              <p>• {program.points_per_order} puntos por pedido</p>
              <p>• ${program.points_per_currency} = 1 punto</p>
              <p>• {program.discount_per_points} puntos = $1 de descuento</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg ${
            program.is_active ? 'bg-green-500' : 'bg-slate-400'
          } text-white font-bold`}>
            {program.is_active ? 'ACTIVO' : 'INACTIVO'}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs text-purple-600 mb-1">Total Usuarios</p>
          <p className="text-2xl font-bold text-purple-700">{stats.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Puntos Totales</p>
          <p className="text-2xl font-bold text-blue-700">{stats.totalPoints.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 mb-1">Canjeados</p>
          <p className="text-2xl font-bold text-green-700">{stats.redeemedPoints.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-xs text-amber-600 mb-1">Con Puntos</p>
          <p className="text-2xl font-bold text-amber-700">{stats.active}</p>
        </div>
      </div>

      {/* Top Users */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">Top 5 Usuarios</h3>
        <div className="space-y-3">
          {topUsers.map((user, idx) => (
            <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                  {idx + 1}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{user.customer_name}</p>
                  <p className="text-xs text-slate-500">{user.total_orders} pedidos</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold bg-gradient-to-r ${getLevelColor(user.level)} text-white`}>
                  {user.level.toUpperCase()}
                </span>
              </div>
              <div className="text-right">
                <p className="font-bold text-purple-600">{user.available_points} puntos</p>
                <p className="text-xs text-slate-500">{user.total_points} total</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All Users */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">Todos los Usuarios</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {users.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <i className="ri-user-star-line text-4xl mb-2 block"></i>
              <p>No hay usuarios en el programa</p>
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0">
                <div>
                  <p className="font-medium text-slate-800">{user.customer_name}</p>
                  <p className="text-xs text-slate-500">{user.customer_phone}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-purple-600">{user.available_points} pts</p>
                  <p className="text-xs text-slate-500">Nivel {user.level}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de Configuración */}
      {showProgramModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Configurar Programa de Fidelidad</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Puntos por Pedido</label>
                <input
                  type="number"
                  value={program.points_per_order}
                  onChange={(e) =>
                    setProgram({ ...program, points_per_order: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Puntos por cada $ (gastado)
                </label>
                <input
                  type="number"
                  value={program.points_per_currency}
                  onChange={(e) =>
                    setProgram({ ...program, points_per_currency: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ejemplo: 1 punto por cada $1 gastado
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Puntos necesarios para $1 de descuento
                </label>
                <input
                  type="number"
                  value={program.discount_per_points}
                  onChange={(e) =>
                    setProgram({ ...program, discount_per_points: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ejemplo: 100 puntos = $1 de descuento
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={program.is_active}
                  onChange={(e) => setProgram({ ...program, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium">Programa activo</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowProgramModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProgram}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-lg font-semibold hover:shadow-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
