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

export default function CustomersManagement() {
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
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">CLIENTES</h2>
            <p className="text-sm text-[#C7C7C7]">Administra clientes y restricciones</p>
          </div>
          <div className="bg-white border border-[#C7C7C7] text-[#111111] px-4 py-2 rounded-sm text-xs font-medium">
            {customers.length} clientes registrados
          </div>
        </div>
      </div>

      {/* Buscador - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
        />
      </div>

      {/* Lista de clientes - Premium Style */}
      <div className="space-y-4">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-8 text-center">
            <p className="text-sm text-[#C7C7C7] font-medium">No se encontraron clientes</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6 hover:border-[#FFC300] transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${
                    customer.is_blocked ? 'bg-white border-[#C7C7C7]' : 'bg-[#111111] border-[#FFC300]'
                  }`}>
                    <i className={`ri-user-line text-xl ${
                      customer.is_blocked ? 'text-[#C7C7C7]' : 'text-white'
                    }`}></i>
                  </div>
                  <div>
                    <h3 className="font-medium text-[#111111] text-base">
                      {customer.name || 'Sin nombre'}
                    </h3>
                    <p className="text-xs text-[#C7C7C7]">{customer.phone}</p>
                    <p className="text-xs text-[#C7C7C7] mt-1">
                      Registrado: {new Date(customer.created_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleBlock(customer)}
                  className={`px-4 py-2 rounded-sm text-xs font-medium transition-all border ${
                    customer.is_blocked
                      ? 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
                      : 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
                  }`}
                >
                  {customer.is_blocked ? '🚫 Bloqueado' : '✅ Activo'}
                </button>
              </div>

              {/* Métodos de pago deshabilitados - Premium Style */}
              <div className="mt-4 p-4 bg-white border border-[#C7C7C7] rounded-sm">
                <h4 className="text-xs font-medium text-[#111111] mb-3 uppercase tracking-wider">Métodos de Pago</h4>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'efectivo')}
                    className={`px-3 py-2 rounded-sm text-xs font-medium transition-all border ${
                      isPaymentMethodDisabled(customer, 'efectivo')
                        ? 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
                        : 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'efectivo') ? '🚫 Efectivo' : '✅ Efectivo'}
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'transferencia')}
                    className={`px-3 py-2 rounded-sm text-xs font-medium transition-all border ${
                      isPaymentMethodDisabled(customer, 'transferencia')
                        ? 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
                        : 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'transferencia') ? '🚫 Transferencia' : '✅ Transferencia'}
                  </button>
                  <button
                    onClick={() => handleTogglePaymentMethod(customer, 'mercadopago')}
                    className={`px-3 py-2 rounded-sm text-xs font-medium transition-all border ${
                      isPaymentMethodDisabled(customer, 'mercadopago')
                        ? 'bg-white text-[#111111] border-[#C7C7C7] hover:bg-[#F9F9F9]'
                        : 'bg-[#111111] text-white border-[#FFC300] hover:bg-[#1A1A1A]'
                    }`}
                  >
                    {isPaymentMethodDisabled(customer, 'mercadopago') ? '🚫 Mercado Pago' : '✅ Mercado Pago'}
                  </button>
                </div>
              </div>

              {customer.notes && (
                <div className="mt-4 p-3 bg-white border border-[#C7C7C7] rounded-sm">
                  <p className="text-xs text-[#111111]">
                    <strong className="font-medium">Notas:</strong> {customer.notes}
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

