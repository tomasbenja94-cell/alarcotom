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
    loadCustomers();
    const interval = setInterval(loadCustomers, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await customersApi.getAll();
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
    <div className="space-y-6">
      {/* Header - Mejorado */}
      <div className="bg-gradient-to-r from-white to-[#FFF9E6] border-2 border-[#FFC300] rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-[#111111] flex items-center space-x-3">
              <span className="text-4xl">👥</span>
              <span>CLIENTES</span>
            </h2>
            <p className="text-sm text-[#666] font-medium">Administra clientes y restricciones</p>
          </div>
          <div className="bg-gradient-to-r from-blue-400 to-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-md">
            {customers.length} clientes registrados
          </div>
        </div>
      </div>

      {/* Buscador - Mejorado */}
      <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-md p-5">
        <input
          type="text"
          placeholder="🔍 Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-5 py-3 border-2 border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111] font-medium"
        />
      </div>

      {/* Lista de clientes - Mejorado */}
      <div className="space-y-4">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">👤</div>
            <p className="text-lg text-[#666] font-bold">No se encontraron clientes</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-white border-2 border-[#E5E5E5] rounded-2xl shadow-lg p-6 hover:border-[#FFC300] hover:shadow-xl transition-all transform hover:scale-[1.01]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 shadow-lg ${
                    customer.is_blocked 
                      ? 'bg-gradient-to-br from-gray-100 to-gray-200 border-gray-300' 
                      : 'bg-gradient-to-br from-[#111111] to-[#2A2A2A] border-[#FFC300]'
                  }`}>
                    <span className={`text-3xl ${
                      customer.is_blocked ? '😴' : '😊'
                    }`}></span>
                  </div>
                  <div>
                    <h3 className="font-bold text-[#111111] text-lg mb-1">
                      {customer.name || 'Sin nombre'}
                    </h3>
                    <p className="text-sm text-[#666] font-medium mb-1">📱 {customer.phone}</p>
                    <p className="text-xs text-[#999]">
                      Registrado: {new Date(customer.created_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleBlock(customer)}
                  className={`px-5 py-3 rounded-xl text-sm font-bold transition-all border-2 shadow-lg hover:shadow-xl transform hover:scale-[1.05] ${
                    customer.is_blocked
                      ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white border-gray-600 hover:from-gray-500 hover:to-gray-600'
                      : 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-700 hover:from-green-600 hover:to-green-700'
                  }`}
                >
                  {customer.is_blocked ? '🚫 Bloqueado' : '✅ Activo'}
                </button>
              </div>

              {/* Métodos de pago deshabilitados - Mejorado */}
              <div className="mt-4 p-5 bg-gradient-to-br from-[#F9F9F9] to-white border-2 border-[#E5E5E5] rounded-xl">
                <h4 className="text-sm font-bold text-[#111111] mb-4 uppercase tracking-wider flex items-center space-x-2">
                  <span>💳</span>
                  <span>Métodos de Pago</span>
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'efectivo')}
                    className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border-2 shadow-md hover:shadow-lg transform hover:scale-[1.05] ${
                      isPaymentMethodDisabled(customer, 'efectivo')
                        ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-red-600'
                        : 'bg-gradient-to-r from-green-400 to-green-500 text-white border-green-600'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'efectivo') ? '🚫 Efectivo' : '✅ Efectivo'}
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'transferencia')}
                    className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border-2 shadow-md hover:shadow-lg transform hover:scale-[1.05] ${
                      isPaymentMethodDisabled(customer, 'transferencia')
                        ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-red-600'
                        : 'bg-gradient-to-r from-green-400 to-green-500 text-white border-green-600'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'transferencia') ? '🚫 Transferencia' : '✅ Transferencia'}
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'mercadopago')}
                    className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border-2 shadow-md hover:shadow-lg transform hover:scale-[1.05] ${
                      isPaymentMethodDisabled(customer, 'mercadopago')
                        ? 'bg-gradient-to-r from-red-400 to-red-500 text-white border-red-600'
                        : 'bg-gradient-to-r from-green-400 to-green-500 text-white border-green-600'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'mercadopago') ? '🚫 Mercado Pago' : '✅ Mercado Pago'}
                  </button>
                </div>
              </div>

              {customer.notes && (
                <div className="mt-4 p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 rounded-xl">
                  <p className="text-sm text-[#111111] font-medium">
                    <strong className="font-bold">📝 Notas:</strong> {customer.notes}
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

