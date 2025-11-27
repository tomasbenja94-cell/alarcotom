import { useState, useEffect } from 'react';

interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  current_account_balance: number;
  created_at: string;
}

interface ProductSupplier {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  supplier_id: string;
  price: number;
  unit: string;
}

interface PurchaseOrder {
  id: string;
  supplier_id: string;
  status: 'pending' | 'confirmed' | 'received' | 'cancelled';
  items: Array<{
    ingredient_id: string;
    ingredient_name: string;
    quantity: number;
    unit_price: number;
  }>;
  total: number;
  created_at: string;
}

export default function SuppliersManagement() {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'products' | 'orders' | 'account'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productSuppliers, setProductSuppliers] = useState<ProductSupplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para formulario de proveedor
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Aquí cargarías desde la API cuando esté implementada
      // Por ahora, datos de ejemplo
      setSuppliers([]);
      setProductSuppliers([]);
      setPurchaseOrders([]);
    } catch (error) {
      console.error('Error loading suppliers data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        // Actualizar proveedor
        alert('Funcionalidad de actualización próxima - Endpoint pendiente');
      } else {
        // Crear nuevo proveedor
        alert('Funcionalidad de creación próxima - Endpoint pendiente');
      }

      setShowSupplierModal(false);
      setEditingSupplier(null);
      setSupplierForm({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: ''
      });
      await loadData();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Error al guardar proveedor');
    }
  };

  const filteredSuppliers = suppliers.filter(sup => 
    sup.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sup.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sup.phone?.includes(searchTerm)
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando proveedores...</p>
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
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">PROVEEDORES</h2>
            <p className="text-sm text-[#C7C7C7]">Gestiona proveedores, precios, órdenes de compra y cuenta corriente</p>
          </div>
          <button
            onClick={() => {
              setShowSupplierModal(true);
              setEditingSupplier(null);
            }}
            className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
          >
            + Agregar Proveedor
          </button>
        </div>
      </div>

      {/* Navegación de tabs */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="flex border-b border-[#C7C7C7]">
          {[
            { id: 'suppliers', label: 'Proveedores', icon: '🧑‍🍳' },
            { id: 'products', label: 'Productos Asociados', icon: '📦' },
            { id: 'orders', label: 'Órdenes de Compra', icon: '📋' },
            { id: 'account', label: 'Cuenta Corriente', icon: '💰' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                  : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido de tabs */}
        <div className="p-6">
          {/* Tab: Proveedores */}
          {activeTab === 'suppliers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <input
                  type="text"
                  placeholder="🔍 Buscar proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full max-w-md px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
                />
              </div>

              {filteredSuppliers.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">
                    {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados. Agrega el primero.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSuppliers.map((supplier) => (
                    <div key={supplier.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-base text-[#111111] mb-1">{supplier.name}</h3>
                          {supplier.contact_name && (
                            <div className="text-xs text-[#C7C7C7] mb-1">👤 {supplier.contact_name}</div>
                          )}
                          {supplier.phone && (
                            <div className="text-xs text-[#C7C7C7] mb-1">📱 {supplier.phone}</div>
                          )}
                          {supplier.email && (
                            <div className="text-xs text-[#C7C7C7] mb-1">✉️ {supplier.email}</div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setSupplierForm({
                              name: supplier.name,
                              contact_name: supplier.contact_name || '',
                              phone: supplier.phone || '',
                              email: supplier.email || '',
                              address: supplier.address || ''
                            });
                            setShowSupplierModal(true);
                          }}
                          className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                        >
                          Editar
                        </button>
                      </div>
                      
                      <div className="pt-3 border-t border-[#C7C7C7]">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-[#C7C7C7] uppercase tracking-wider">Cuenta Corriente:</span>
                          <span className={`text-sm font-bold ${
                            supplier.current_account_balance > 0 ? 'text-[#111111]' : 
                            supplier.current_account_balance < 0 ? 'text-[#111111]' : 'text-[#C7C7C7]'
                          }`}>
                            {formatCurrency(Math.abs(supplier.current_account_balance))}
                            {supplier.current_account_balance < 0 && ' (debe)'}
                            {supplier.current_account_balance > 0 && ' (nos debe)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Productos Asociados */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">PRODUCTOS POR PROVEEDOR</h3>
                <p className="text-xs text-[#C7C7C7]">Gestiona qué productos compras a cada proveedor y sus precios</p>
              </div>

              {productSuppliers.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay productos asociados a proveedores</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#C7C7C7]">
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Proveedor</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Producto</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Precio</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSuppliers.map((ps) => (
                        <tr key={ps.id} className="border-b border-[#C7C7C7] hover:bg-[#F9F9F9]">
                          <td className="py-3 px-4 text-sm font-medium text-[#111111]">
                            {suppliers.find(s => s.id === ps.supplier_id)?.name || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-sm text-[#111111]">{ps.ingredient_name}</td>
                          <td className="py-3 px-4 text-sm font-medium text-[#111111]">{formatCurrency(ps.price)}</td>
                          <td className="py-3 px-4 text-xs text-[#C7C7C7]">{ps.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Órdenes de Compra */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">ÓRDENES DE COMPRA</h3>
                <p className="text-xs text-[#C7C7C7]">Gestiona órdenes de compra automáticas y manuales</p>
              </div>

              {purchaseOrders.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay órdenes de compra registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {purchaseOrders.map((order) => (
                    <div key={order.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-sm text-[#111111]">
                            {suppliers.find(s => s.id === order.supplier_id)?.name || 'Proveedor desconocido'}
                          </h4>
                          <p className="text-xs text-[#C7C7C7]">
                            {new Date(order.created_at).toLocaleString('es-AR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`px-3 py-1 rounded-sm text-xs font-medium border ${
                            order.status === 'pending' ? 'bg-[#FFF9E6] border-[#FFC300] text-[#111111]' :
                            order.status === 'confirmed' ? 'bg-white border-[#C7C7C7] text-[#111111]' :
                            order.status === 'received' ? 'bg-white border-[#C7C7C7] text-[#111111]' :
                            'bg-white border-[#C7C7C7] text-[#C7C7C7]'
                          }`}>
                            {order.status === 'pending' ? '⏳ Pendiente' :
                             order.status === 'confirmed' ? '✅ Confirmada' :
                             order.status === 'received' ? '📦 Recibida' :
                             '❌ Cancelada'}
                          </div>
                          <div className="text-sm font-bold text-[#111111] mt-1">
                            {formatCurrency(order.total)}
                          </div>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-[#C7C7C7]">
                        <div className="space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-[#111111]">{item.quantity} {item.ingredient_name}</span>
                              <span className="text-[#C7C7C7]">{formatCurrency(item.quantity * item.unit_price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Cuenta Corriente */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">CUENTA CORRIENTE</h3>
                <p className="text-xs text-[#C7C7C7]">Historial de movimientos de cuenta corriente con proveedores</p>
              </div>

              {suppliers.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay proveedores registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {suppliers.map((supplier) => (
                    <div key={supplier.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-base text-[#111111]">{supplier.name}</h4>
                        <div className="text-right">
                          <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-1">Saldo</div>
                          <div className={`text-xl font-bold ${
                            supplier.current_account_balance > 0 ? 'text-[#111111]' : 
                            supplier.current_account_balance < 0 ? 'text-[#111111]' : 'text-[#C7C7C7]'
                          }`}>
                            {formatCurrency(Math.abs(supplier.current_account_balance))}
                          </div>
                          <div className="text-xs text-[#C7C7C7] mt-1">
                            {supplier.current_account_balance < 0 ? 'Debe' : 
                             supplier.current_account_balance > 0 ? 'Nos debe' : 'Al día'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Agregar/Editar Proveedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-2xl border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {editingSupplier ? 'Editar Proveedor' : 'Agregar Proveedor'}
              </h3>
              <button
                onClick={() => {
                  setShowSupplierModal(false);
                  setEditingSupplier(null);
                  setSupplierForm({
                    name: '',
                    contact_name: '',
                    phone: '',
                    email: '',
                    address: ''
                  });
                }}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSupplierSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Nombre del Proveedor</label>
                  <input
                    type="text"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    placeholder="Ej: Proveedor ABC"
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Contacto</label>
                  <input
                    type="text"
                    value={supplierForm.contact_name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
                    placeholder="Nombre de contacto"
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Teléfono</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="Ej: +54 11 1234-5678"
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="Ej: contacto@proveedor.com"
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Dirección</label>
                  <textarea
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                    placeholder="Dirección del proveedor"
                    rows={3}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
                <button
                  type="button"
                  onClick={() => {
                    setShowSupplierModal(false);
                    setEditingSupplier(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
                >
                  {editingSupplier ? 'Actualizar' : 'Crear'} Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

