import { useState, useEffect } from 'react';

interface CustomerLoyalty {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  tier: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  favoriteProducts?: string[];
  discountPercentage: number;
  points: number;
  priority: boolean;
}

const TIER_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  regular: { label: 'Regular', color: '#C7C7C7', icon: '⚪' },
  bronze: { label: 'Bronze', color: '#CD7F32', icon: '🟤' },
  silver: { label: 'Silver', color: '#C0C0C0', icon: '⚪' },
  gold: { label: 'Gold', color: '#FFD700', icon: '🟡' },
  vip: { label: 'VIP', color: '#FFC300', icon: '⭐' }
};

export default function CustomerLoyalty() {
  const [customers, setCustomers] = useState<CustomerLoyalty[]>([]);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'totalSpent' | 'totalOrders' | 'points'>('totalSpent');
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadCustomers();
    // Recalcular niveles automáticamente cada vez que se carga
    recalculateTiers();
  }, []);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/customers/loyalty`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Error cargando clientes VIP:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const recalculateTiers = async () => {
    try {
      await fetch(`${API_URL}/api/customers/loyalty/recalculate`, {
        method: 'POST'
      });
      // Recargar después de recalcular
      await loadCustomers();
    } catch (error) {
      console.error('Error recalculando niveles:', error);
    }
  };

  const updateCustomerTier = async (customerId: string, newTier: string, discount: number, priority: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/customers/loyalty/${customerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier: newTier,
          discountPercentage: discount,
          priority
        })
      });

      if (response.ok) {
        await loadCustomers();
        alert('✅ Cliente actualizado exitosamente');
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al actualizar cliente'}`);
      }
    } catch (error: any) {
      console.error('Error actualizando cliente:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  };

  const filteredCustomers = customers
    .filter(c => filterTier === 'all' || c.tier === filterTier)
    .sort((a, b) => {
      if (sortBy === 'totalSpent') return b.totalSpent - a.totalSpent;
      if (sortBy === 'totalOrders') return b.totalOrders - a.totalOrders;
      return b.points - a.points;
    });

  const tierStats = customers.reduce((acc, c) => {
    acc[c.tier] = (acc[c.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">⭐ CLIENTES VIP / FIDELIDAD</h2>
            <p className="text-sm text-[#C7C7C7]">Gestiona clientes frecuentes y recompensas</p>
          </div>
          <button
            onClick={recalculateTiers}
            className="px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all text-sm font-medium"
          >
            🔄 Recalcular Niveles
          </button>
        </div>
      </div>

      {/* Estadísticas por nivel */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(TIER_LABELS).map(([tier, config]) => (
          <div key={tier} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4 text-center">
            <p className="text-2xl mb-2">{config.icon}</p>
            <p className="text-sm font-bold text-[#111111]">{config.label}</p>
            <p className="text-2xl font-bold mt-2" style={{ color: config.color }}>
              {tierStats[tier] || 0}
            </p>
            <p className="text-xs text-[#C7C7C7] mt-1">clientes</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <div className="flex items-center space-x-4">
          <div>
            <label className="text-sm text-[#111111] font-medium mr-2">Filtrar por nivel:</label>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="px-3 py-1 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            >
              <option value="all">Todos</option>
              {Object.entries(TIER_LABELS).map(([tier, config]) => (
                <option key={tier} value={tier}>{config.icon} {config.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#111111] font-medium mr-2">Ordenar por:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            >
              <option value="totalSpent">Total gastado</option>
              <option value="totalOrders">Cantidad de pedidos</option>
              <option value="points">Puntos de fidelidad</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de clientes */}
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
            <div className="p-8 text-center text-[#C7C7C7]">No hay clientes en este nivel</div>
          ) : (
            filteredCustomers.map((customer) => {
              const tierConfig = TIER_LABELS[customer.tier] || TIER_LABELS.regular;
              return (
                <div key={customer.id} className="p-4 hover:bg-[#F9F9F9] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">{tierConfig.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-[#111111]">
                            {customer.customerName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-[#C7C7C7]">{customer.customerPhone}</p>
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
                      </div>
                      <div className="grid grid-cols-4 gap-4 mt-2 text-xs">
                        <div>
                          <p className="text-[#C7C7C7]">Total gastado</p>
                          <p className="font-bold text-[#111111]">
                            ${customer.totalSpent.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Pedidos</p>
                          <p className="font-bold text-[#111111]">{customer.totalOrders}</p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Puntos</p>
                          <p className="font-bold text-[#111111]">{customer.points}</p>
                        </div>
                        <div>
                          <p className="text-[#C7C7C7]">Descuento</p>
                          <p className="font-bold text-[#111111]">{customer.discountPercentage}%</p>
                        </div>
                      </div>
                      {customer.lastOrderDate && (
                        <p className="text-xs text-[#C7C7C7] mt-2">
                          Último pedido: {new Date(customer.lastOrderDate).toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const newTier = prompt(`Nuevo nivel para ${customer.customerName || 'cliente'}:\nregular, bronze, silver, gold, vip`, customer.tier);
                        const newDiscount = prompt(`Descuento (%) (actual: ${customer.discountPercentage}):`, customer.discountPercentage.toString());
                        const newPriority = confirm(`¿Prioridad en cocina? (actual: ${customer.priority ? 'Sí' : 'No'})`);
                        
                        if (newTier && TIER_LABELS[newTier]) {
                          updateCustomerTier(customer.id, newTier, parseFloat(newDiscount || '0'), newPriority);
                        }
                      }}
                      className="px-3 py-1 text-xs bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all"
                    >
                      ✏️ Editar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

