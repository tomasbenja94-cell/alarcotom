
import { useState, useEffect, useRef } from 'react';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
}

interface ProductOption {
  id: string;
  name: string;
  price: number;
  price_modifier?: number; // Para compatibilidad con Supabase
  category_id: string;
  display_order: number;
  order_index?: number; // Para compatibilidad con Supabase
}

interface OptionCategory {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  display_order: number;
  order_index?: number; // Para compatibilidad con Supabase
  depends_on_category_id?: string;
}

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, selectedOptions?: any, totalPrice?: number) => void;
}

export default function ProductModal({ product, onClose, onAddToCart }: ProductModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [categories, setCategories] = useState<OptionCategory[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<{[categoryId: string]: ProductOption[]}>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const autoScrollDone = useRef<{[key: string]: boolean}>({});

  useEffect(() => {
    if (product) {
      loadProductOptions();
    }
  }, [product]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const loadProductOptions = async () => {
    try {
      setLoading(true);
      
      const apiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      
      // Cargar categorías de opciones del producto desde la API del backend
      const categoriesResponse = await fetch(`${apiUrl}/product-option-categories?productId=${product.id}`);
      if (!categoriesResponse.ok) {
        throw new Error(`Error loading option categories: ${categoriesResponse.statusText}`);
      }
      const categoriesData = await categoriesResponse.json();
      
      // Mapear para compatibilidad
      const productCategories = (categoriesData || [])
        .filter((cat: any) => cat.is_active !== false)
        .map((cat: any) => ({
          ...cat,
          display_order: cat.display_order || cat.order_index || 0,
          order_index: cat.order_index || cat.display_order || 0
        }))
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
      
      console.log('✅ Loaded option categories:', productCategories.length);
      setCategories(productCategories);

      if (productCategories.length === 0) {
        setOptions([]);
        setLoading(false);
        return;
      }

      // Extraer todas las opciones de todas las categorías
      const allOptions: any[] = [];
      productCategories.forEach((cat: any) => {
        if (cat.options && Array.isArray(cat.options)) {
          cat.options.forEach((opt: any) => {
            allOptions.push({
              ...opt,
              price: opt.price_modifier || opt.price || 0,
              display_order: opt.display_order || opt.order_index || 0,
              order_index: opt.order_index || opt.display_order || 0,
              // Asegurar que ambas propiedades estén disponibles para el filtro
              category_id: opt.category_id || opt.option_category_id || cat.id,
              option_category_id: opt.option_category_id || opt.category_id || cat.id
            });
          });
        }
      });
      
      // Ordenar opciones por display_order
      allOptions.sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
      
      console.log('✅ Loaded product options:', allOptions.length);
      setOptions(allOptions);
      
      setSelectedOptions({});
      setValidationErrors([]);
    } catch (error) {
      console.error('Error loading product options:', error);
      setCategories([]);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const isCategoryUnlocked = (category: OptionCategory): boolean => {
    // Si no depende de ninguna categoría, está desbloqueada
    if (!category.depends_on_category_id) {
      return true;
    }

    // Verificar si la categoría de la que depende tiene selecciones
    const dependentSelections = selectedOptions[category.depends_on_category_id] || [];
    const dependentCategory = categories.find(c => c.id === category.depends_on_category_id);
    
    if (!dependentCategory) {
      return true;
    }

    // Verificar si se cumple el mínimo de selecciones requeridas
    return dependentSelections.length >= dependentCategory.min_selections;
  };

  const scrollToNextCategory = (currentCategoryId: string) => {
    const currentIndex = categories.findIndex(c => c.id === currentCategoryId);
    const nextCategory = categories[currentIndex + 1];
    
    if (nextCategory && isCategoryUnlocked(nextCategory)) {
      const nextCategoryElement = categoryRefs.current[nextCategory.id];
      if (nextCategoryElement && scrollContainerRef.current) {
        setTimeout(() => {
          nextCategoryElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 300);
      }
    }
  };

  const handleOptionToggle = (option: ProductOption, categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category || !isCategoryUnlocked(category)) return;

    setSelectedOptions(prev => {
      const currentSelections = prev[categoryId] || [];
      const isSelected = currentSelections.some(opt => opt.id === option.id);

      if (isSelected) {
        // Deseleccionar
        const newSelections = {
          ...prev,
          [categoryId]: currentSelections.filter(opt => opt.id !== option.id)
        };

        // Limpiar categorías dependientes si esta categoría ya no cumple el mínimo
        const updatedSelections = currentSelections.filter(opt => opt.id !== option.id);
        if (updatedSelections.length < category.min_selections) {
          // Encontrar y limpiar categorías que dependen de esta
          categories.forEach(depCategory => {
            if (depCategory.depends_on_category_id === categoryId) {
              newSelections[depCategory.id] = [];
            }
          });
        }

        return newSelections;
      } else {
        // Seleccionar
        let newSelections = [...currentSelections];
        
        if (category.max_selections === 1) {
          // Solo una selección permitida - reemplazar la selección actual
          newSelections = [option];
        } else if (currentSelections.length < category.max_selections) {
          // Múltiples selecciones permitidas
          newSelections.push(option);
        } else {
          // Ya se alcanzó el máximo, no hacer nada
          return prev;
        }
        
        const result = {
          ...prev,
          [categoryId]: newSelections
        };

        // Verificar si se completó el mínimo requerido y hacer scroll automático
        if (newSelections.length >= category.min_selections) {
          scrollToNextCategory(categoryId);
        }

        return result;
      }
    });
  };

  const validateSelections = (): boolean => {
    const errors: string[] = [];

    categories.forEach(category => {
      if (!isCategoryUnlocked(category)) {
        return; // No validar categorías bloqueadas
      }

      const selections = selectedOptions[category.id] || [];
      
      if (category.is_required && selections.length < category.min_selections) {
        errors.push(`Debes seleccionar al menos ${category.min_selections} opción(es) en "${category.name}"`);
      }
      
      if (selections.length < category.min_selections) {
        errors.push(`Selecciona al menos ${category.min_selections} opción(es) en "${category.name}"`);
      }
      
      if (selections.length > category.max_selections) {
        errors.push(`Máximo ${category.max_selections} selección(es) permitida(s) en "${category.name}"`);
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const isValidSelection = (): boolean => {
    // Verificar que todas las categorías desbloqueadas y obligatorias tengan las selecciones mínimas
    for (const category of categories) {
      if (!isCategoryUnlocked(category)) {
        continue; // Saltar categorías bloqueadas
      }

      const selections = selectedOptions[category.id] || [];
      
      if (category.is_required && selections.length < category.min_selections) {
        return false;
      }
      
      if (selections.length < category.min_selections) {
        return false;
      }
      
      if (selections.length > category.max_selections) {
        return false;
      }
    }
    
    return true;
  };

  const calculateTotalPrice = (): number => {
    let total = product.price * quantity;
    
    Object.values(selectedOptions).forEach(categoryOptions => {
      categoryOptions.forEach(option => {
        total += option.price * quantity;
      });
    });
    
    return total;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(price);
  };

  const handleAddToCart = () => {
    if (!validateSelections()) {
      return;
    }

    const allSelectedOptions = Object.values(selectedOptions).flat();
    const totalPrice = calculateTotalPrice();
    
    // Crear texto descriptivo de las opciones para mostrar en el carrito
    const optionsText: string[] = [];
    categories.forEach(category => {
      const categorySelections = selectedOptions[category.id] || [];
      if (categorySelections.length > 0) {
        categorySelections.forEach(option => {
          const priceText = option.price > 0 ? ` (+${formatPrice(option.price)})` : '';
          optionsText.push(`${option.name}${priceText}`);
        });
      }
    });
    
    // Crear objeto con la información completa
    const orderData = {
      quantity,
      selectedOptions: allSelectedOptions,
      totalPrice,
      optionsText
    };
    
    // Agregar al carrito con información detallada
    const productWithOptions = {
      ...product,
      optionsText
    };
    
    onAddToCart(productWithOptions, orderData, totalPrice);
    onClose();
    setQuantity(1);
    setSelectedOptions({});
  };

  const getSelectionText = (category: OptionCategory): string => {
    if (category.min_selections === category.max_selections) {
      return `Selecciona ${category.max_selections}`;
    } else if (category.min_selections === 0) {
      return `Máximo ${category.max_selections}`;
    } else {
      return `${category.min_selections} - ${category.max_selections} selecciones`;
    }
  };

  const getDependencyText = (category: OptionCategory): string => {
    if (!category.depends_on_category_id) return '';
    
    const dependentCategory = categories.find(c => c.id === category.depends_on_category_id);
    if (!dependentCategory) return '';
    
    return `Completa "${dependentCategory.name}" primero`;
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50 animate-fadeIn"
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevenir scroll del backdrop
        const target = e.target as HTMLElement;
        if (target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div 
        className="bg-white rounded-t-[2rem] w-full max-w-md h-[90vh] flex flex-col shadow-elegant-xl animate-slideInBottom"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header fijo con botón cerrar */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 line-clamp-1">{product.name}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 hover:scale-110 active:scale-95 transition-all duration-200 shadow-sm flex-shrink-0"
            >
              <i className="ri-close-line text-gray-600 text-lg"></i>
            </button>
          </div>
        </div>

        {/* Contenido principal - SCROLL ÚNICO DE TODO EL MODAL */}
        <div 
          ref={scrollContainerRef} 
          className="flex-1 overflow-y-auto overscroll-contain min-h-0"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{ 
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="px-4 py-4 space-y-4">
            {/* Imagen del producto */}
            <div className="aspect-[16/9] w-full rounded-[1.5rem] overflow-hidden shadow-elegant">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            
            {/* Descripción */}
            <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
            
            {/* Precio base */}
            <div className="flex items-center justify-between bg-orange-50 p-3 rounded-[1.5rem] border border-orange-200">
              <span className="text-gray-700 font-semibold text-sm">Precio base:</span>
              <span className="text-orange-600 font-bold text-xl">
                {formatPrice(product.price)}
              </span>
            </div>

            {/* Sección de opciones - FLUYE NATURALMENTE */}
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                <p className="text-gray-500 mt-3 text-sm font-medium">Cargando opciones...</p>
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="ri-shopping-bag-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-gray-500 text-sm font-medium">Este producto no tiene opciones adicionales</p>
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {categories.map((category) => {
                  const categoryOptions = options.filter(opt => 
                    opt.option_category_id === category.id || opt.category_id === category.id
                  );
                  const isUnlocked = isCategoryUnlocked(category);
                  const dependencyText = getDependencyText(category);
                  const currentSelections = selectedOptions[category.id] || [];
                  
                  return (
                    <div 
                      key={category.id} 
                      ref={el => categoryRefs.current[category.id] = el}
                      className="space-y-3"
                    >
                      {/* Título de categoría - SIN BORDES, solo texto */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 flex-1">
                          <h3 className={`text-lg font-bold ${isUnlocked ? 'text-gray-900' : 'text-gray-500'}`}>
                            {category.name}
                          </h3>
                          {!isUnlocked && (
                            <i className="ri-lock-line text-gray-400 text-base"></i>
                          )}
                          {category.is_required && (
                            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-semibold border border-red-200">
                              Obligatorio
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 font-medium">
                            {getSelectionText(category)}
                          </div>
                          {currentSelections.length > 0 && (
                            <div className="text-xs text-orange-600 font-bold mt-1">
                              {currentSelections.length} seleccionado{currentSelections.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mensaje de dependencia */}
                      {!isUnlocked && dependencyText && (
                        <div className="p-3 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-300 rounded-[1.5rem] text-xs text-yellow-800 shadow-sm">
                          <i className="ri-information-line mr-2 text-yellow-600"></i>
                          <span className="font-medium">{dependencyText}</span>
                        </div>
                      )}
                      
                      {/* Opciones de la categoría */}
                      <div className="space-y-2.5">
                        {categoryOptions.map((option) => {
                          const isSelected = selectedOptions[category.id]?.some(opt => opt.id === option.id);
                          const isRadio = category.max_selections === 1;
                          
                          return (
                            <button
                              key={option.id}
                              onClick={() => handleOptionToggle(option, category.id)}
                              disabled={!isUnlocked}
                              className={`w-full p-4 rounded-[1.5rem] border-2 transition-all duration-300 text-left hover-lift ${
                                !isUnlocked
                                  ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-60'
                                  : isSelected
                                  ? 'border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md'
                                  : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 flex-1">
                                  <div className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                                    !isUnlocked
                                      ? 'border-gray-300 bg-gray-200'
                                      : isSelected 
                                      ? 'border-orange-500 bg-gradient-to-br from-orange-500 to-orange-600 shadow-md scale-110' 
                                      : 'border-gray-300 hover:border-orange-400'
                                  }`}>
                                    {isSelected && isUnlocked && (
                                      <i className={`text-white text-sm font-bold ${
                                        isRadio ? 'ri-circle-fill' : 'ri-check-line'
                                      }`}></i>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <p className={`font-semibold text-sm ${isUnlocked ? 'text-gray-900' : 'text-gray-500'}`}>
                                      {option.name}
                                    </p>
                                  </div>
                                </div>
                                {option.price > 0 && (
                                  <div className="text-right ml-3">
                                    <span className={`font-bold text-base ${
                                      isUnlocked ? 'text-orange-600' : 'text-gray-400'
                                    }`}>
                                      +{formatPrice(option.price)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Total - PARTE DEL FLUJO */}
            <div className="flex items-center justify-between p-4 bg-white rounded-[1.5rem] border-2 border-orange-200 shadow-sm mt-4">
              <span className="text-lg font-bold text-gray-700">Total:</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
                {formatPrice(calculateTotalPrice())}
              </span>
            </div>
          </div>
        </div>

        {/* Footer fijo con botón agregar */}
        <div className="flex-shrink-0 p-4 border-t-2 border-gray-100 bg-gradient-to-r from-white to-orange-50/30">
          <button
            onClick={handleAddToCart}
            disabled={!isValidSelection()}
            className={`w-full py-4 rounded-[1.5rem] font-bold text-base transition-all duration-300 flex items-center justify-center space-x-2 ${
              isValidSelection()
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <i className="ri-shopping-cart-2-line text-xl"></i>
            <span>Agregar al carrito</span>
          </button>
          
          {!isValidSelection() && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-[1.5rem]">
              <p className="text-red-600 text-xs text-center font-semibold flex items-center justify-center">
                <i className="ri-alert-line mr-2"></i>
                Por favor selecciona todas las opciones obligatorias
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
