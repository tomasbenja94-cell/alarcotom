import { useState, useEffect, useRef } from 'react';
import { deliveryPersonsApi, deliveryApi } from '../../../lib/api';

// Declarar tipos para Mapbox GL
declare global {
  interface Window {
    mapboxgl: any;
  }
}

interface DeliveryPerson {
  id: string;
  name: string;
  phone: string;
  username?: string;
  is_active: boolean;
  current_order_id?: string;
  current_order?: {
    id: string;
    order_number: string;
    customer_name: string;
    customer_address: string;
    total: number;
    delivery_code?: string;
  };
  total_deliveries: number;
  balance: number;
  last_lat?: number;
  last_lng?: number;
  last_seen_at?: string;
  created_at: string;
}


interface BalanceTransaction {
  id: string;
  type: string;
  amount: number;
  reference?: string;
  created_at: string;
  order_id?: string;
}

export default function DeliveryPersonsManagement() {
  const [activeTab, setActiveTab] = useState<'map' | 'list' | 'balances'>('map');
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', phone: '', username: '', password: '' });
  const [selectedDriver, setSelectedDriver] = useState<DeliveryPerson | null>(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadData(true); // Carga inicial con loading
    
    // Solo actualizar automáticamente si no hay modales abiertos y no está interactuando
    updateIntervalRef.current = setInterval(() => {
      if (!showBalanceModal && !isUserInteractingRef.current && !isCreating) {
        loadData(false); // Actualización silenciosa
      }
    }, 10000); // Cada 10 segundos en lugar de 5
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [showBalanceModal, isCreating]);

  // Inicializar mapa
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    // Cargar Mapbox GL JS
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.onload = () => {
      const link = document.createElement('link');
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      if (window.mapboxgl) {
        window.mapboxgl.accessToken = "pk.eyJ1IjoiZWxidWVubWVudSIsImEiOiJjbWdqMnRwZWMwZ2FvMmtuMjFvMGR1NXNiIn0.7ACTVWHp6JJ6l5kY5O3GzQ";
        
        const map = new window.mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-58.3816, -34.6037], // Buenos Aires
          zoom: 12
        });

        mapRef.current = map;
        updateMapMarkers();
      }
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [activeTab]);

  // Actualizar markers del mapa
  const updateMapMarkers = () => {
    if (!mapRef.current || !window.mapboxgl) return;

    // Limpiar markers anteriores
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    // Agregar markers de repartidores
    deliveryPersons.forEach(driver => {
      if (driver.last_lat && driver.last_lng) {
        const isOnline = driver.last_seen_at && 
          (Date.now() - new Date(driver.last_seen_at).getTime()) < 60000; // Online si visto en último minuto
        
        const color = isOnline 
          ? (driver.current_order_id ? '#f59e0b' : '#10b981') // Amarillo si ocupado, verde si disponible
          : '#6b7280'; // Gris si offline

        const marker = new window.mapboxgl.Marker({ color })
          .setLngLat([driver.last_lng, driver.last_lat])
          .setPopup(new window.mapboxgl.Popup().setHTML(`
            <div class="p-2">
              <p class="font-semibold">${driver.name}</p>
              <p class="text-sm text-gray-600">${driver.phone}</p>
              <p class="text-xs mt-1">
                ${isOnline ? '🟢 Online' : '⚫ Offline'}
                ${driver.current_order_id ? ' | 🟡 Ocupado' : ' | ✅ Disponible'}
              </p>
              <p class="text-xs mt-1">Saldo: $${driver.balance?.toLocaleString('es-AR') || '0'}</p>
              <button 
                onclick="window.selectDriver('${driver.id}')"
                class="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                Ver detalles
              </button>
            </div>
          `))
          .addTo(mapRef.current);

        markersRef.current.set(driver.id, marker);
      }
    });
  };

  useEffect(() => {
    if (activeTab === 'map' && mapRef.current) {
      updateMapMarkers();
    }
  }, [deliveryPersons, activeTab]);

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const [persons, driversLocation] = await Promise.all([
        deliveryPersonsApi.getAll(),
        deliveryApi.getDriversLocation()
      ]);

      // Actualizar ubicaciones desde driversLocation
      const locationMap = new Map(
        driversLocation.map((d: any) => [d.id, d])
      );
      
      const updatedPersons = persons.map((p: DeliveryPerson) => {
        const location = locationMap.get(p.id);
        return {
          ...p,
          last_lat: location?.last_lat,
          last_lng: location?.last_lng,
          last_seen_at: location?.last_seen_at,
          balance: location?.balance || p.balance || 0
        };
      });
      
      // Solo actualizar si los datos realmente cambiaron (evitar re-renders innecesarios)
      setDeliveryPersons(prevPersons => {
        // Comparar si hay cambios significativos
        const hasChanges = updatedPersons.length !== prevPersons.length ||
          updatedPersons.some((p, i) => {
            const prev = prevPersons[i];
            return !prev || 
              p.last_lat !== prev.last_lat || 
              p.last_lng !== prev.last_lng ||
              p.balance !== prev.balance ||
              p.current_order_id !== prev.current_order_id;
          });
        
        return hasChanges ? updatedPersons : prevPersons;
      });
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreate = async () => {
    // Validar campos
    if (!newPerson.name || !newPerson.phone || !newPerson.username || !newPerson.password) {
      alert('Por favor completa todos los campos');
      return;
    }

    // Validar longitud mínima de contraseña
    if (newPerson.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Validar formato de usuario
    if (!/^[a-zA-Z0-9_]+$/.test(newPerson.username)) {
      alert('El usuario solo puede contener letras, números y guiones bajos');
      return;
    }

    // Validar y formatear teléfono
    let cleanPhone = newPerson.phone.replace(/[^\d]/g, ''); // Solo números
    
    // Si no tiene prefijo, agregar +54 para Argentina
    if (!cleanPhone.startsWith('54')) {
      // Si empieza con 0, quitarlo y agregar 54
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '54' + cleanPhone.substring(1);
      } else if (cleanPhone.length === 10) {
        // Si tiene 10 dígitos, asumir que es argentino sin prefijo
        cleanPhone = '54' + cleanPhone;
      }
    }
    
    // Validar longitud final
    if (cleanPhone.length < 12 || cleanPhone.length > 15) {
      alert('El teléfono debe tener entre 10 y 13 dígitos (sin contar el prefijo +54)');
      return;
    }

    try {
      isUserInteractingRef.current = true;
      setIsCreating(true);
      
      // Enviar datos al backend con formato +XXXXXXXXX
      await deliveryPersonsApi.create({
        name: newPerson.name.trim(),
        phone: `+${cleanPhone}`,
        username: newPerson.username.trim(),
        password: newPerson.password
      });
      
      // Limpiar formulario
      setNewPerson({ name: '', phone: '', username: '', password: '' });
      
      // Recargar datos
      await loadData(true);
      
      alert('✅ Repartidor creado exitosamente');
    } catch (error: any) {
      console.error('Error creating delivery person:', error);
      const errorMessage = error.message || error.error || 'Error al crear repartidor';
      alert(`❌ ${errorMessage}`);
    } finally {
      setIsCreating(false);
      isUserInteractingRef.current = false;
    }
  };


  const handleToggleActive = async (person: DeliveryPerson) => {
    try {
      isUserInteractingRef.current = true;
      await deliveryPersonsApi.update(person.id, {
        is_active: !person.is_active
      });
      await loadData(true);
    } catch (error) {
      console.error('Error updating delivery person:', error);
      alert('Error al actualizar repartidor');
    } finally {
      isUserInteractingRef.current = false;
    }
  };

  const handleDelete = async (person: DeliveryPerson) => {
    if (person.current_order_id) {
      alert('No se puede eliminar un repartidor con pedidos activos');
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar a ${person.name}?`)) {
      return;
    }

    try {
      isUserInteractingRef.current = true;
      // Aquí deberías tener un endpoint DELETE
      // Por ahora, solo desactivar
      await deliveryPersonsApi.update(person.id, { is_active: false });
      await loadData(true);
      alert('Repartidor eliminado');
    } catch (error) {
      console.error('Error deleting delivery person:', error);
      alert('Error al eliminar repartidor');
    } finally {
      isUserInteractingRef.current = false;
    }
  };

  const handleViewBalance = async (driver: DeliveryPerson) => {
    isUserInteractingRef.current = true;
    setSelectedDriver(driver);
    try {
      const balanceData = await deliveryApi.getBalance(driver.id);
      setBalanceTransactions(balanceData.transactions || []);
      setShowBalanceModal(true);
    } catch (error) {
      console.error('Error cargando saldo:', error);
      alert('Error al cargar información de saldo');
    } finally {
      // No resetear el flag aquí porque el modal está abierto
    }
  };

  const handleRegisterPayment = async () => {
    if (!selectedDriver || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    try {
      isUserInteractingRef.current = true;
      await deliveryApi.registerPayment(
        selectedDriver.id,
        parseFloat(paymentAmount),
        paymentReference || undefined
      );
      setPaymentAmount('');
      setPaymentReference('');
      await loadData(true);
      if (selectedDriver) {
        const balanceData = await deliveryApi.getBalance(selectedDriver.id);
        setBalanceTransactions(balanceData.transactions || []);
      }
      alert('Pago registrado exitosamente');
    } catch (error: any) {
      console.error('Error registrando pago:', error);
      alert(error.message || 'Error al registrar pago');
    } finally {
      isUserInteractingRef.current = false;
    }
  };

  // Exponer función global para seleccionar driver desde popup
  useEffect(() => {
    (window as any).selectDriver = (driverId: string) => {
      isUserInteractingRef.current = true;
      const driver = deliveryPersons.find(d => d.id === driverId);
      if (driver) {
        setSelectedDriver(driver);
        setActiveTab('list');
      }
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 2000);
    };
  }, [deliveryPersons]);

  if (loading && deliveryPersons.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-500">Cargando repartidores...</p>
        </div>
      </div>
    );
  }

  const onlineDrivers = deliveryPersons.filter(d => 
    d.is_active && d.last_seen_at && 
    (Date.now() - new Date(d.last_seen_at).getTime()) < 60000
  );
  const totalPendingBalance = deliveryPersons.reduce((sum, d) => sum + (d.balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">REPARTIDORES</h2>
            <p className="text-sm text-[#C7C7C7]">Administra repartidores, asigna pedidos y gestiona saldos</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-white border border-[#C7C7C7] text-[#111111] px-4 py-2 rounded-sm text-xs font-medium">
              {onlineDrivers.length} online
            </div>
            <div className="bg-white border border-[#C7C7C7] text-[#111111] px-4 py-2 rounded-sm text-xs font-medium">
              ${totalPendingBalance.toLocaleString('es-AR')} pendiente
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('map')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'map'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🗺️ Mapa
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'list'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 Lista
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'balances'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            💰 Saldos
          </button>
        </nav>
      </div>

      {/* Contenido según tab */}
      {activeTab === 'map' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-[600px]" />
        </div>
      )}

      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* Crear nuevo repartidor */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Nuevo Repartidor</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Nombre"
                value={newPerson.name}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <input
                type="tel"
                placeholder="Teléfono"
                value={newPerson.phone}
                onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <input
                type="text"
                placeholder="Usuario"
                value={newPerson.username}
                onChange={(e) => setNewPerson({ ...newPerson, username: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={newPerson.password}
                onChange={(e) => setNewPerson({ ...newPerson, password: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creando...' : 'Crear Repartidor'}
            </button>
          </div>

          {/* Lista de repartidores */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Repartidores</h3>
            <div className="grid gap-4">
              {deliveryPersons.map((person) => (
                <div key={person.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        person.is_active ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <span className="text-xl">
                          {person.is_active ? '🟢' : '⚫'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800 text-lg">{person.name}</h3>
                        <p className="text-sm text-gray-500">{person.phone}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {person.total_deliveries} entregas | Saldo: ${(person.balance || 0).toLocaleString('es-AR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleViewBalance(person)}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                      >
                        Ver Saldo
                      </button>
                      <button
                        onClick={() => handleToggleActive(person)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          person.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {person.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        onClick={() => handleDelete(person)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Pedido actual */}
                  {person.current_order && (
                    <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="font-medium text-orange-800">Pedido en curso</p>
                      <p className="text-sm text-orange-700">
                        {person.current_order.order_number} - {person.current_order.customer_name}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'balances' && (
        <div className="space-y-6">
          {deliveryPersons.map((person) => (
            <div key={person.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg text-gray-800">{person.name}</h3>
                  <p className="text-sm text-gray-600">{person.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Saldo actual</p>
                  <p className="text-2xl font-bold text-gray-800">
                    ${(person.balance || 0).toLocaleString('es-AR')}
                  </p>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => handleViewBalance(person)}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Ver Historial
                </button>
                <button
                  onClick={() => {
                    setSelectedDriver(person);
                    setShowBalanceModal(true);
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Registrar Pago
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de saldo */}
      {showBalanceModal && selectedDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">
                Saldo de {selectedDriver.name}
              </h3>
              <button
                onClick={() => {
                  isUserInteractingRef.current = false;
                  setShowBalanceModal(false);
                  setSelectedDriver(null);
                  setPaymentAmount('');
                  setPaymentReference('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-1">Saldo actual</p>
              <p className="text-3xl font-bold text-blue-700">
                ${(selectedDriver.balance || 0).toLocaleString('es-AR')}
              </p>
            </div>

            {/* Registrar pago */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-3">Registrar Pago</h4>
              <div className="space-y-3">
                <input
                  type="number"
                  placeholder="Monto pagado"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Referencia (opcional)"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleRegisterPayment}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Registrar Pago
                </button>
              </div>
            </div>

            {/* Historial */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Historial de Movimientos</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {balanceTransactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay movimientos registrados</p>
                ) : (
                  balanceTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">
                          {transaction.type === 'delivery' ? '🚚 Entrega' :
                           transaction.type === 'pago_admin' ? '💰 Pago' :
                           '📝 Ajuste'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {transaction.reference || 'Sin referencia'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(transaction.created_at).toLocaleString('es-AR')}
                        </p>
                      </div>
                      <p className={`font-bold ${
                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.amount > 0 ? '+' : ''}${transaction.amount.toLocaleString('es-AR')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
