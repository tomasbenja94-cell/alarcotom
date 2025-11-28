import { useState, useEffect } from 'react';
import { customersApi } from '../../../lib/api';

interface Customer {
  id: string;
  phone: string;
  name?: string;
  is_blocked: boolean;
  disabled_payment_methods?: string;
  notes?: string;
  created_at: string;
}

interface CustomersManagementProps {
  storeId?: string | null;
}

export default function CustomersManagement({ storeId }: CustomersManagementProps = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (storeId) {
      loadCustomers();
      const interval = setInterval(loadCustomers, 30000);
      return () => clearInterval(interval);
    }
  }, [storeId]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      // IMPORTANTE: Filtrar clientes por storeId para que cada tienda vea solo sus clientes
      const data = await customersApi.getAll(storeId ? { storeId } : undefined);
      setCustomers(data);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async (customer: Customer) => {
    try {
      await customersApi.update(customer.id, {
        is_blocked: !customer.is_blocked
      });
      await loadCustomers();
      alert(customer.is_blocked 
        ? 'Cliente desbloqueado. Ahora recibirá respuestas del bot.'
        : 'Cliente bloqueado. El bot no responderá sus mensajes.'
      );
    } catch (error) {
      console.error('Error updating customer:', error);
      alert('Error al actualizar cliente');
    }
  };

  const handleTogglePaymentMethod = async (customer: Customer, method: string) => {
    try {
      const disabledMethods = customer.disabled_payment_methods 
        ? JSON.parse(customer.disabled_payment_methods)
        : [];
      
      const index = disabledMethods.indexOf(method);
      if (index > -1) {
        disabledMethods.splice(index, 1);
      } else {
        disabledMethods.push(method);
      }

      await customersApi.update(customer.id, {
        disabled_payment_methods: disabledMethods
      });
      await loadCustomers();
    } catch (error) {
      console.error('Error updating payment methods:', error);
      alert('Error al actualizar métodos de pago');
    }
  };

  const isPaymentMethodDisabled = (customer: Customer, method: string) => {
    if (!customer.disabled_payment_methods) return false;
    try {
      const disabledMethods = JSON.parse(customer.disabled_payment_methods);
      return disabledMethods.includes(method);
    } catch {
      return false;
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold text-lg">Cargando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header Minimalista */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <i className="ri-user-line text-white text-sm"></i>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-black">Clientes</h2>
              <p className="text-[10px] text-gray-500">Administra clientes</p>
            </div>
          </div>
          <div className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] font-medium text-gray-700">
            {customers.length} registrados
          </div>
        </div>
      </div>

      {/* Buscador Minimalista */}
      <div className="bg-white border border-gray-200 rounded-lg p-2">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-2 py-1.5 text-[10px] border border-gray-200 rounded focus:ring-1 focus:ring-black focus:border-black outline-none"
        />
      </div>

      {/* Lista de clientes - Adaptada para móvil */}
      <div className="space-y-2">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-xs text-gray-500">No se encontraron clientes</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded flex items-center justify-center border flex-shrink-0 ${
                    customer.is_blocked 
                      ? 'bg-gray-100 border-gray-300' 
                      : 'bg-black border-black'
                  }`}>
                    <i className={`ri-user-${customer.is_blocked ? 'forbid' : ''}-line text-white text-xs`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-semibold text-black mb-0.5 truncate">
                      {customer.name || 'Sin nombre'}
                    </h3>
                    <p className="text-[10px] text-gray-600 mb-0.5 truncate">{customer.phone}</p>
                    <p className="text-[9px] text-gray-400">
                      {new Date(customer.created_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleBlock(customer)}
                  className={`px-2 py-1 text-[10px] font-medium rounded border flex-shrink-0 ${
                    customer.is_blocked
                      ? 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-black text-white border-black'
                  }`}
                >
                  {customer.is_blocked ? 'Bloqueado' : 'Activo'}
                </button>
              </div>

              {/* Métodos de pago - Compacto para móvil */}
              <div className="mt-2 pt-2 border-t border-gray-100">
                <h4 className="text-[10px] font-medium text-gray-700 mb-1.5">Métodos de Pago</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'efectivo')}
                    className={`px-1.5 py-1 text-[9px] font-medium rounded border ${
                      isPaymentMethodDisabled(customer, 'efectivo')
                        ? 'bg-gray-100 text-gray-600 border-gray-300'
                        : 'bg-white text-black border-gray-200'
                    }`}
                  >
                    Efectivo
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'transferencia')}
                    className={`px-1.5 py-1 text-[9px] font-medium rounded border ${
                      isPaymentMethodDisabled(customer, 'transferencia')
                        ? 'bg-gray-100 text-gray-600 border-gray-300'
                        : 'bg-white text-black border-gray-200'
                    }`}
                  >
                    Transfer.
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'mercadopago')}
                    className={`px-1.5 py-1 text-[9px] font-medium rounded border ${
                      isPaymentMethodDisabled(customer, 'mercadopago')
                        ? 'bg-gray-100 text-gray-600 border-gray-300'
                        : 'bg-white text-black border-gray-200'
                    }`}
                  >
                    MPago
                  </button>
                </div>
              </div>

              {customer.notes && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-600">
                    <span className="font-medium">Notas:</span> {customer.notes}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

