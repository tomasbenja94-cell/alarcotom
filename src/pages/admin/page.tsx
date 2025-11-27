import { useState, useEffect } from 'react';
import OrdersManagement from './components/OrdersManagement';
import TransfersPending from './components/TransfersPending';
import CustomersManagement from './components/CustomersManagement';
import MenuManagement from './components/MenuManagement';
import LoadingScreen from './components/LoadingScreen';
import AdminTutorial from './components/AdminTutorial';
import SystemConfig from './components/SystemConfig';
import SalesDashboard from './components/SalesDashboard';
import DailyCash from './components/DailyCash';
import ReportsManagement from './components/ReportsManagement';
import StockManagement from './components/StockManagement';
// DeliveryPersonsManagement removido - solo disponible para superadmin
import PaymentConfig from './components/PaymentConfig';
import BotMessagesManager from './components/BotMessagesManager';
import StoreSettings from './components/StoreSettings';
import StoreConfigPanel from './components/StoreConfigPanel';
import WhatsAppControlPanel from './components/WhatsAppControlPanel';
import StoreSetupWizard from './components/StoreSetupWizard';
import StoreCategoriesManagement from './components/StoreCategoriesManagement';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pedidos' | 'transferencias' | 'clientes' | 'menu'>('pedidos');
  const [showAdvancedMenu, setShowAdvancedMenu] = useState<boolean>(false);
  const [advancedTab, setAdvancedTab] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string>('');
  const [showLoading, setShowLoading] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [storeCategory, setStoreCategory] = useState<string | null>(null);

  useEffect(() => {
    // Obtener storeId de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('store');
    setCurrentStoreId(storeId);

    // Cargar nombre del store si existe
    if (storeId) {
      loadStoreInfo(storeId);
    }

    // Validar token con el backend
    const validateToken = async () => {
      try {
        const flag = localStorage.getItem('adminAuth');
        const token = localStorage.getItem('adminToken');
        
        if (flag === 'true' && token) {
          // Verificar token con el backend
          const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
          const response = await fetch(`${API_URL}/admin/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            const admin = data.admin;
            
            // VERIFICAR QUE SEA ADMIN (NO SUPERADMIN)
            if (admin.role === 'super_admin') {
              setIsAuthenticated(false);
              localStorage.removeItem('adminAuth');
              localStorage.removeItem('adminToken');
              localStorage.removeItem('adminStoreId');
              localStorage.removeItem('adminRole');
              return;
            }
            
            // Verificar que el admin tenga un store asignado
            if (!admin.storeId) {
              setIsAuthenticated(false);
              localStorage.removeItem('adminAuth');
              localStorage.removeItem('adminToken');
              localStorage.removeItem('adminStoreId');
              localStorage.removeItem('adminRole');
              return;
            }
            
            // Si hay storeId en URL, verificar que coincida
            if (storeId && admin.storeId !== storeId) {
              setIsAuthenticated(false);
              localStorage.removeItem('adminAuth');
              localStorage.removeItem('adminToken');
              localStorage.removeItem('adminStoreId');
              localStorage.removeItem('adminRole');
              return;
            }
            
            // Usar el storeId del admin si no hay uno en la URL
            const finalStoreId = storeId || admin.storeId;
            setCurrentStoreId(finalStoreId);

            // Actualizar datos del admin en localStorage
            localStorage.setItem('adminStoreId', finalStoreId);
            localStorage.setItem('adminRole', 'admin');
            
            setIsAuthenticated(true);
            
            // Si no hay storeId en la URL pero el admin tiene uno, actualizar la URL
            if (!storeId && finalStoreId) {
              window.history.replaceState({}, '', `/admin?store=${finalStoreId}`);
            }
            
            // Cargar información de la tienda
            if (finalStoreId) {
              loadStoreInfo(finalStoreId);
            }
            
            // Verificar si la tienda está vacía para mostrar wizard
            if (finalStoreId) {
              checkIfStoreIsEmpty(finalStoreId);
            }
            
            const tutorialCompleted = localStorage.getItem('admin_tutorial_completed');
            if (!tutorialCompleted) {
              setShowTutorial(true);
            }
          } else {
            // Token inválido, limpiar localStorage
            setIsAuthenticated(false);
            localStorage.removeItem('adminAuth');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminStoreId');
            localStorage.removeItem('adminRole');
          }
        }
      } catch (error) {
        console.error('Error validating token:', error);
        setIsAuthenticated(false);
        localStorage.removeItem('adminAuth');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminStoreId');
        localStorage.removeItem('adminRole');
      }
    };

    validateToken();
  }, []);

  const loadStoreInfo = async (storeId: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const response = await fetch(`${API_URL}/stores/${storeId}`);
      if (response.ok) {
        const store = await response.json();
        setStoreName(store.name || '');
        setStoreCategory(store.category?.name?.toLowerCase() || '');
      }
    } catch (error) {
      console.error('Error loading store info:', error);
    }
  };

  const checkIfStoreIsEmpty = async (storeId: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_URL}/store-settings/${storeId}/is-empty`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.isEmpty) {
          setShowWizard(true);
        }
      }
    } catch (error) {
      console.error('Error checking if store is empty:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    // Obtener storeId de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('store');

    try {
      // Intentar login con la API
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      // Validar que username no esté vacío
      if (!username || username.trim() === '') {
        setLoginError('Por favor, ingresa tu usuario');
        return;
      }

      if (!password) {
        setLoginError('Por favor, ingresa tu contraseña');
        return;
      }

      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        setLoginError(errorData.error || errorData.details?.[0]?.message || 'Error al iniciar sesión');
        return;
      }

      const data = await response.json();
        
      // VERIFICAR QUE SEA ADMIN (NO SUPERADMIN)
        if (data.admin.role === 'super_admin') {
          setLoginError('Los superadministradores deben usar /superadmin para acceder.');
          return;
        }
        
        // Verificar que el admin tenga un store asignado
        if (!data.admin.storeId) {
          setLoginError('Este administrador no tiene una tienda asignada. Contacta al superadministrador.');
          return;
        }
        
        // Si hay storeId en la URL, verificar que coincida
        if (storeId && data.admin.storeId !== storeId) {
          setLoginError(`No tienes acceso a esta tienda. Tu tienda asignada es diferente.`);
          return;
        }
        
        // Si no hay storeId en URL pero el admin tiene uno, usar ese
        const finalStoreId = storeId || data.admin.storeId;
        setCurrentStoreId(finalStoreId);
        
        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('adminToken', data.accessToken);
        localStorage.setItem('adminStoreId', finalStoreId);
        localStorage.setItem('adminRole', 'admin');
        if (data.refreshToken) {
          localStorage.setItem('adminRefreshToken', data.refreshToken);
        }
        
        // Si no hay storeId en la URL, actualizar la URL con el storeId del admin
        if (!storeId && finalStoreId) {
          window.history.replaceState({}, '', `/admin?store=${finalStoreId}`);
        }
        
        // Cargar información de la tienda
        if (finalStoreId) {
          loadStoreInfo(finalStoreId);
        }
        
        setShowLoading(true);
        setLoginError('');
        setIsAuthenticated(true);
        setUsername('');
        setPassword('');
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Error al conectar con el servidor');
    }
  };

  const handleLoadingComplete = () => {
    setShowLoading(false);
    setIsAuthenticated(true);
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

  if (showLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl border border-slate-200">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-lg">
              <i className="ri-store-3-line text-white text-3xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Bienvenido a Negocios App</h2>
            <p className="text-sm text-slate-500">Ingresá para administrar tu comercio</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-base text-slate-800"
                placeholder="Escribe tu usuario"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-base text-slate-800"
                placeholder="Escribe tu contraseña"
              />
            </div>
            {loginError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium text-center">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg text-base"
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  const getActiveComponent = () => {
    const storeId = currentStoreId || localStorage.getItem('adminStoreId');
    if (advancedTab) {
      switch (advancedTab) {
        case 'system': return <SystemConfig />;
        case 'sales': return <SalesDashboard />;
        case 'cash': return <DailyCash />;
        case 'reports': return <ReportsManagement />;
        case 'stock': return <StockManagement />;
        // Repartidores eliminado - solo disponible para superadmin
        case 'payment': return <PaymentConfig />;
        case 'bot-messages': return <BotMessagesManager />;
        case 'whatsapp': return <WhatsAppControlPanel storeId={currentStoreId || localStorage.getItem('adminStoreId') || ''} />;
        case 'settings': return <StoreConfigPanel storeId={currentStoreId || localStorage.getItem('adminStoreId') || ''} />;
        case 'store-categories': return <StoreCategoriesManagement />;
        default: return null;
      }
    }
    if (activeTab === 'pedidos') return <OrdersManagement storeId={storeId} />;
    if (activeTab === 'transferencias') return <TransfersPending storeId={storeId} />;
    if (activeTab === 'clientes') return <CustomersManagement storeId={storeId} />;
    if (activeTab === 'menu') return <MenuManagement storeId={storeId} />;
    return <OrdersManagement storeId={storeId} />;
  };

  const handleAdvancedMenuClick = (tab: string) => {
    setAdvancedTab(tab);
    setShowAdvancedMenu(false);
    setActiveTab('pedidos'); // Reset main tab
  };

  return (
    <>
      {showTutorial && isAuthenticated && (
        <AdminTutorial onComplete={handleTutorialComplete} onSkip={handleTutorialSkip} />
      )}

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
        {/* Header Profesional */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-6">
            <div className="flex items-center justify-between h-16 sm:h-18">
              {/* Botón Volver */}
              {advancedTab && (
                <button
                  onClick={() => {
                    setAdvancedTab(null);
                    setShowAdvancedMenu(false);
                  }}
                  className="mr-3 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                  title="Volver"
                >
                  <i className="ri-arrow-left-line text-slate-600 text-lg"></i>
                </button>
              )}
              {/* Logo y Título */}
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <button
                  onClick={() => {
                    setShowAdvancedMenu(!showAdvancedMenu);
                    if (showAdvancedMenu) {
                      setAdvancedTab(null);
                    }
                  }}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex-shrink-0"
                  title="Menú"
                >
                  <i className="ri-menu-line text-xl"></i>
                </button>
                
                <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                  <i className="ri-store-3-line text-white text-lg"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-sm sm:text-base font-bold text-slate-800 truncate">
                    Panel de Administración
                  </h1>
                  <p className="text-xs text-slate-500 truncate">{storeName || 'Mi Negocio'}</p>
                </div>
              </div>

              {/* Botón Salir */}
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all flex items-center space-x-1"
              >
                <i className="ri-logout-box-line"></i>
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Menú Avanzado Desplegable */}
        {showAdvancedMenu && (
          <div className="bg-white border-b border-slate-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {[
                  { id: 'system', icon: 'ri-settings-3-line', label: 'Sistema' },
                  { id: 'sales', icon: 'ri-bar-chart-line', label: 'Ventas' },
                  { id: 'cash', icon: 'ri-money-dollar-circle-line', label: 'Caja' },
                  { id: 'reports', icon: 'ri-file-chart-line', label: 'Reportes' },
                  { id: 'stock', icon: 'ri-box-3-line', label: 'Stock' },
                  { id: 'payment', icon: 'ri-bank-card-line', label: 'Pagos' },
                  { id: 'bot-messages', icon: 'ri-message-3-line', label: 'Mensajes' },
                  { id: 'whatsapp', icon: 'ri-whatsapp-line', label: 'WhatsApp' },
                  { id: 'settings', icon: 'ri-store-3-line', label: 'Config' },
                  { id: 'store-categories', icon: 'ri-folder-line', label: 'Categorías' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdvancedMenuClick(item.id)}
                    className="flex items-center space-x-2 px-3 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <i className={`${item.icon} text-lg`}></i>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Wizard de Configuración Inicial */}
        {isAuthenticated && currentStoreId && (
          <StoreSetupWizard
            storeId={currentStoreId}
            onComplete={() => setShowWizard(false)}
          />
        )}

        {/* Menú Principal - Tarjetas Modernas */}
        {!advancedTab && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { id: 'pedidos', icon: 'ri-shopping-bag-3-line', label: 'Pedidos', desc: 'Gestionar pedidos', color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50' },
                { id: 'transferencias', icon: 'ri-bank-card-line', label: 'Pagos', desc: 'Aprobar transferencias', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50' },
                { id: 'clientes', icon: 'ri-user-heart-line', label: 'Clientes', desc: 'Ver clientes', color: 'from-blue-500 to-indigo-500', bg: 'bg-blue-50' },
                { id: 'menu', icon: 'ri-restaurant-2-line', label: 'Menú', desc: 'Editar productos', color: 'from-violet-500 to-purple-500', bg: 'bg-violet-50' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as 'pedidos' | 'transferencias' | 'clientes' | 'menu');
                    setAdvancedTab(null);
                  }}
                  className={`group p-4 rounded-2xl transition-all duration-200 ${
                    activeTab === item.id
                      ? `bg-gradient-to-br ${item.color} text-white shadow-lg`
                      : `bg-white hover:shadow-md border border-slate-200 text-slate-700`
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                    activeTab === item.id ? 'bg-white/20' : item.bg
                  }`}>
                    <i className={`${item.icon} text-2xl ${activeTab === item.id ? 'text-white' : 'text-slate-600'}`}></i>
                  </div>
                  <div className={`text-sm font-semibold ${activeTab === item.id ? 'text-white' : 'text-slate-800'}`}>
                    {item.label}
                  </div>
                  <div className={`text-xs mt-0.5 ${activeTab === item.id ? 'text-white/80' : 'text-slate-500'}`}>
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contenido */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
            {getActiveComponent()}
          </div>
        </div>
      </div>
    </>
  );
}
