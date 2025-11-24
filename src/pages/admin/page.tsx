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
import DeliveryPersonsManagement from './components/DeliveryPersonsManagement';
import PaymentConfig from './components/PaymentConfig';
import BotMessagesManager from './components/BotMessagesManager';
import StoreSettings from './components/StoreSettings';
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-yellow-50 px-4">
        <div className="w-full max-w-md bg-white border-4 border-orange-400 rounded-3xl p-10 shadow-2xl">
          <div className="mb-8 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-lg">
              <span className="text-white text-4xl font-bold">🍔</span>
            </div>
            <h2 className="text-4xl font-bold text-gray-800 mb-3">El Buen Menú</h2>
            <p className="text-lg text-gray-600">Panel de Administración</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xl font-bold text-gray-800 mb-3">👤 Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-6 py-4 border-4 border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-orange-400 focus:border-orange-500 text-xl text-gray-800 font-semibold"
                placeholder="Escribe tu usuario"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xl font-bold text-gray-800 mb-3">🔒 Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 border-4 border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-orange-400 focus:border-orange-500 text-xl text-gray-800 font-semibold"
                placeholder="Escribe tu contraseña"
              />
            </div>
            {loginError && (
              <div className="bg-red-100 border-4 border-red-400 rounded-2xl p-4 text-lg text-red-700 font-bold text-center">
                ❌ {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-5 rounded-2xl transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 text-2xl"
            >
              🚀 ENTRAR
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
        case 'delivery': return <DeliveryPersonsManagement />;
        case 'payment': return <PaymentConfig />;
        case 'bot-messages': return <BotMessagesManager />;
        case 'settings': return <StoreSettings storeId={currentStoreId || localStorage.getItem('adminStoreId')} />;
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

      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
        {/* Header Súper Simple */}
        <header className="bg-white border-b-4 border-orange-400 sticky top-0 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo y Menú */}
              <div className="flex items-center space-x-3">
                {/* Botón Menú Hamburger */}
                <button
                  onClick={() => {
                    setShowAdvancedMenu(!showAdvancedMenu);
                    if (showAdvancedMenu) {
                      setAdvancedTab(null);
                    }
                  }}
                  className="p-2 text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                  title="Menú avanzado"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                
                <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-md">
                  <i className="ri-restaurant-line text-white text-2xl"></i>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">El Buen Menú</h1>
                  <p className="text-xs text-gray-600">Panel de Administración</p>
                </div>
              </div>

              {/* Botón Salir */}
              <button
                onClick={handleLogout}
                className="px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:scale-105"
              >
                <i className="ri-logout-box-line mr-1"></i>
                SALIR
              </button>
            </div>
          </div>
        </header>

        {/* Menú Avanzado Desplegable */}
        {showAdvancedMenu && (
          <div className="bg-white border-b-4 border-gray-300 shadow-lg z-30">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                <button
                  onClick={() => handleAdvancedMenuClick('system')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-settings-3-line"></i>
                  <span>Sistema</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('sales')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-bar-chart-line"></i>
                  <span>Ventas</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('cash')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-money-dollar-circle-line"></i>
                  <span>Caja Diaria</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('reports')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-file-chart-line"></i>
                  <span>Reportes</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('stock')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-box-3-line"></i>
                  <span>Stock</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('delivery')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-truck-line"></i>
                  <span>Repartidores</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('payment')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-bank-card-line"></i>
                  <span>Pagos</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('bot-messages')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-message-3-line"></i>
                  <span>Mensajes Bot</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('settings')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-store-settings-line"></i>
                  <span>Configuración</span>
                </button>
                <button
                  onClick={() => handleAdvancedMenuClick('store-categories')}
                  className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-gray-700 flex items-center space-x-1"
                >
                  <i className="ri-folder-line"></i>
                  <span>Categorías</span>
                </button>
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

        {/* Menú Principal - 4 Botones (Más Pequeños) */}
        {!advancedTab && (
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <button
                onClick={() => {
                  setActiveTab('pedidos');
                  setAdvancedTab(null);
                }}
                className={`p-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 ${
                  activeTab === 'pedidos'
                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white border-2 border-orange-700'
                    : 'bg-white text-gray-800 border-2 border-gray-300 hover:border-orange-400'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center">
                    <i className="ri-shopping-bag-line text-white text-3xl"></i>
                  </div>
                </div>
                <div className="text-lg font-bold">PEDIDOS</div>
                <div className="text-xs mt-1 opacity-80">Ver y gestionar pedidos</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab('transferencias');
                  setAdvancedTab(null);
                }}
                className={`p-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 ${
                  activeTab === 'transferencias'
                    ? 'bg-gradient-to-br from-green-500 to-green-600 text-white border-2 border-green-700'
                    : 'bg-white text-gray-800 border-2 border-gray-300 hover:border-green-400'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                    <i className="ri-bank-card-line text-white text-3xl"></i>
                  </div>
                </div>
                <div className="text-lg font-bold">TRANSFERENCIAS</div>
                <div className="text-xs mt-1 opacity-80">Aprobar pagos</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab('clientes');
                  setAdvancedTab(null);
                }}
                className={`p-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 ${
                  activeTab === 'clientes'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-2 border-blue-700'
                    : 'bg-white text-gray-800 border-2 border-gray-300 hover:border-blue-400'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                    <i className="ri-user-group-line text-white text-3xl"></i>
                  </div>
                </div>
                <div className="text-lg font-bold">CLIENTES</div>
                <div className="text-xs mt-1 opacity-80">Ver clientes</div>
              </button>

              <button
                onClick={() => {
                  setActiveTab('menu');
                  setAdvancedTab(null);
                }}
                className={`p-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 ${
                  activeTab === 'menu'
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white border-2 border-purple-700'
                    : 'bg-white text-gray-800 border-2 border-gray-300 hover:border-purple-400'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center">
                    <i className="ri-restaurant-line text-white text-3xl"></i>
                  </div>
                </div>
                <div className="text-lg font-bold">MENÚ</div>
                <div className="text-xs mt-1 opacity-80">Editar productos</div>
              </button>
            </div>
          </div>
        )}

        {/* Contenido */}
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-4">
            {getActiveComponent()}
          </div>
        </div>
      </div>
    </>
  );
}
