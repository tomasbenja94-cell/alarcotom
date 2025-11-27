import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFavoriteProducts, removeFavoriteProduct, getFavoriteStores, removeFavoriteStore } from '../../utils/favorites';
import { EmptyFavorites } from '../../components/common/EmptyState';

export default function FavoritosPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'products' | 'stores'>('products');
  const [favoriteProducts, setFavoriteProducts] = useState<any[]>([]);
  const [favoriteStores, setFavoriteStores] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setFavoriteProducts(getFavoriteProducts());
    setFavoriteStores(getFavoriteStores());
    setTimeout(() => setIsLoaded(true), 100);
  }, []);

  const handleRemoveProduct = (productId: string) => {
    removeFavoriteProduct(productId);
    setFavoriteProducts(getFavoriteProducts());
  };

  const handleRemoveStore = (storeId: string) => {
    removeFavoriteStore(storeId);
    setFavoriteStores(getFavoriteStores());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-pink-50/30">
      {/* Header premium */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-rose-500 to-red-500"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.3),transparent_60%)]"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className={`relative px-4 pt-6 pb-6 transition-all duration-700 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)} 
              className="w-11 h-11 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all"
            >
              <i className="ri-arrow-left-line text-white text-xl"></i>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30">
                <i className="ri-heart-3-fill text-white text-2xl"></i>
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Favoritos</h1>
                <p className="text-sm text-white/70">Tus productos guardados</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs flotantes */}
      <div className={`max-w-md mx-auto px-4 -mt-4 relative z-10 transition-all duration-700 delay-200 ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-1.5 flex border border-white/50">
          {[
            { id: 'products', label: 'Productos', icon: 'ri-shopping-bag-3-fill', count: favoriteProducts.length },
            { id: 'stores', label: 'Locales', icon: 'ri-store-2-fill', count: favoriteStores.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#FF3366] to-rose-500 text-white shadow-lg shadow-rose-500/30'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4 max-w-md mx-auto">
        {!isAuthenticated ? (
          <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-lg border border-white/50 transition-all duration-700 delay-300 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center">
              <i className="ri-heart-3-line text-4xl text-rose-400"></i>
            </div>
            <p className="text-gray-900 font-bold text-lg mb-2">Iniciá sesión</p>
            <p className="text-gray-500 text-sm mb-5">Para guardar tus productos favoritos</p>
            <button 
              onClick={() => navigate('/login')} 
              className="px-8 py-3 bg-gradient-to-r from-[#FF3366] to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-500/30 hover:shadow-xl transition-all"
            >
              Iniciar sesión
            </button>
          </div>
        ) : activeTab === 'products' ? (
          favoriteProducts.length === 0 ? (
            <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/50 transition-all duration-700 delay-300 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <EmptyFavorites onAction={() => navigate('/')} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {favoriteProducts.map((product, idx) => (
                <div 
                  key={product.id} 
                  className="group bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg border border-white/50 animate-fadeInUp"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="aspect-square bg-gradient-to-br from-gray-50 to-slate-100 relative overflow-hidden">
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" 
                    />
                    <button
                      onClick={() => handleRemoveProduct(product.id)}
                      className="absolute top-2 right-2 w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                    >
                      <i className="ri-heart-fill text-[#FF3366] text-lg"></i>
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
                    <p className="text-base font-black text-[#FF3366] mt-2">${product.price?.toLocaleString('es-AR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          favoriteStores.length === 0 ? (
            <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-lg border border-white/50 transition-all duration-700 delay-300 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center">
                <i className="ri-store-2-line text-4xl text-blue-400"></i>
              </div>
              <p className="text-gray-900 font-bold text-lg">Sin locales favoritos</p>
              <p className="text-gray-500 text-sm mt-1">Guardá tus locales preferidos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {favoriteStores.map((store, idx) => (
                <div 
                  key={store.id} 
                  className="group bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-lg border border-white/50 flex items-center gap-4 animate-fadeInUp"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-100 to-slate-100 overflow-hidden flex-shrink-0">
                    <img src={store.image} alt={store.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{store.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{store.category}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveStore(store.id)}
                    className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center hover:bg-rose-100 transition-colors"
                  >
                    <i className="ri-heart-fill text-[#FF3366] text-xl"></i>
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
