
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MenuHeader from './components/MenuHeader';
import CategoryTabs from './components/CategoryTabs';
import ProductGrid from './components/ProductGrid';
import CartSummary from './components/CartSummary';
import { useStore } from '../../contexts/StoreContext';
import { useCart } from '../../contexts/CartContext';
import { DEFAULT_PRODUCT_PLACEHOLDER } from '../../utils/placeholders';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  sales_count?: number;
  display_order?: number;
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  display_order?: number; // Para compatibilidad
  is_active: boolean;
  description?: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions?: any;
  optionsText?: string[];
}

const getFallbackSalesCount = (id: string, index: number) => {
  if (!id) return 40 + index * 5;
  const hash = id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (hash % 120) + 40 + index * 3;
};

// Función para verificar si el local está cerrado
const checkIfStoreClosed = (settings: any): boolean => {
  if (!settings) return false;
  
  // Si está cerrado manualmente
  if (settings.isOpen === false) return true;
  
  // Verificar horarios
  if (settings.hours) {
    try {
      const hours = typeof settings.hours === 'string' ? JSON.parse(settings.hours) : settings.hours;
      const now = new Date();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = days[now.getDay()];
      const todayHours = hours[today];
      
      if (!todayHours || !todayHours.enabled) return true;
      
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [openH, openM] = todayHours.open.split(':').map(Number);
      const [closeH, closeM] = todayHours.close.split(':').map(Number);
      const openTime = openH * 60 + openM;
      const closeTime = closeH * 60 + closeM;
      
      // Manejar horarios que cruzan medianoche
      if (closeTime < openTime) {
        return currentTime < openTime && currentTime >= closeTime;
      }
      
      return currentTime < openTime || currentTime >= closeTime;
    } catch {
      return false;
    }
  }
  
  return false;
};

export default function MenuPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentStore, setCurrentStore, stores } = useStore();
  const { saveCartToWaiting, getWaitingCart, restoreWaitingCart, waitingCarts, setShowCartsModal } = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  
  // Carrito del momento (solo para esta tienda)
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery');
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [isStoreClosed, setIsStoreClosed] = useState(false);
  const [showExitToast, setShowExitToast] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Detectar scroll para mostrar barra fija
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 150);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Producto destacado desde URL (para scroll/highlight)
  const highlightedProductId = searchParams.get('product');
  const openCartOnLoad = searchParams.get('openCart') === 'true';
  const addToCartOnLoad = searchParams.get('addToCart') === 'true';
  const productRefs = useRef<Record<string, HTMLElement | null>>({});
  const [addedToast, setAddedToast] = useState(false);

  // Cargar carrito de espera si existe para esta tienda
  useEffect(() => {
    if (currentStore?.id) {
      const waitingCart = getWaitingCart(currentStore.id);
      if (waitingCart) {
        // Restaurar carrito de espera
        const items = restoreWaitingCart(currentStore.id);
        setCart(items);
      }
    }
  }, [currentStore?.id]);
  
  // Abrir carrito si viene de la lista de carritos
  useEffect(() => {
    if (openCartOnLoad && cart.length > 0) {
      setShowCart(true);
    }
  }, [openCartOnLoad, cart.length]);
  
  // Agregar producto automáticamente si viene de promos
  useEffect(() => {
    if (addToCartOnLoad && !loading && products.length > 0) {
      try {
        const pendingStr = localStorage.getItem('pending_add_product');
        if (pendingStr) {
          const pending = JSON.parse(pendingStr);
          localStorage.removeItem('pending_add_product');
          
          // Agregar al carrito
          setCart(prev => {
            const existing = prev.find(item => item.id === pending.id);
            if (existing) {
              return prev.map(item => 
                item.id === pending.id ? { ...item, quantity: item.quantity + 1 } : item
              );
            }
            return [...prev, {
              id: pending.id,
              name: pending.name,
              price: pending.price,
              quantity: 1
            }];
          });
          
          // Mostrar toast
          setAddedToast(true);
          setTimeout(() => setAddedToast(false), 2000);
        }
      } catch (e) {
        console.error('Error adding product from promo:', e);
      }
    }
  }, [addToCartOnLoad, loading, products.length]);
  
  // Scroll al producto destacado cuando se carga
  useEffect(() => {
    if (highlightedProductId && !loading && products.length > 0) {
      setTimeout(() => {
        const element = productRefs.current[highlightedProductId];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-[#FF3366]', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-[#FF3366]', 'ring-offset-2');
          }, 2000);
        }
      }, 500);
    }
  }, [highlightedProductId, loading, products]);
  
  // Guardar carrito en espera al salir (interceptar navegación)
  const handleBackNavigation = useCallback(() => {
    if (cart.length > 0 && currentStore) {
      saveCartToWaiting(currentStore.id, currentStore.name, cart);
      setShowExitToast(true);
      // No navegar automáticamente, esperar a que el usuario acepte
      return true;
    }
    navigate('/');
    return false;
  }, [cart, currentStore, saveCartToWaiting, navigate]);
  
  // Confirmar y salir
  const confirmExit = useCallback(() => {
    setShowExitToast(false);
    navigate('/');
  }, [navigate]);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!normalizedSearchTerm) return [];
    return products.filter((product) => {
      const searchable = `${product.name} ${product.description}`.toLowerCase();
      return searchable.includes(normalizedSearchTerm);
    });
  }, [products, normalizedSearchTerm]);

  const mostSoldProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, 3);
  }, [products]);

  const lowestPrice = useMemo(() => {
    if (products.length === 0) return 0;
    return products.reduce((min, product) => Math.min(min, product.price || 0), products[0].price || 0);
  }, [products]);

  const lowPriceProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (a.price || 0) - (b.price || 0))
      .slice(0, 12);
  }, [products]);

  const newProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.display_order ?? b.sales_count ?? 0) - (a.display_order ?? a.sales_count ?? 0))
      .slice(0, 8);
  }, [products]);

  const buildKeywordFilter = (keywords: string[]) => (product: Product) => {
    const text = `${product.name} ${product.description}`.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  };

  const veganProducts = useMemo(
    () => products.filter(buildKeywordFilter(['vegano', 'veggie', 'plant', 'sin carne'])),
    [products]
  );

  const veggieProducts = useMemo(
    () => products.filter(buildKeywordFilter(['vegetar', 'ensalada', 'caprese', 'queso'])),
    [products]
  );

  const promotionProducts = useMemo(() => {
    const promoKeywords = ['combo', 'promo', 'pack', '2x', 'oferta', 'happy'];
    return products
      .filter((product) => {
        const text = `${product.name} ${product.description}`.toLowerCase();
        const matchesPromo = promoKeywords.some((keyword) => text.includes(keyword));
        const isBudgetFriendly = product.price <= Math.max(1200, lowestPrice + 400);
        return matchesPromo || isBudgetFriendly;
      })
      .slice(0, 12);
  }, [products, lowestPrice]);

  const preferredCategoryOrder = ['Más vendidos', 'Snacks', 'Bebidas', 'Almacén', 'Higiene Personal', 'Higiene'];

  const categorySections = useMemo(() => {
    const sections = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description || '',
        products: products.filter((product) => product.category_id === category.id),
        display_order: category.display_order ?? category.order_index ?? 0,
      }))
      .filter((section) => section.products.length > 0);

    const orderValue = (name: string, fallback: number) => {
      const preferredIndex = preferredCategoryOrder.findIndex(
        (preferred) => preferred.toLowerCase() === name.toLowerCase()
      );
      return preferredIndex !== -1 ? preferredIndex : preferredCategoryOrder.length + fallback;
    };

    return sections.sort((a, b) => orderValue(a.name, a.display_order) - orderValue(b.name, b.display_order));
  }, [categories, products]);

  // Verificar que hay un store seleccionado
  useEffect(() => {
    const storeParam = searchParams.get('store');
    if (storeParam && stores.length > 0) {
      // Buscar por id (el id puede ser el slug como "kioscoanta")
      const store = stores.find(s => 
        s.id === storeParam || 
        s.id.toLowerCase() === storeParam.toLowerCase() ||
        s.name.toLowerCase().replace(/\s+/g, '') === storeParam.toLowerCase()
      );
      if (store) {
        setCurrentStore(store);
      } else {
        console.log('Store no encontrado:', storeParam, 'Stores disponibles:', stores.map(s => s.id));
        // No redirigir inmediatamente, puede que los stores aún no cargaron
      }
    } else if (!storeParam && !currentStore && stores.length > 0) {
      // Si no hay store en URL ni seleccionado, redirigir a selección
      navigate('/');
    }
  }, [searchParams, stores, currentStore, navigate, setCurrentStore]);

  // Cargar datos del menú solo cuando el store esté disponible
  useEffect(() => {
    if (currentStore) {
      loadMenuData();
    }
  }, [currentStore]);

  const loadMenuData = async () => {
    if (!currentStore) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // Normalizar API_URL para asegurar que siempre termine en /api
      let rawApiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      rawApiUrl = rawApiUrl.replace(/\/$/, '');
      const apiUrl = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
      
      // Cargar categorías desde la API del backend filtradas por store
      const categoriesResponse = await fetch(`${apiUrl}/categories?storeId=${currentStore.id}`);
      if (!categoriesResponse.ok) {
        throw new Error(`Error loading categories: ${categoriesResponse.statusText}`);
      }
      const categoriesData = await categoriesResponse.json();
      
      // Filtrar solo categorías activas y mapear para compatibilidad
      const activeCategories = (categoriesData || [])
        .filter((cat: any) => cat.is_active !== false)
        .map((cat: any) => ({
          ...cat,
          description: cat.description || '',
          display_order: cat.display_order || cat.order_index || 0,
          order_index: cat.order_index || cat.display_order || 0
        }))
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

      setCategories(activeCategories);

      // Cargar productos desde la API del backend filtrados por store
      const productsResponse = await fetch(`${apiUrl}/products?storeId=${currentStore.id}`);
      if (!productsResponse.ok) {
        throw new Error(`Error loading products: ${productsResponse.statusText}`);
      }
      const productsData = await productsResponse.json();

      // Crear mapa de categorías para asociar a productos
      const categoriesMap = new Map(activeCategories.map((cat: any) => [cat.id, cat]));

      // Mapear los datos para compatibilidad con el frontend
      const availableProducts = (productsData || [])
        .filter((product: any) => product && product.id && product.name && product.is_available !== false)
        .map((product: any, index: number) => ({
          ...product,
          id: product.id || '',
          name: product.name || 'Sin nombre',
          description: product.description || '',
          price: typeof product.price === 'number' ? product.price : parseFloat(String(product.price)) || 0,
          image_url: product.image_url || product.imageUrl || DEFAULT_PRODUCT_PLACEHOLDER,
          category_id: product.category_id || product.categoryId || '',
          is_available: product.is_available !== false && product.isAvailable !== false,
          display_order: product.display_order || product.displayOrder || product.order_index || product.orderIndex || 0,
          sales_count: product.sales_count ?? product.salesCount ?? getFallbackSalesCount(product.id || product.name || '', index),
          category: categoriesMap.get(product.category_id || product.categoryId) || null
        }))
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

      console.log('✅ Loaded products from API:', availableProducts.length);
      
      // Verificar que los productos tengan los campos necesarios
      const validProducts = availableProducts.filter(p => {
        const isValid = p && p.id && p.name && typeof p.price === 'number';
        if (!isValid) {
          console.warn('⚠️ Producto inválido:', p);
        }
        return isValid;
      });

      console.log('✅ Valid products:', validProducts.length);
      setProducts(validProducts);

      // Cargar configuración del local para verificar si está abierto
      try {
        const settingsResponse = await fetch(`${apiUrl}/store-settings/${currentStore.id}/public`);
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setStoreSettings(settingsData);
          
          // Verificar si el local está cerrado
          const closed = checkIfStoreClosed(settingsData);
          setIsStoreClosed(closed);
        }
      } catch (err) {
        console.log('No se pudo cargar configuración del local');
      }
      
    } catch (error: any) {
      console.error('❌ Error loading menu data:', error);
      console.error('Error details:', error?.message);
      // Aún así establecer productos vacíos para no quedar en loading infinito
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product, selectedOptions?: any, totalPrice?: number) => {
    const finalPrice = totalPrice || product.price;
    
    // Generar texto detallado de opciones seleccionadas
    let optionsText: string[] = [];
    if (selectedOptions && selectedOptions.selectedOptions && selectedOptions.selectedOptions.length > 0) {
      selectedOptions.selectedOptions.forEach((option: any) => {
        const optionPrice = option.price > 0 ? ` (+${new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 0,
        }).format(option.price)})` : '';
        optionsText.push(`${option.name}${optionPrice}`);
      });
    }

    setCart(prevCart => {
      // Para productos con opciones, siempre crear una nueva entrada
      if (selectedOptions && selectedOptions.selectedOptions && selectedOptions.selectedOptions.length > 0) {
        return [...prevCart, {
          id: `${product.id}-${Date.now()}`,
          name: product.name,
          price: finalPrice,
          quantity: 1,
          selectedOptions,
          optionsText
        }];
      }

      // Para productos sin opciones, sumar cantidad
      const existingItem = prevCart.find(item => item.id === product.id && !item.selectedOptions);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id && !item.selectedOptions
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, {
        id: product.id,
        name: product.name,
        price: finalPrice,
        quantity: 1
      }];
    });
  };

  const renderProductSection = (
    title: string,
    subtitle: string,
    items: Product[],
    variant: 'default' | 'featured' = 'default',
    emptyStateMessage?: string
  ) => (
    <section key={title} className="space-y-2">
      <div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-gray-400 text-[11px]">{subtitle}</p>}
      </div>
      <ProductGrid
        products={items}
        onAddToCart={addToCart}
        variant={variant}
        emptyMessage={emptyStateMessage}
        disabled={isStoreClosed}
        highlightedProductId={highlightedProductId}
        productRefs={productRefs}
      />
    </section>
  );

  const renderCurrentView = () => {
    if (normalizedSearchTerm) {
      return renderProductSection(
        `Resultados (${searchResults.length})`,
        searchResults.length
          ? `Coincidencias para "${searchTerm}"`
          : `No encontramos productos para "${searchTerm}"`,
        searchResults,
        'default',
        `No encontramos productos para "${searchTerm}"`
      );
    }

    if (selectedCategory === 'todos') {
      return (
        <>
          {mostSoldProducts.length > 0 &&
            renderProductSection(
              'Más vendidos',
              'Los favoritos del local, listos para llegar a tu mesa',
              mostSoldProducts,
              'featured'
            )}
          {categorySections.map((section) =>
            renderProductSection(
              section.name,
              section.description || 'Recomendados para cualquier antojo',
              section.products
            )
          )}
        </>
      );
    }

    if (selectedCategory === 'best-sellers') {
      return renderProductSection(
        'Top del local',
        'Los platos que todos repiten una y otra vez',
        mostSoldProducts,
        'featured'
      );
    }

    if (selectedCategory === 'new') {
      return renderProductSection(
        'Nuevos ingresos',
        'Últimos productos agregados al menú',
        newProducts,
        'featured',
        'Todavía no hay novedades en este local'
      );
    }

    if (selectedCategory === 'vegan') {
      return renderProductSection(
        'Opciones veganas',
        'Sabores plant based llenos de color',
        veganProducts,
        'default',
        'Aún no cargamos opciones veganas en este local'
      );
    }

    if (selectedCategory === 'veggie') {
      return renderProductSection(
        'Vegetariano',
        'Preparaciones frescas y sin carne',
        veggieProducts,
        'default',
        'Por ahora no tenemos opciones vegetarianas'
      );
    }

    if (selectedCategory === 'low-price') {
      return renderProductSection(
        'Precio más bajo',
        'Opciones al mejor precio para todos los gustos',
        lowPriceProducts
      );
    }

    if (selectedCategory === 'promotions') {
      return renderProductSection(
        'Promociones',
        'Combos y packs ideales para compartir',
        promotionProducts,
        'featured',
        'Aún no hay promociones activas'
      );
    }

    const targetedCategory = categorySections.find((section) => section.id === selectedCategory);
    if (targetedCategory) {
      return renderProductSection(
        targetedCategory.name,
        targetedCategory.description || 'Descubrí todos los productos de esta categoría',
        targetedCategory.products
      );
    }

    return renderProductSection('Menú', 'Explorá todo el catálogo del local', products);
  };

  const updateCartQuantity = (id: string, quantity: number) => {
    if (quantity === 0) {
      setCart(prevCart => prevCart.filter(item => item.id !== id));
    } else {
      setCart(prevCart =>
        prevCart.map(item =>
          item.id === id ? { ...item, quantity } : item
        )
      );
    }
  };

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handleCartClick = () => {
    if (cart.length > 0) {
      setShowCart(true);
    }
  };

  const handleCheckout = () => {
    // Aquí puedes agregar la lógica de checkout
    console.log('Proceder al checkout con:', cart);
  };

  // Si no hay store seleccionado, mostrar mensaje y redirigir
  if (!currentStore) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4 px-4">
          <i className="ri-store-line text-6xl text-gray-300"></i>
          <p className="text-gray-600 font-medium">No hay tienda seleccionada</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-[#FFD523] text-black rounded-xl font-semibold hover:bg-[#FFE066] transition-all"
          >
            Seleccionar Tienda
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#FFD523]/20 border-t-[#FFD523] mx-auto"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-2 border-[#FFD523]/30 opacity-20"></div>
          </div>
          <p className="text-gray-800 font-semibold animate-pulse">Cargando menú de {currentStore.name}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#F7F8FA] text-gray-900 ${cart.length > 0 ? 'pb-24' : 'pb-4'}`}>
      {/* Barra fija al scrollear */}
      {isScrolled && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl shadow-lg border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackNavigation}
                className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-line text-gray-700 text-lg"></i>
              </button>
              <span className="font-bold text-gray-900 truncate max-w-[180px]">{currentStore.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {waitingCarts.length > 0 && (
                <button
                  onClick={() => setShowCartsModal(true)}
                  className="relative w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
                >
                  <i className="ri-shopping-bag-3-line text-gray-700"></i>
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {waitingCarts.length}
                  </span>
                </button>
              )}
              {cart.length > 0 && (
                <button
                  onClick={() => setShowCart(true)}
                  className="relative w-9 h-9 rounded-xl bg-[#FF3366] flex items-center justify-center"
                >
                  <i className="ri-shopping-cart-2-fill text-white"></i>
                  <span className="absolute -top-1 -right-1 bg-white text-[#FF3366] text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">
                    {getTotalItems()}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      <MenuHeader 
        cartItemsCount={getTotalItems()}
        onCartClick={handleCartClick}
        storeName={currentStore.name}
        storeImage={currentStore.image_url}
        storeDescription={currentStore.description}
        storeCategory={currentStore.category}
        storeHours={(() => {
          // Obtener horario del día actual desde storeSettings
          if (storeSettings?.hours) {
            try {
              const hours = typeof storeSettings.hours === 'string' 
                ? JSON.parse(storeSettings.hours) 
                : storeSettings.hours;
              const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
              const today = days[new Date().getDay()];
              const todayHours = hours[today];
              if (todayHours?.enabled && todayHours.open && todayHours.close) {
                return `${todayHours.open} - ${todayHours.close}`;
              }
            } catch {}
          }
          return currentStore.hours || 'Abierto';
        })()}
        fulfillmentMode={fulfillmentMode}
        onFulfillmentChange={setFulfillmentMode}
        deliveryFee={storeSettings?.baseDeliveryFee || 4000}
        onBack={handleBackNavigation}
        waitingCartsCount={waitingCarts.length}
        onWaitingCartsClick={() => setShowCartsModal(true)}
      />

      {/* Banner de local cerrado */}
      {isStoreClosed && (
        <div className="bg-red-500 text-white px-4 py-3 text-center sticky top-0 z-50 shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <i className="ri-time-line text-xl animate-pulse"></i>
            <span className="font-semibold">
              {storeSettings?.closedMessage || 'Este local está cerrado, vuelve más tarde'}
            </span>
          </div>
        </div>
      )}
      
      <div className="-mt-4">
        <CategoryTabs
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={setSelectedCategory}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <div className="max-w-5xl mx-auto px-3 pt-3 pb-4 space-y-3">
          {renderCurrentView()}
        </div>
      </div>

      {showCart && cart.length > 0 && (
        <CartSummary
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          totalItems={getTotalItems()}
          totalPrice={getTotalPrice()}
          onCheckout={handleCheckout}
          onClose={() => setShowCart(false)}
          fulfillmentMode={fulfillmentMode}
          storeId={currentStore.id}
          storeName={currentStore.name}
          storePanelType={currentStore.panelType}
          storeWhatsapp={(storeSettings?.whatsappNumber || storeSettings?.contactWhatsapp || storeSettings?.phone || '')}
        />
      )}
      
      {/* Barra sticky del carrito (estilo PedidosYa) */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF3366] to-rose-500 flex items-center justify-center">
                <i className="ri-shopping-cart-2-fill text-white text-lg"></i>
              </div>
              <div>
                <p className="text-xs text-gray-500">{getTotalItems()} {getTotalItems() === 1 ? 'producto' : 'productos'}</p>
                <p className="text-lg font-black text-gray-900">
                  ${getTotalPrice().toLocaleString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCart(true)}
              className="px-6 py-3 bg-gradient-to-r from-[#FF3366] to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-500/30 hover:scale-105 active:scale-95 transition-transform"
            >
              Ver carrito
            </button>
          </div>
        </div>
      )}
      
      {/* Modal de carrito guardado - Obligatorio aceptar */}
      {showExitToast && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 text-center animate-[scaleIn_0.2s_ease-out] max-w-sm w-full">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <i className="ri-shopping-cart-2-line text-3xl text-green-600"></i>
            </div>
            <p className="text-xl font-bold text-gray-900 mb-2">🛒 Tu carrito te espera</p>
            <p className="text-sm text-gray-500 mb-6">Guardamos tus productos por 1 hora</p>
            <button
              onClick={confirmExit}
              className="w-full py-3 bg-gradient-to-r from-[#FF3366] to-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-500/30 hover:scale-105 active:scale-95 transition-transform"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
      
      {/* Toast de producto agregado */}
      {addedToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-[slideInUp_0.3s_ease-out]">
          <i className="ri-check-line text-green-400"></i>
          <span className="text-sm font-medium">¡Agregado al carrito!</span>
        </div>
      )}
    </div>
  );
}
