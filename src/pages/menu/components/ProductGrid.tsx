
import { useState, useEffect } from 'react';
import ProductModal from './ProductModal';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
}

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product, selectedOptions?: any, totalPrice?: number) => void;
}

export default function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  const [showAnimation, setShowAnimation] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productsWithOptions, setProductsWithOptions] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkProductsWithOptions();
  }, [products]);

  const checkProductsWithOptions = async () => {
    if (products.length === 0) {
      setProductsWithOptions(new Set());
      return;
    }

    try {
      const productIds = products.map(p => p.id).filter(Boolean);
      if (productIds.length === 0) return;

      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      
      // Obtener las categorías de opciones que pertenecen a estos productos desde la API del backend
      // Hacer una petición por cada producto (o agrupar si el backend lo permite)
      const productIdsWithOptions = new Set<string>();
      
      // Hacer peticiones en paralelo para todos los productos
      const promises = productIds.map(async (productId) => {
        try {
          const response = await fetch(`${apiUrl}/product-option-categories?productId=${productId}`);
          if (response.ok) {
            const categories = await response.json();
            // Si hay categorías activas, el producto tiene opciones
            if (categories && categories.length > 0) {
              const hasActiveCategories = categories.some((cat: any) => cat.is_active !== false);
              if (hasActiveCategories) {
                productIdsWithOptions.add(productId);
              }
            }
          }
        } catch (error) {
          // Silenciar errores individuales, solo loggear si es necesario
          if (import.meta.env.DEV) {
            console.warn(`Error checking options for product ${productId}:`, error);
          }
        }
      });
      
      await Promise.all(promises);
      setProductsWithOptions(productIdsWithOptions);
    } catch (error) {
      console.error('Error checking products with options:', error);
      setProductsWithOptions(new Set());
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(price);
  };

  const playSuccessSound = () => {
    // Crear sonido usando Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('No se pudo reproducir el sonido:', error);
    }
  };

  const handleAddToCart = (product: Product, selectedOptions?: any, totalPrice?: number) => {
    onAddToCart(product, selectedOptions, totalPrice);
    
    // Reproducir sonido y animación siempre que se agregue al carrito
    playSuccessSound();
    
    // Mostrar animación
    setShowAnimation(true);
    setIsExiting(false);
    
    // Iniciar animación de salida después de 1000ms
    setTimeout(() => {
      setIsExiting(true);
    }, 1000);
    
    // Ocultar completamente después de 2000ms
    setTimeout(() => {
      setShowAnimation(false);
      setIsExiting(false);
    }, 2000);
  };

  const handleProductClick = (product: Product) => {
    if (productsWithOptions.has(product.id)) {
      setSelectedProduct(product);
    } else {
      handleAddToCart(product);
    }
  };

  if (products.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-gray-500">No hay productos disponibles en esta categoría</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          {products.map((product, index) => {
            const hasOptions = productsWithOptions.has(product.id);
            
            return (
              <div
                key={product.id}
                className="bg-white rounded-[2rem] shadow-elegant border-elegant overflow-hidden hover-lift group cursor-pointer animate-fadeInUpStagger"
                style={{ animationDelay: `${index * 0.05}s` }}
                data-product-shop
              >
                <div className="aspect-square w-full relative overflow-hidden">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  {hasOptions && (
                    <div className="absolute top-2 right-2 bg-orange-500/90 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-full shadow-lg">
                      <i className="ri-add-box-line mr-1"></i>
                      Opciones
                    </div>
                  )}
                </div>
                
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 group-hover:text-orange-600 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-gray-500 text-xs leading-relaxed mb-2 line-clamp-2">
                    {product.description}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <p className="text-orange-600 font-bold text-base">
                        {hasOptions ? `Desde ${formatPrice(product.price)}` : formatPrice(product.price)}
                      </p>
                      {hasOptions && (
                        <p className="text-xs text-gray-400 mt-0.5">Personaliza tu pedido</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProductClick(product);
                      }}
                      className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-4 py-2 rounded-[1.5rem] text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-xl hover:scale-110 active:scale-95 flex items-center justify-center"
                    >
                      <i className="ri-add-line text-lg"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de producto con opciones */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Animación de producto agregado mejorada */}
      {showAnimation && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none transition-all duration-700 ease-out ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`}>
          <div className={`bg-white rounded-[2.5rem] shadow-elegant-xl p-8 border-2 border-green-400 transform transition-all duration-700 ease-out backdrop-blur-sm ${
            isExiting ? 'scale-90 opacity-0 rotate-3' : 'scale-100 opacity-100 rotate-0'
          }`}>
            <div className="text-center space-y-4">
              <div className={`w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto transition-all duration-700 ease-out shadow-lg ${
                isExiting ? 'scale-50 opacity-0' : 'scale-100 opacity-100 animate-bounce'
              }`}>
                <i className="ri-check-line text-white text-3xl font-bold"></i>
              </div>
              <div className="space-y-1">
                <h3 className={`text-2xl font-bold text-gradient mb-1 transition-all duration-700 ease-out ${
                  isExiting ? 'opacity-0 transform translate-y-3' : 'opacity-100 translate-y-0'
                }`} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  ¡Agregado!
                </h3>
                <p className={`text-gray-600 text-sm font-medium transition-all duration-700 ease-out ${
                  isExiting ? 'opacity-0 transform translate-y-2' : 'opacity-100 translate-y-0'
                }`}>
                  Producto agregado al carrito exitosamente
                </p>
              </div>
              <div className="w-full bg-green-50 rounded-full h-2 overflow-hidden">
                <div className={`h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-1000 ease-out ${
                  isExiting ? 'w-0' : 'w-full'
                }`}></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
