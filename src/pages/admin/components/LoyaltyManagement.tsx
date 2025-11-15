import { useState, useEffect } from 'react';

interface LoyaltyCustomer {
  id: string;
  customerId: string; // @lid
  customerName?: string;
  tier: string;
  totalPoints: number;
  totalOrders: number;
  totalSpent: number;
  totalReferrals: number;
  discountPercentage: number;
  priority: boolean;
  isActive: boolean;
}

const TIER_CONFIG: Record<string, { label: string; icon: string; color: string; pointsRequired: number; benefits: string }> = {
  bronze: { label: 'Bronze', icon: '🟤', color: '#CD7F32', pointsRequired: 0, benefits: 'Acceso normal' },
  silver: { label: 'Silver', icon: '⚪', color: '#C0C0C0', pointsRequired: 500, benefits: '3% OFF permanente' },
  gold: { label: 'Gold', icon: '🟡', color: '#FFD700', pointsRequired: 2000, benefits: '7% OFF + prioridad cocina' },
  vip: { label: 'VIP', icon: '⭐', color: '#FFC300', pointsRequired: 5000, benefits: '10% OFF + combo mensual + menú exclusivo' }
};

export default function LoyaltyManagement() {
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'totalPoints' | 'totalSpent' | 'totalOrders'>('totalPoints');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<LoyaltyCustomer | null>(null);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [pointsAction, setPointsAction] = useState<'add' | 'subtract'>('add');
  const [pointsAmount, setPointsAmount] = useState('');
  const [config, setConfig] = useState({
    pointsPerPurchase: 1, // 1 punto por cada $100
    pointsNewCustomer: 5,
    pointsReferrer: 100,
    pointsBirthday: 50,
    pointsDailyMission: 20,
    pointsWeeklyMission: 50,
    pointsFirstOrder: 20
  });
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    loadCustomers();
    loadConfig();
  }, []);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/loyalty/customers`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Error cargando clientes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/api/loyalty/config`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config || config);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
    }
  };

  const saveConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/api/loyalty/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        alert('✅ Configuración guardada exitosamente');
      } else {
        alert('❌ Error al guardar configuración');
      }
    } catch (error: any) {
      console.error('Error guardando configuración:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const updateCustomerTier = async (customerId: string, newTier: string) => {
    try {
      const response = await fetch(`${API_URL}/api/loyalty/customers/${customerId}/tier`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: newTier })
      });

      if (response.ok) {
        await loadCustomers();
        alert('✅ Nivel actualizado exitosamente');
      } else {
        alert('❌ Error al actualizar nivel');
      }
    } catch (error: any) {
      console.error('Error actualizando nivel:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const modifyPoints = async () => {
    if (!selectedCustomer || !pointsAmount || parseInt(pointsAmount) <= 0) {
      alert('Por favor ingresa una cantidad válida');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/loyalty/customers/${selectedCustomer.customerId}/points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: pointsAction === 'add' ? parseInt(pointsAmount) : -parseInt(pointsAmount),
          reason: 'manual_admin',
          description: `Puntos ${pointsAction === 'add' ? 'agregados' : 'restados'} manualmente por administrador`
        })
      });

      if (response.ok) {
        await loadCustomers();
        setShowPointsModal(false);
        setPointsAmount('');
        setSelectedCustomer(null);
        alert(`✅ ${pointsAmount} puntos ${pointsAction === 'add' ? 'agregados' : 'restados'} exitosamente`);
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al modificar puntos'}`);
      }
    } catch (error: any) {
      console.error('Error modificando puntos:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const toggleCustomerActive = async (customerId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/loyalty/customers/${customerId}/active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (response.ok) {
        await loadCustomers();
      } else {
        alert('❌ Error al cambiar estado del cliente');
      }
    } catch (error: any) {
      console.error('Error cambiando estado:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const filteredCustomers = customers
    .filter(c => {
      const matchesTier = filterTier === 'all' || c.tier === filterTier;
      const matchesSearch = !searchTerm || 
        c.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.customerName && c.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesTier && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'totalPoints') return b.totalPoints - a.totalPoints;
      if (sortBy === 'totalSpent') return b.totalSpent - a.totalSpent;
      return b.totalOrders - a.totalOrders;
    });

  const getNextTier = (currentTier: string, currentPoints: number) => {
    const tiers = ['bronze', 'silver', 'gold', 'vip'];
    const currentIndex = tiers.indexOf(currentTier);
    if (currentIndex < tiers.length - 1) {
      const nextTier = tiers[currentIndex + 1];
      const nextTierConfig = TIER_CONFIG[nextTier];
      const pointsNeeded = nextTierConfig.pointsRequired - currentPoints;
      return { tier: nextTier, pointsNeeded, config: nextTierConfig };
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">⭐ SISTEMA DE FIDELIDAD</h2>
            <p className="text-sm text-[#C7C7C7]">Gestiona puntos, niveles y referidos por ID @lid</p>
          </div>
        </div>
      </div>

      {/* Configuración de Puntos */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#111111] mb-4">⚙️ Configuración de Puntos</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Puntos por compra (cada $100)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.pointsPerPurchase}
              onChange={(e) => setConfig({ ...config, pointsPerPurchase: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Cliente nuevo
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsNewCustomer}
              onChange={(e) => setConfig({ ...config, pointsNewCustomer: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Invitador (referido válido)
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsReferrer}
              onChange={(e) => setConfig({ ...config, pointsReferrer: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Cumpleaños
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsBirthday}
              onChange={(e) => setConfig({ ...config, pointsBirthday: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Misión diaria
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsDailyMission}
              onChange={(e) => setConfig({ ...config, pointsDailyMission: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Misión semanal
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsWeeklyMission}
              onChange={(e) => setConfig({ ...config, pointsWeeklyMission: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mb-1 block">
              Primer pedido
            </label>
            <input
              type="number"
              min="0"
              value={config.pointsFirstOrder}
              onChange={(e) => setConfig({ ...config, pointsFirstOrder: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
        </div>
        <button
          onClick={saveConfig}
          className="mt-4 px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all text-sm font-medium"
        >
          💾 Guardar Configuración
        </button>
      </div>

      {/* Niveles */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <h3 className="text-lg font-bold text-[#111111] mb-4">🏆 Niveles del Sistema</h3>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(TIER_CONFIG).map(([key, tier]) => (
            <div key={key} className="p-4 border border-[#C7C7C7] rounded-sm">
              <div className="text-3xl mb-2">{tier.icon}</div>
              <p className="font-bold text-[#111111] mb-1">{tier.label}</p>
              <p className="text-xs text-[#C7C7C7] mb-2">
                {tier.pointsRequired === 0 ? 'Inicio' : `Desde ${tier.pointsRequired} pts`}
              </p>
              <p className="text-xs text-[#111111]">{tier.benefits}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por ID @lid o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
          >
            <option value="all">Todos los niveles</option>
            {Object.entries(TIER_CONFIG).map(([key, tier]) => (
              <option key={key} value={key}>{tier.icon} {tier.label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
          >
            <option value="totalPoints">Ordenar por puntos</option>
            <option value="totalSpent">Ordenar por gasto</option>
            <option value="totalOrders">Ordenar por pedidos</option>
          </select>
        </div>
      </div>

      {/* Lista de Clientes */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="p-4 border-b border-[#C7C7C7]">
          <h3 className="text-lg font-bold text-[#111111]">
            Clientes ({filteredCustomers.length})
          </h3>
        </div>
        <div className="divide-y divide-[#C7C7C7]">
          {isLoading ? (
            <div className="p-8 text-center text-[#C7C7C7]">Cargando...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-[#C7C7C7]">No hay clientes</div>
          ) : (
            filteredCustomers.map((customer) => {
              const tierConfig = TIER_CONFIG[customer.tier] || TIER_CONFIG.bronze;
              const nextTier = getNextTier(customer.tier, customer.totalPoints);
              const progress = nextTier 
                ? Math.min(100, (customer.totalPoints / nextTier.config.pointsRequired) * 100)
                : 100;

              return (
                <div key={customer.id} className={`p-4 hover:bg-[#F9F9F9] transition-colors ${!customer.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">{tierConfig.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-[#111111]">
                            {customer.customerName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-[#C7C7C7] font-mono">{customer.customerId}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold`} style={{ 
                          backgroundColor: tierConfig.color + '20',
                          color: tierConfig.color 
                        }}>
                          {tierConfig.label}
                        </span>
                        {customer.priority && (
                          <span className="px-2 py-1 bg-[#FFC300] text-[#111111] rounded text-xs font-bold">
                            🚀 Prioridad
                          </span>
                        )}
                        {!customer.isActive && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">
                            ⛔ Inactivo
                          </span>
                        )}
                      </div>

                      {/* Barra de progreso */}
                      {nextTier && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-[#C7C7C7] mb-1">
                            <span>Progreso a {nextTier.tierConfig.label}</span>
                            <span>Faltan {nextTier.pointsNeeded} pts</span>
                          </div>
                          <div className="w-full bg-[#C7C7C7] rounded-full h-2">
                            <div 
                              className="bg-[#FFC300] h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-4 mt-3 text-xs">
                        <div>
                          <p className="text-[#C7C7C7]">Puntos</p>
                          <p className="font-bold text-[#111111] text-sm">{customer.totalPoints.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Total gastado</p>
                          <p className="font-bold text-[#111111] text-sm">
                            ${customer.totalSpent.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Pedidos</p>
                          <p className="font-bold text-[#111111] text-sm">{customer.totalOrders}</p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Referidos</p>
                          <p className="font-bold text-[#111111] text-sm">{customer.totalReferrals}</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-[#C7C7C7]">
                          Descuento: {customer.discountPercentage}% • Link: elbuemenu.app/invitar/?ref={customer.customerId}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setPointsAction('add');
                          setShowPointsModal(true);
                        }}
                        className="px-3 py-1 text-xs bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all"
                      >
                        ➕ Puntos
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setPointsAction('subtract');
                          setShowPointsModal(true);
                        }}
                        className="px-3 py-1 text-xs bg-white text-[#111111] border border-[#C7C7C7] rounded-sm hover:bg-[#F9F9F9] transition-all"
                      >
                        ➖ Puntos
                      </button>
                      <button
                        onClick={() => {
                          const newTier = prompt(`Nuevo nivel:\nbronze, silver, gold, vip`, customer.tier);
                          if (newTier && TIER_CONFIG[newTier]) {
                            updateCustomerTier(customer.customerId, newTier);
                          }
                        }}
                        className="px-3 py-1 text-xs bg-white text-[#111111] border border-[#C7C7C7] rounded-sm hover:bg-[#F9F9F9] transition-all"
                      >
                        ✏️ Nivel
                      </button>
                      <button
                        onClick={() => toggleCustomerActive(customer.customerId, customer.isActive)}
                        className={`px-3 py-1 text-xs rounded-sm transition-all ${
                          customer.isActive
                            ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                        }`}
                      >
                        {customer.isActive ? '⛔ Desactivar' : '✅ Activar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal para modificar puntos */}
      {showPointsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-6 w-full max-w-md border border-[#FFC300]">
            <h3 className="text-xl font-bold text-[#111111] mb-4">
              {pointsAction === 'add' ? '➕ Agregar Puntos' : '➖ Restar Puntos'}
            </h3>
            <p className="text-sm text-[#C7C7C7] mb-4">
              Cliente: <span className="font-mono text-[#111111]">{selectedCustomer.customerId}</span>
            </p>
            <p className="text-sm text-[#111111] mb-2">Puntos actuales: <strong>{selectedCustomer.totalPoints}</strong></p>
            <div className="mb-4">
              <label className="text-sm text-[#111111] font-medium mb-1 block">
                Cantidad de puntos
              </label>
              <input
                type="number"
                min="1"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                placeholder="Ej: 100"
                className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                autoFocus
              />
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowPointsModal(false);
                  setPointsAmount('');
                  setSelectedCustomer(null);
                }}
                className="flex-1 bg-[#F9F9F9] hover:bg-[#E9E9E9] text-[#111111] font-medium py-2 rounded-sm transition-all border border-[#C7C7C7]"
              >
                Cancelar
              </button>
              <button
                onClick={modifyPoints}
                className="flex-1 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 rounded-sm transition-all border border-[#111111]"
              >
                {pointsAction === 'add' ? 'Agregar' : 'Restar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

