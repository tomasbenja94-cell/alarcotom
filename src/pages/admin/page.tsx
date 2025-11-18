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

// Advanced menu items for the sidebar
interface AdvancedMenuItem {
  id: string;
  label: string;
  icon: string;
  component: React.ComponentType;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'transfers' | 'customers' | 'menu-admin'>('orders');
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false);
  const [advancedMenuItem, setAdvancedMenuItem] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const advancedMenuRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string>('');

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
    { id: 'settings', label: 'Configuraciones', icon: '⚙️', component: PaymentConfig },
    { id: 'integrations', label: 'Bot WhatsApp / Integraciones', icon: '🤖', component: BotMessagesManager },
  ];

  const getActiveComponent = () => {
    if (activeTab === 'orders') return OrdersManagement;
    if (activeTab === 'transfers') return TransfersPending;
    if (activeTab === 'customers') return CustomersManagement;
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
    // Auth init
    try {
      const flag = localStorage.getItem('adminAuth');
      setIsAuthenticated(flag === 'true');
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
      setIsAuthenticated(true);
      setLoginError('');
      return;
    }
    setLoginError('Credenciales inválidas');
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('adminAuth');
    } catch {}
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9F9] px-4">
        <div className="w-full max-w-sm bg-white border border-[#E5E5E5] rounded-sm p-6 shadow-sm">
          <div className="mb-6 text-center">
            <div className="w-12 h-12 bg-[#111111] rounded-sm mx-auto flex items-center justify-center mb-3">
              <span className="text-white text-lg font-bold">BM</span>
            </div>
            <h2 className="text-xl font-bold text-[#111111]">Panel Administrativo</h2>
            <p className="text-xs text-[#9CA3AF] mt-1">Acceso restringido</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-[#111111] mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#FFC300]"
                placeholder="admin"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-[#111111] mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E5E5] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#FFC300]"
                placeholder="********"
              />
            </div>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 rounded-sm transition-all border border-[#111111]"
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Premium Header - Minimalista */}
      <header className="bg-white border-b border-[#C7C7C7] sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo y Nombre */}
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-[#111111] rounded-sm flex items-center justify-center">
                <span className="text-white text-lg font-bold">BM</span>
              </div>
              <h1 className="text-xl font-bold text-[#111111] tracking-tight">El Buen Menú</h1>
            </div>

            {/* Navegación Principal - Solo opciones diarias */}
            <nav className="flex items-center space-x-1">
              <button
                onClick={() => {
                  setActiveTab('orders');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2 text-sm font-medium transition-all ${
                  activeTab === 'orders'
                    ? 'text-[#111111] border-b-2 border-[#FFC300]'
                    : 'text-[#C7C7C7] hover:text-[#111111]'
                }`}
              >
                PEDIDOS
              </button>
              <span className="text-[#C7C7C7]">|</span>
              <button
                onClick={() => {
                  setActiveTab('transfers');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2 text-sm font-medium transition-all ${
                  activeTab === 'transfers'
                    ? 'text-[#111111] border-b-2 border-[#FFC300]'
                    : 'text-[#C7C7C7] hover:text-[#111111]'
                }`}
              >
                TRANSFERENCIAS
              </button>
              <span className="text-[#C7C7C7]">|</span>
              <button
                onClick={() => {
                  setActiveTab('customers');
                  setAdvancedMenuOpen(false);
                  setAdvancedMenuItem(null);
                }}
                className={`px-6 py-2 text-sm font-medium transition-all ${
                  activeTab === 'customers'
                    ? 'text-[#111111] border-b-2 border-[#FFC300]'
                    : 'text-[#C7C7C7] hover:text-[#111111]'
                }`}
              >
                CLIENTES
              </button>
              <span className="text-[#C7C7C7]">|</span>
              <div className="relative" ref={advancedMenuRef}>
                <button
                  onClick={() => setAdvancedMenuOpen(!advancedMenuOpen)}
                  className={`px-6 py-2 text-sm font-medium transition-all flex items-center space-x-2 ${
                    activeTab === 'menu-admin'
                      ? 'text-[#111111] border-b-2 border-[#FFC300]'
                      : 'text-[#C7C7C7] hover:text-[#111111]'
                  }`}
                >
                  <span>MENU ADMIN</span>
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
                  <div className="absolute top-full right-0 mt-2 w-[600px] bg-white border border-[#FFC300] shadow-lg rounded-sm z-50 max-h-[80vh] overflow-y-auto">
                    <div className="py-2">
                      <div className="grid grid-cols-2 gap-0">
                        {advancedMenuItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleAdvancedMenuClick(item.id)}
                            className={`px-6 py-3 text-left text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] transition-all flex items-center space-x-3 ${
                              advancedMenuItem === item.id ? 'bg-[#FFF9E6] border-l-2 border-[#FFC300]' : ''
                            }`}
                          >
                            <span className="text-base">{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* Acciones del Header */}
            <div className="flex items-center space-x-3">
              {/* Checklist - Principal y visible */}
              <DailyChecklist />
              
              {/* Sin Stock - Reemplaza IP blocker */}
              <NoStockButton />
              
              {/* Horario Especial */}
              <SpecialHoursButton />
              
              {/* Modo Lluvia / Pico de Demanda */}
              <PeakDemandMode />
              
              {/* Notificaciones */}
              <NotificationsBell />
              
              {/* Limpiar Todo */}
              <button
                onClick={() => setShowClearAllModal(true)}
                className="px-4 py-2 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded transition-all border border-[#C7C7C7]"
              >
                🗑️ Limpiar Todo
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-medium text-white bg-[#111111] hover:bg-[#1A1A1A] rounded transition-all border border-[#111111]"
                title="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto px-8 py-8">
        <ActiveComponent />
      </main>

      {/* Modal de Limpieza Total */}
      {showClearAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-md border border-[#FFC300]">
            <div className="text-center mb-6">
              <div className="mb-4">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-2xl font-bold text-[#111111] mb-2">
                Limpieza Total del Sistema
              </h3>
              <p className="text-sm text-[#C7C7C7] mb-4">
                Esta acción eliminará <strong className="text-[#111111]">TODO</strong> permanentemente:
              </p>
              <div className="border border-[#C7C7C7] rounded-sm p-4 text-left mb-4 bg-[#F9F9F9]">
                <ul className="text-sm text-[#111111] space-y-2">
                  <li>❌ Todos los pedidos</li>
                  <li>❌ Todos los repartidores</li>
                  <li>❌ Todos los clientes</li>
                  <li>❌ Todas las transacciones</li>
                  <li>❌ Todos los mensajes</li>
                  <li>❌ Todas las transferencias</li>
                  <li>❌ Todos los registros de movimiento</li>
                </ul>
                <p className="text-[#111111] font-bold mt-3 text-center text-xs">
                  ⚠️ Esta acción NO se puede deshacer
                </p>
              </div>
              <p className="text-xs text-[#C7C7C7] mb-4">
                Escribe <strong className="text-[#111111]">"ELIMINAR TODO"</strong> para confirmar:
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
                className="w-full px-4 py-3 border-2 border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-center font-bold uppercase tracking-wider text-[#111111]"
                autoFocus
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowClearAllModal(false);
                  setClearConfirmText('');
                }}
                className="flex-1 bg-[#F9F9F9] hover:bg-[#E9E9E9] text-[#111111] font-medium py-3 rounded-sm transition-all border border-[#C7C7C7]"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing || clearConfirmText !== 'ELIMINAR TODO'}
                className="flex-1 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-3 rounded-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#111111]"
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
  );
}
