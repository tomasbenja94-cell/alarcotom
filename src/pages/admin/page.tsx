import { useState, useEffect, useRef } from 'react';
import OrdersManagement from './components/OrdersManagement';
import TransfersPending from './components/TransfersPending';
import CustomersManagement from './components/CustomersManagement';
import MenuManagement from './components/MenuManagement';
import DeliveryPersonsManagement from './components/DeliveryPersonsManagement';
import EmployeesManagement from './components/EmployeesManagement';
import SuppliersManagement from './components/SuppliersManagement';
import ReportsManagement from './components/ReportsManagement';
import PaymentConfig from './components/PaymentConfig';
import SystemConfig from './components/SystemConfig';
import BotMessagesManager from './components/BotMessagesManager';
import SalesDashboard from './components/SalesDashboard';
import SalesManagement from './components/SalesManagement';
import DailyCash from './components/DailyCash';
import StockManagement from './components/StockManagement';
import BusinessExpenses from './components/BusinessExpenses';
import DailyCostAnalysis from './components/DailyCostAnalysis';
import CustomerLoyalty from './components/CustomerLoyalty';
import ProductLabels from './components/ProductLabels';
import LoyaltyManagement from './components/LoyaltyManagement';
import PromoCodeManagement from './components/PromoCodeManagement';
import { adminApi } from '../../lib/api';
import NoStockButton from './components/NoStockButton';
import DailyChecklist from './components/DailyChecklist';
import NotificationsBell from './components/NotificationsBell';
import PeakDemandMode from './components/PeakDemandMode';
import SpecialHoursButton from './components/SpecialHoursButton';
import LoadingScreen from './components/LoadingScreen';
import AdminTutorial from './components/AdminTutorial';
import PendingWebOrders from './components/PendingWebOrders';

// Advanced menu items for the sidebar
interface AdvancedMenuItem {
  id: string;
  label: string;
  icon: string;
  component: React.ComponentType;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'transfers' | 'customers' | 'menu-admin' | 'pending-web'>('orders');
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false);
  const [advancedMenuItem, setAdvancedMenuItem] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const advancedMenuRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string>('');
  const [showLoading, setShowLoading] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  const advancedMenuItems: AdvancedMenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', component: SalesDashboard },
    { id: 'sales', label: 'Ventas', icon: '💰', component: SalesManagement },
    { id: 'menu', label: 'Menú, Stock & Insumos', icon: '🍽️', component: MenuManagement },
    { id: 'cash', label: 'Caja diaria', icon: '💸', component: DailyCash },
    { id: 'cost-analysis', label: 'Costo Real del Día', icon: '📊', component: DailyCostAnalysis },
    { id: 'expenses', label: 'Gastos Reales', icon: '💸', component: BusinessExpenses },
    { id: 'loyalty', label: 'Sistema de Fidelidad', icon: '⭐', component: LoyaltyManagement },
    { id: 'loyalty-customers', label: 'Clientes VIP / Fidelidad', icon: '👥', component: CustomerLoyalty },
    { id: 'promo-codes', label: 'Códigos Promocionales', icon: '🎟️', component: PromoCodeManagement },
    { id: 'labels', label: 'Etiquetas Inteligentes', icon: '🏷️', component: ProductLabels },
    { id: 'employees', label: 'Empleados', icon: '👥', component: EmployeesManagement },
    { id: 'delivery', label: 'Repartidores', icon: '🛵', component: DeliveryPersonsManagement },
    { id: 'suppliers', label: 'Proveedores', icon: '🧑‍🍳', component: SuppliersManagement },
    { id: 'reports', label: 'Reportes', icon: '📊', component: ReportsManagement },
    { id: 'pending-web', label: 'Pedidos Pendientes Web', icon: '⏳', component: PendingWebOrders },
    { id: 'settings', label: 'Configuraciones', icon: '⚙️', component: SystemConfig },
    { id: 'integrations', label: 'Bot WhatsApp / Integraciones', icon: '🤖', component: BotMessagesManager },
  ];

  const getActiveComponent = () => {
    if (activeTab === 'orders') return OrdersManagement;
    if (activeTab === 'transfers') return TransfersPending;
    if (activeTab === 'customers') return CustomersManagement;
    if (activeTab === 'pending-web') return PendingWebOrders;
    if (activeTab === 'menu-admin' && advancedMenuItem) {
      const item = advancedMenuItems.find(m => m.id === advancedMenuItem);
      return item ? item.component : MenuManagement;
    }
    if (activeTab === 'menu-admin') return MenuManagement;
    return OrdersManagement;
  };

  const ActiveComponent = getActiveComponent();

  const handleClearAll = async () => {
    if (clearConfirmText !== 'ELIMINAR TODO') {
      alert('Debes escribir "ELIMINAR TODO" para confirmar');
      return;
    }

    setClearing(true);
    try {
      await adminApi.clearAll();
      alert('✅ Todos los datos han sido eliminados exitosamente.\n\nEl sistema está completamente limpio.');
      setShowClearAllModal(false);
      setClearConfirmText('');
      window.location.reload();
    } catch (error: any) {
      alert(`❌ Error al limpiar los datos: ${error.message || 'Error desconocido'}`);
    } finally {
      setClearing(false);
    }
  };

  const handleAdvancedMenuClick = (itemId: string) => {
    setAdvancedMenuItem(itemId);
    setActiveTab('menu-admin');
    setAdvancedMenuOpen(false);
  };

  // Cerrar el dropdown cuando se hace click fuera
  useEffect(() => {
    // Auth init - Solo verificar autenticación, sin mostrar loading
    try {
      const flag = localStorage.getItem('adminAuth');
      if (flag === 'true') {
        setIsAuthenticated(true);
        // Verificar si debe mostrar el tutorial
        const tutorialCompleted = localStorage.getItem('admin_tutorial_completed');
        if (!tutorialCompleted) {
          setShowTutorial(true);
        }
      }
    } catch {}

    const handleClickOutside = (event: MouseEvent) => {
      if (
        advancedMenuRef.current &&
        !advancedMenuRef.current.contains(event.target as Node) &&
        advancedMenuOpen
      ) {
        setAdvancedMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [advancedMenuOpen]);


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'adminroti123') {
      try {
        localStorage.setItem('adminAuth', 'true');
      } catch {}
      setShowLoading(true);
      setLoginError('');
      return;
    }
    setLoginError('Credenciales inválidas');
  };

  const handleLoadingComplete = () => {
    setShowLoading(false);
    setIsAuthenticated(true);
    // Verificar si debe mostrar el tutorial después del login
    const tutorialCompleted = localStorage.getItem('admin_tutorial_completed');
    if (!tutorialCompleted) {
      setShowTutorial(true);
    }
  };

  const handleTutorialComplete = () => {
    setShowTutorial(false);
  };

  const handleTutorialSkip = () => {
    setShowTutorial(false);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('adminAuth');
    } catch {}
    setIsAuthenticated(false);
  };

  // Pantalla de carga
  if (showLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF9E6] via-white to-[#FFF9E6] px-4">
        <div className="w-full max-w-md bg-white border-2 border-[#FFC300] rounded-2xl p-8 shadow-2xl">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-[#111111] to-[#2A2A2A] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-3xl font-bold">BM</span>
            </div>
            <h2 className="text-3xl font-bold text-[#111111] mb-2">Panel Administrativo</h2>
            <p className="text-sm text-[#666]">Ingresa tus credenciales para continuar</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#111111] mb-2">👤 Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border-2 border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-[#111111]"
                placeholder="admin"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#111111] mb-2">🔒 Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-[#111111]"
                placeholder="********"
              />
            </div>
            {loginError && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-600 flex items-center space-x-2">
                <span>❌</span>
                <span>{loginError}</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-[#111111] to-[#2A2A2A] hover:from-[#2A2A2A] hover:to-[#111111] text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              🚀 Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tutorial Modal */}
      {showTutorial && isAuthenticated && (
        <AdminTutorial onComplete={handleTutorialComplete} onSkip={handleTutorialSkip} />
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#FFF9E6] via-white to-[#FFF9E6] relative" style={{ 
        position: 'relative'
      }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            {/* Logo y Nombre */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-500 rounded-lg flex items-center justify-center shadow-md">
                <span className="text-white text-xl font-bold">BM</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">El Buen Menú</h1>
                <p className="text-xs text-gray-500">Panel de Administración</p>
              </div>
            </div>

            {/* Navegación Principal */}
            <nav className="flex items-center space-x-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => {
                  setActiveTab('orders');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2.5 text-sm font-semibold transition-all rounded-lg flex items-center space-x-2 ${
                  activeTab === 'orders'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>📦</span>
                <span>PEDIDOS</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('transfers');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2.5 text-sm font-semibold transition-all rounded-lg flex items-center space-x-2 ${
                  activeTab === 'transfers'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>💳</span>
                <span>TRANSFERENCIAS</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('customers');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2.5 text-sm font-semibold transition-all rounded-lg flex items-center space-x-2 ${
                  activeTab === 'customers'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>👥</span>
                <span>CLIENTES</span>
              </button>
              <div className="relative" ref={advancedMenuRef}>
                <button
                  onClick={() => setAdvancedMenuOpen(!advancedMenuOpen)}
                  className={`px-6 py-2.5 text-sm font-semibold transition-all rounded-lg flex items-center space-x-2 ${
                    activeTab === 'menu-admin'
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>⚙️</span>
                  <span>MÁS</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${advancedMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Advanced Menu Dropdown */}
                {advancedMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-[650px] bg-white border border-gray-200 shadow-xl rounded-lg z-50 max-h-[80vh] overflow-y-auto">
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-2">
                        {advancedMenuItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleAdvancedMenuClick(item.id)}
                            className={`px-5 py-4 text-left text-sm font-semibold rounded-lg transition-all flex items-center space-x-3 hover:bg-gray-50 ${
                              advancedMenuItem === item.id 
                                ? 'bg-orange-50 border-2 border-orange-500 text-orange-700' 
                                : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
                            }`}
                          >
                            <span className="text-2xl">{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* Acciones del Header - Más organizadas */}
            <div className="flex items-center space-x-2">
              {/* Checklist - Principal y visible */}
              <DailyChecklist />
              
              {/* Sin Stock */}
              <NoStockButton />
              
              {/* Horario Especial */}
              <SpecialHoursButton />
              
              {/* Modo Lluvia / Pico de Demanda */}
              <PeakDemandMode />
              
              {/* Notificaciones */}
              <NotificationsBell />
              
              {/* Ver Tutorial */}
              <button
                onClick={() => {
                  localStorage.removeItem('admin_tutorial_completed');
                  setShowTutorial(true);
                }}
                className="px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-blue-300 hover:border-blue-400"
                title="Ver tutorial del panel"
              >
                📚 Ayuda
              </button>
              
              {/* Limpiar Todo */}
              <button
                onClick={() => setShowClearAllModal(true)}
                className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-all border border-red-300 hover:border-red-400"
              >
                🗑️ Limpiar
              </button>
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-all shadow-md hover:shadow-lg"
                title="Cerrar sesión"
              >
                🚪 Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto px-6 py-6">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <ActiveComponent />
        </div>
      </main>


      {/* Modal de Limpieza Total - Mejorado */}
      {showClearAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg border-2 border-red-300">
            <div className="text-center mb-6">
              <div className="mb-4">
                <div className="w-20 h-20 bg-red-100 rounded-full mx-auto flex items-center justify-center">
                  <span className="text-5xl">⚠️</span>
                </div>
              </div>
              <h3 className="text-3xl font-bold text-[#111111] mb-2">
                Limpieza Total del Sistema
              </h3>
              <p className="text-sm text-[#666] mb-4">
                Esta acción eliminará <strong className="text-red-600 text-lg">TODO</strong> permanentemente:
              </p>
              <div className="border-2 border-red-200 rounded-xl p-5 text-left mb-4 bg-red-50">
                <ul className="text-sm text-[#111111] space-y-2 font-medium">
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todos los pedidos</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todos los repartidores</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todos los clientes</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todas las transacciones</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todos los mensajes</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todas las transferencias</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span>❌</span>
                    <span>Todos los registros de movimiento</span>
                  </li>
                </ul>
                <div className="mt-4 p-3 bg-red-100 rounded-lg border border-red-300">
                  <p className="text-red-700 font-bold text-center text-sm">
                    ⚠️ Esta acción NO se puede deshacer
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#666] mb-4 font-semibold">
                Escribe <strong className="text-red-600 text-lg">"ELIMINAR TODO"</strong> para confirmar:
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
                className="w-full px-4 py-4 border-2 border-[#C7C7C7] rounded-xl focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all text-center font-bold uppercase tracking-wider text-[#111111] text-lg"
                autoFocus
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowClearAllModal(false);
                  setClearConfirmText('');
                }}
                className="flex-1 bg-[#F9F9F9] hover:bg-[#E9E9E9] text-[#111111] font-bold py-3 rounded-xl transition-all border-2 border-[#C7C7C7] hover:border-[#999] transform hover:scale-[1.02]"
              >
                ✖️ Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing || clearConfirmText !== 'ELIMINAR TODO'}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none"
              >
                {clearing ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Eliminando...</span>
                  </span>
                ) : (
                  '🗑️ Eliminar Todo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
