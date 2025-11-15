
import { useState, useEffect } from 'react';
import MenuHeader from './components/MenuHeader';
import CategoryTabs from './components/CategoryTabs';
import ProductGrid from './components/ProductGrid';
import CartSummary from './components/CartSummary';
import { supabase } from '../../lib/supabase';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  sales_count?: number; // Para productos más vendidos
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  display_order?: number; // Para compatibilidad
  is_active: boolean;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions?: any;
  optionsText?: string[];
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMenuData();
  }, []);

  const loadMenuData = async () => {
    try {
      // Cargar categorías desde Supabase - usando display_order (como en Prisma)
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        throw categoriesError;
      }

      // Mapear para compatibilidad
      const activeCategories = (categoriesData || []).map(cat => ({
        ...cat,
        display_order: cat.display_order || cat.order_index || 0,
        order_index: cat.order_index || cat.display_order || 0
      }));

      setCategories(activeCategories);

      // Cargar productos desde Supabase - simplificado para evitar errores de columnas
      let productsData: any[] = [];
      
      // Primero intentar cargar solo productos básicos sin relaciones anidadas
      let productsResult = await supabase
        .from('products')
        .select('*')
        .eq('is_available', true)
        .order('display_order', { ascending: true });

      if (productsResult.error) {
        // Si falla con display_order, intentar con order_index
        productsResult = await supabase
          .from('products')
          .select('*')
          .eq('is_available', true)
          .order('order_index', { ascending: true });
        
        if (productsResult.error) {
          // Si ambos fallan, intentar sin order
          productsResult = await supabase
            .from('products')
            .select('*')
            .eq('is_available', true);
          
          if (productsResult.error) {
            console.error('Error loading products:', productsResult.error);
            throw productsResult.error;
          }
        }
      }
      
      productsData = productsResult.data || [];

      // Ahora cargar las categorías de los productos
      if (productsData.length > 0) {
        const categoryIds = [...new Set(productsData.map(p => p.category_id).filter(Boolean))];
        if (categoryIds.length > 0) {
          const { data: categoriesData } = await supabase
            .from('categories')
            .select('*')
            .in('id', categoryIds);
          
          const categoriesMap = new Map((categoriesData || []).map(cat => [cat.id, cat]));
          
          // Agregar la categoría a cada producto
          productsData = productsData.map(product => ({
            ...product,
            category: categoriesMap.get(product.category_id) || null
          }));
        }
      }

      // Mapear los datos para compatibilidad con el frontend
      const availableProducts = productsData
        .filter((product: any) => product && product.id && product.name) // Filtrar productos inválidos primero
        .map((product: any) => ({
          ...product,
          id: product.id || '',
          name: product.name || 'Sin nombre',
          description: product.description || '',
          price: typeof product.price === 'number' ? product.price : parseFloat(String(product.price)) || 0,
          image_url: product.image_url || product.imageUrl || 'https://via.placeholder.com/300x300?text=Sin+Imagen',
          category_id: product.category_id || product.categoryId || '',
          is_available: product.is_available !== false && product.isAvailable !== false, // Por defecto true
          display_order: product.display_order || product.displayOrder || product.order_index || product.orderIndex || 0,
          sales_count: 0 // Por ahora 0, se puede calcular después si es necesario
        }))

      console.log('✅ Loaded products from Supabase:', availableProducts.length);
      console.log('📦 Products data:', availableProducts);
      
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
      
    } catch (error: any) {
      console.error('❌ Error loading menu data:', error);
      console.error('Error details:', error?.message, error?.details, error?.hint);
      // Aún así establecer productos vacíos para no quedar en loading infinito
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredProducts = () => {
    let filtered = products;

    // Filtrar por búsqueda
    if (searchTerm.trim()) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtrar por categoría
    if (selectedCategory === 'todos') {
      // Mostrar los más vendidos cuando está en "Todos"
      if (!searchTerm.trim()) {
        return filtered
          .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
          .slice(0, 12); // Mostrar top 12 más vendidos
      }
      return filtered;
    } else {
      return filtered.filter(product => product.category_id === selectedCategory);
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
          id: `${product.id}-${Date.now()}`, // ID único para productos con opciones
          name: product.name,
          price: finalPrice,
          quantity: 1,
          selectedOptions,
          optionsText
        }];
      }

      // Para productos sin opciones, usar la lógica existente
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/20 to-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-200 border-t-orange-500 mx-auto"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-2 border-orange-300 opacity-20"></div>
          </div>
          <p className="text-gray-600 font-semibold animate-pulse">Cargando menú...</p>
        </div>
      </div>
    );
  }

  const filteredProducts = getFilteredProducts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/10 to-white">
      <MenuHeader 
        cartItemsCount={getTotalItems()}
        onCartClick={handleCartClick}
      />
      
      <div className="pt-20 pb-32">
        <CategoryTabs
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={setSelectedCategory}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        
        {/* Mostrar información de la sección actual mejorada */}
        {selectedCategory === 'todos' && !searchTerm && (
          <div className="px-4 py-3.5 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center shadow-md">
                <i className="ri-fire-line text-white text-base"></i>
              </div>
              <span className="text-sm font-bold text-orange-700">Los más vendidos</span>
            </div>
          </div>
        )}
        
        {searchTerm && (
          <div className="px-4 py-3.5 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-md">
                <i className="ri-search-line text-white text-base"></i>
              </div>
              <span className="text-sm font-bold text-blue-700">
                {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''} para "<span className="text-blue-900">{searchTerm}</span>"
              </span>
            </div>
          </div>
        )}
        
        <ProductGrid
          products={filteredProducts}
          onAddToCart={addToCart}
        />
      </div>

      {showCart && cart.length > 0 && (
        <CartSummary
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          totalItems={getTotalItems()}
          totalPrice={getTotalPrice()}
          onCheckout={handleCheckout}
          onClose={() => setShowCart(false)}
        />
      )}
    </div>
  );
}
