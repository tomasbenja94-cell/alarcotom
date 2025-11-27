import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFavoriteProducts, removeFavoriteProduct, getFavoriteStores, removeFavoriteStore } from '../../utils/favorites';

export default function FavoritosPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'products' | 'stores'>('products');
  const [favoriteProducts, setFavoriteProducts] = useState<any[]>([]);
  const [favoriteStores, setFavoriteStores] = useState<any[]>([]);

  useEffect(() => {
    setFavoriteProducts(getFavoriteProducts());
    setFavoriteStores(getFavoriteStores());
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
            <i className="ri-arrow-left-line text-gray-600"></i>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Favoritos</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 py-2 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('products')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'products' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500'
            }`}
          >
            Productos ({favoriteProducts.length})
          </button>
          <button
            onClick={() => setActiveTab('stores')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'stores' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500'
            }`}
          >
            Locales ({favoriteStores.length})
          </button>
        </div>
      </div>

      <div className="p-4">
        {!isAuthenticated ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <i className="ri-heart-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 mb-4">Iniciá sesión para guardar favoritos</p>
            <button onClick={() => navigate('/login')} className="px-6 py-2 bg-rose-500 text-white rounded-xl">
              Iniciar sesión
            </button>
          </div>
        ) : activeTab === 'products' ? (
          favoriteProducts.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <i className="ri-heart-line text-4xl text-gray-300 mb-3"></i>
              <p className="text-gray-500">No tenés productos favoritos</p>
              <p className="text-sm text-gray-400 mt-1">Tocá el ❤️ en un producto para guardarlo</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {favoriteProducts.map(product => (
                <div key={product.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
                  <div className="aspect-square bg-gray-100 relative">
                    <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                    <button
                      onClick={() => handleRemoveProduct(product.id)}
                      className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow"
                    >
                      <i className="ri-heart-fill text-rose-500"></i>
                    </button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{product.name}</p>
                    <p className="text-sm font-bold text-rose-500 mt-1">${product.price?.toLocaleString('es-AR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          favoriteStores.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <i className="ri-store-2-line text-4xl text-gray-300 mb-3"></i>
              <p className="text-gray-500">No tenés locales favoritos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {favoriteStores.map(store => (
                <div key={store.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden">
                    <img src={store.image} alt={store.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{store.name}</p>
                    <p className="text-xs text-gray-500">{store.category}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveStore(store.id)}
                    className="w-10 h-10 flex items-center justify-center"
                  >
                    <i className="ri-heart-fill text-rose-500 text-xl"></i>
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

