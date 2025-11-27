
import { useState, useEffect } from 'react';
import { categoriesApi, productsApi, productOptionsApi, extrasApi, recipesApi } from '../../../lib/api';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/useToast';
import StockManagement from './StockManagement';

interface Category {
  id: string;
  name: string;
  order_index: number;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  order_index: number;
  category?: Category;
}

interface OptionCategory {
  id: string;
  name: string;
  is_required: boolean;
  max_selections: number;
  order_index: number;
}

interface ProductOption {
  id: string;
  name: string;
  price: number;
  category_id: string;
  order_index: number;
  is_available: boolean;
  category?: OptionCategory;
}

interface MenuManagementProps {
  storeId?: string | null;
}

export default function MenuManagement({ storeId }: MenuManagementProps = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'extras' | 'stock'>('products');
  const [showInstructions, setShowInstructions] = useState(false);
  
  // Mostrar instrucciones solo una vez
  useEffect(() => {
    const hasSeenInstructions = localStorage.getItem('menuManagement_instructions_seen');
    if (!hasSeenInstructions) {
      setShowInstructions(true);
    }
  }, []);
  
  const handleCloseInstructions = () => {
    setShowInstructions(false);
    localStorage.setItem('menuManagement_instructions_seen', 'true');
  };
  
  // Estados para recetas
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedProductForRecipe, setSelectedProductForRecipe] = useState<Product | null>(null);
  const [recipeForm, setRecipeForm] = useState<Array<{ingredient_id: string, ingredient_name: string, quantity: number}>>([]);
  const { error: showError, success: showSuccess } = useToast();

  // Estados para categorías
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Estados para productos
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    category_id: ''
  });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    category_id: ''
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [editSelectedImage, setEditSelectedImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>('');

  // Estados para extras por producto
  const [selectedProductForExtras, setSelectedProductForExtras] = useState<any>(null);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productOptionCategories, setProductOptionCategories] = useState<any[]>([]);
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [newOptionCategory, setNewOptionCategory] = useState({
    name: '',
    is_required: false,
    max_selections: 1,
    product_id: ''
  });
  const [newOption, setNewOption] = useState({
    name: '',
    price: 0,
    category_id: ''
  });
  const [editingOptionCategory, setEditingOptionCategory] = useState<any>(null);
  const [editingOption, setEditingOption] = useState<any>(null);
  const [savingOption, setSavingOption] = useState(false);

  // Extras globales (UX mejorada)
  const [extrasManagerOpen, setExtrasManagerOpen] = useState(false);
  const [extrasName, setExtrasName] = useState('');
  const [extrasPrice, setExtrasPrice] = useState<number>(0);
  const [extrasActive, setExtrasActive] = useState<boolean>(true);
  const [extrasSaving, setExtrasSaving] = useState(false);
  const [allExtras, setAllExtras] = useState<any[]>([]);
  // Asignación de extra existente a categoría de un producto
  const [selectedExistingExtraId, setSelectedExistingExtraId] = useState<string>('');
  const [selectedTargetCategoryId, setSelectedTargetCategoryId] = useState<string>('');
  const [selectedExistingExtraPrice, setSelectedExistingExtraPrice] = useState<number>(0);
  const [selectedExistingExtraActive, setSelectedExistingExtraActive] = useState<boolean>(true);

  useEffect(() => {
    if (storeId) {
      loadData();
      loadIngredients();
      loadRecipes();
    }
  }, [storeId]);

  const loadIngredients = async () => {
    try {
      // Intentar cargar insumos desde la API del backend (si existe)
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/ingredients` : `${API_URL}/api/ingredients`;
      const response = await fetch(endpoint);
      
      // Verificar si la respuesta es HTML
      const responseText = await response.text();
      if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.warn('⚠️ [MenuManagement] El servidor devolvió HTML para /ingredients, usando datos vacíos');
        setIngredients([]);
        return;
      }
      
      if (!response.ok) {
        // Si el endpoint no existe (404), usar datos vacíos sin mostrar error
        if (response.status === 404) {
          setIngredients([]);
          return;
        }
        // Silenciar otros errores también
        setIngredients([]);
        return;
      }
      
      try {
        const data = JSON.parse(responseText);
        setIngredients(data || []);
      } catch (parseError) {
        console.error('Error al parsear ingredients:', parseError);
        setIngredients([]);
      }
    } catch (error: any) {
      // Silenciar errores - la tabla puede no existir
      setIngredients([]);
    }
  };

  const loadRecipes = async () => {
    try {
      const data = await recipesApi.getAll();
      setRecipes(data || []);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      // Si es 404, la tabla puede no existir aún
      if (error.status === 404) {
        setRecipes([]);
      } else {
        setRecipes([]);
      }
    }
  };

  // Cargar datos usando backend API (seguro)
  const loadData = async () => {
    setLoading(true);
    try {
      if (!storeId) {
        console.warn('⚠️ [MenuManagement] No hay storeId, no se pueden cargar categorías/productos');
        setCategories([]);
        setProducts([]);
        setLoading(false);
        return;
      }
      
      const [categoriesData, productsData] = await Promise.all([
        categoriesApi.getAll({ storeId }),
        productsApi.getAll({ storeId })
      ]);
      console.log('📦 [MenuManagement] Categorías cargadas:', categoriesData?.length || 0);
      console.log('🍔 [MenuManagement] Productos cargados:', productsData?.length || 0);
      setCategories(categoriesData || []);
      setProducts(productsData || []);
    } catch (error: any) {
      console.error('❌ [MenuManagement] Error al cargar datos:', error);
      console.error('❌ [MenuManagement] Detalles:', error.message);
      if (showError) {
        showError(`Error al cargar datos del menú: ${error.message || 'Error desconocido'}`);
      }
      // Asegurar que los arrays estén inicializados
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar extras de un producto específico usando backend API
  const loadProductExtras = async (productId: string) => {
    try {
      console.log('🔄 [Extras] Cargando extras para producto:', productId);
      const categoriesData = await productOptionsApi.getCategories(productId);
      console.log('📦 [Extras] Categorías cargadas:', categoriesData);
      setProductOptionCategories(categoriesData || []);
      
      let allOptions: any[] = [];
      for (const cat of categoriesData || []) {
        const opts = await productOptionsApi.getOptions(cat.id);
        console.log(`📋 [Extras] Opciones para categoría ${cat.name}:`, opts);
        // Normalizar los campos (pueden venir en diferentes formatos)
        const normalizedOpts = (opts || []).map((opt: any) => ({
          ...opt,
          category_id: opt.category_id || opt.categoryId || opt.optionCategoryId || cat.id,
          // Normalizar el precio: puede venir como price_modifier, priceModifier, o price
          price: opt.price_modifier !== undefined ? opt.price_modifier : 
                 (opt.priceModifier !== undefined ? opt.priceModifier : 
                 (opt.price !== undefined ? opt.price : 0))
        }));
        allOptions = allOptions.concat(normalizedOpts);
      }
      console.log('✅ [Extras] Total de opciones cargadas:', allOptions.length);
      setProductOptions(allOptions);
      
      // Forzar re-render después de un pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        setProductOptions([...allOptions]);
      }, 100);
    } catch (error) {
      console.error('❌ [Extras] Error al cargar extras:', error);
      if (showError) {
        showError('Error al cargar extras del producto');
      }
    }
  };

  // Cargar lista agregada de extras (todas las opciones de todos los productos)
  const loadAllExtras = async () => {
    try {
      const extras = await extrasApi.getAll();
      setAllExtras(extras || []);
    } catch (e) {
      console.error('Error cargando extras globales:', e);
      setAllExtras([]);
    }
  };

  // Abrir el gestor global de extras
  const openExtrasManager = () => {
    setExtrasManagerOpen(true);
    setExtrasName('');
    setExtrasPrice(0);
    setExtrasActive(true);
  };

  // Crear extra global (solo creación)
  const createGlobalExtra = async () => {
    if (!extrasName.trim()) {
      showError && showError('El nombre del extra es obligatorio');
      return;
    }
    try {
      setExtrasSaving(true);
      const extra = await extrasApi.create({
        name: extrasName.trim(),
        basePrice: Number(extrasPrice) || 0,
        isActive: !!extrasActive
      });
      void extra; // reservado para futuras ediciones
      showSuccess && showSuccess('Extra creado correctamente');
      setExtrasManagerOpen(false);
      await loadAllExtras();
    } catch (e: any) {
      console.error('Error creando extra global:', e);
      showError && showError(e?.message || 'Error al crear el extra');
    } finally {
      setExtrasSaving(false);
    }
  };

  // Comprimir y convertir imagen a base64 (siempre comprimir para reducir tamaño)
  const convertImageToBase64 = (file: File, maxSizeMB: number = 2): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Validar tamaño del archivo
      if (file.size > maxSizeMB * 1024 * 1024) {
        reject(new Error(`La imagen es demasiado grande. Máximo ${maxSizeMB}MB`));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        
        // Siempre comprimir imágenes para reducir el tamaño del payload
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Reducir más para evitar 413
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          // Redimensionar si es necesario
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Comprimir a JPEG con calidad 0.7 (más compresión)
            const compressed = canvas.toDataURL('image/jpeg', 0.7);
            console.log(`📸 [MenuManagement] Imagen comprimida: ${(compressed.length / 1024).toFixed(2)}KB`);
            resolve(compressed);
          } else {
            resolve(result);
          }
        };
        img.onerror = () => {
          // Si falla la compresión, intentar con el original pero mostrar advertencia
          console.warn('⚠️ [MenuManagement] No se pudo comprimir la imagen, usando original');
          if (result.length > 2 * 1024 * 1024) { // Si es mayor a 2MB, rechazar
            reject(new Error('La imagen es demasiado grande incluso después de intentar comprimir. Por favor, usa una imagen más pequeña.'));
          } else {
            resolve(result);
          }
        };
        img.src = result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Manejar selección de imagen para nuevo producto
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        if (showError) showError('Por favor selecciona un archivo de imagen');
        return;
      }
      
      // Validar tamaño (máximo 3MB antes de comprimir)
      if (file.size > 3 * 1024 * 1024) {
        if (showError) showError('La imagen es demasiado grande. Máximo 3MB. Se comprimirá automáticamente.');
        return;
      }

      try {
        setSelectedImage(file);
        const base64 = await convertImageToBase64(file, 3);
        setImagePreview(base64);
        setNewProduct({ ...newProduct, image_url: base64 });
      } catch (error: any) {
        console.error('Error al procesar imagen:', error);
        if (showError) showError(error.message || 'Error al procesar la imagen');
      }
    }
  };

  // Manejar selección de imagen para editar producto
  const handleEditImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        if (showError) showError('Por favor selecciona un archivo de imagen');
        return;
      }
      
      // Validar tamaño (máximo 3MB antes de comprimir)
      if (file.size > 3 * 1024 * 1024) {
        if (showError) showError('La imagen es demasiado grande. Máximo 3MB. Se comprimirá automáticamente.');
        return;
      }

      try {
        setEditSelectedImage(file);
        const base64 = await convertImageToBase64(file, 3);
        setEditImagePreview(base64);
        setEditProduct({ ...editProduct, image_url: base64 });
      } catch (error: any) {
        console.error('Error al procesar imagen:', error);
        if (showError) showError(error.message || 'Error al procesar la imagen');
      }
    }
  };

  // Limpiar imagen seleccionada para nuevo producto
  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview('');
    setNewProduct({ ...newProduct, image_url: '' });
  };

  // Limpiar imagen seleccionada para editar producto
  const clearEditImage = () => {
    setEditSelectedImage(null);
    setEditImagePreview('');
    setEditProduct({ ...editProduct, image_url: '' });
  };

  // CATEGORÍAS - Funciones simples
  const saveCategory = async () => {
    if (!newCategoryName.trim()) {
      if (showError) showError('El nombre de la categoría es obligatorio');
      return;
    }

    try {
      setSavingCategory(true);
      await categoriesApi.create({
        name: newCategoryName.trim(),
        display_order: categories.length,
        order_index: categories.length,
        is_active: true,
        storeId: storeId || undefined
      });

      if (showSuccess) showSuccess('Categoría creada exitosamente');
      closeCategoryModal();
      loadData();
    } catch (error) {
      console.error('Error al crear categoría:', error);
      if (showError) showError('Error al crear la categoría');
    } finally {
      setSavingCategory(false);
    }
  };

  const openCategoryModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setEditCategoryName(category.name);
    } else {
      setEditingCategory(null);
      setEditCategoryName('');
      setNewCategoryName('');
    }
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setEditCategoryName('');
    setNewCategoryName('');
  };

  const updateCategory = async () => {
    if (!editCategoryName.trim() || !editingCategory) {
      if (showError) showError('El nombre de la categoría es obligatorio');
      return;
    }

    try {
      setSavingCategory(true);
      await categoriesApi.update(editingCategory.id, {
        name: editCategoryName.trim()
      });

      if (showSuccess) showSuccess('Categoría actualizada exitosamente');
      closeCategoryModal();
      loadData();
    } catch (error: any) {
      console.error('Error al actualizar categoría:', error);
      if (showError) showError(error.message || 'Error al actualizar la categoría');
    } finally {
      setSavingCategory(false);
    }
  };


  const deleteCategory = async (categoryId: string) => {
    // Verificar si tiene productos
    const hasProducts = products.some(p => p.category_id === categoryId);
    if (hasProducts) {
      if (showError) showError('No se puede eliminar una categoría que tiene productos');
      return;
    }

    if (!confirm('¿Estás seguro de eliminar esta categoría?')) {
      return;
    }

    try {
      await categoriesApi.delete(categoryId);

      if (showSuccess) showSuccess('Categoría eliminada exitosamente');
      loadData();
    } catch (error) {
      console.error('Error al eliminar categoría:', error);
      if (showError) showError('Error al eliminar la categoría');
    }
  };

  // PRODUCTOS - Funciones simples
  const saveProduct = async () => {
    if (!newProduct.name.trim()) {
      if (showError) showError('El nombre del producto es obligatorio');
      return;
    }
    if (!newProduct.category_id) {
      if (showError) showError('Debes seleccionar una categoría');
      return;
    }
    if (newProduct.price <= 0) {
      if (showError) showError('El precio debe ser mayor a 0');
      return;
    }

    try {
      setSavingProduct(true);
      await productsApi.create({
        name: newProduct.name.trim(),
        description: newProduct.description.trim(),
        price: newProduct.price,
        image_url: newProduct.image_url,
        category_id: newProduct.category_id,
        display_order: products.filter(p => p.category_id === newProduct.category_id).length,
        order_index: products.filter(p => p.category_id === newProduct.category_id).length,
        is_available: true,
        storeId: storeId || undefined
      });

      if (showSuccess) showSuccess('Producto creado exitosamente');
      setNewProduct({
        name: '',
        description: '',
        price: 0,
        image_url: '',
        category_id: ''
      });
      clearImage();
      loadData();
    } catch (error) {
      console.error('Error al crear producto:', error);
      if (showError) showError('Error al crear el producto');
    } finally {
      setSavingProduct(false);
    }
  };

  // Función para agregar productos de ejemplo
  const addSampleProducts = async () => {
    if (!storeId) {
      if (showError) showError('No hay tienda seleccionada');
      return;
    }

    // Primero, asegurarse de que haya al menos una categoría
    if (categories.length === 0) {
      if (showError) showError('Primero debes crear al menos una categoría');
      return;
    }

    // Usar la primera categoría disponible o crear una de ejemplo
    let targetCategoryId = categories[0].id;
    
    // Si no hay categorías, crear una de ejemplo
    if (!targetCategoryId) {
      try {
        const newCategory = await categoriesApi.create({
          name: 'Productos de Ejemplo',
          display_order: 0,
          order_index: 0,
          is_active: true,
          storeId: storeId
        });
        targetCategoryId = newCategory.id;
        await loadData(); // Recargar para obtener la nueva categoría
      } catch (error) {
        if (showError) showError('Error al crear categoría de ejemplo');
        return;
      }
    }

    // Productos de ejemplo con URLs de imágenes
    const sampleProducts = [
      {
        name: 'Milanesa Napolitana',
        description: 'Milanesa de carne con jamón, queso y salsa de tomate',
        price: 4500,
        image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Pizza Muzzarella',
        description: 'Pizza clásica con queso muzzarella y salsa de tomate',
        price: 3500,
        image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Hamburguesa Completa',
        description: 'Hamburguesa con carne, lechuga, tomate, cebolla y salsas',
        price: 3800,
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Ensalada César',
        description: 'Lechuga, pollo, crutones, queso parmesano y aderezo césar',
        price: 3200,
        image_url: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Pasta Carbonara',
        description: 'Fettuccine con panceta, crema, queso parmesano y huevo',
        price: 4200,
        image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Asado de Tira',
        description: 'Asado de tira a la parrilla con guarnición',
        price: 5500,
        image_url: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Empanadas (Docena)',
        description: 'Docena de empanadas de carne, pollo o jamón y queso',
        price: 2800,
        image_url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      },
      {
        name: 'Papas Fritas',
        description: 'Papas fritas caseras con sal',
        price: 1500,
        image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&h=600&fit=crop',
        category_id: targetCategoryId
      }
    ];

    try {
      setSavingProduct(true);
      let created = 0;
      let failed = 0;

      for (const product of sampleProducts) {
        try {
          await productsApi.create({
            ...product,
            display_order: products.length + created,
            order_index: products.length + created,
            is_available: true,
            storeId: storeId
          });
          created++;
        } catch (error: any) {
          console.error(`Error al crear producto ${product.name}:`, error);
          failed++;
        }
      }

      if (showSuccess) {
        showSuccess(`${created} productos de ejemplo creados exitosamente${failed > 0 ? ` (${failed} fallaron)` : ''}`);
      }
      loadData();
    } catch (error: any) {
      console.error('Error al crear productos de ejemplo:', error);
      if (showError) showError(error.message || 'Error al crear productos de ejemplo');
    } finally {
      setSavingProduct(false);
    }
  };

  const startEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditProduct({
      name: product.name,
      description: product.description || '',
      price: product.price,
      image_url: product.image_url || '',
      category_id: product.category_id || product.categoryId || product.category?.id || ''
    });
    setEditImagePreview(product.image_url || '');
    setEditSelectedImage(null);
  };

  const updateProduct = async () => {
    if (!editProduct.name.trim() || !editingProduct) {
      if (showError) showError('El nombre del producto es obligatorio');
      return;
    }
    if (!editProduct.category_id) {
      if (showError) showError('Debes seleccionar una categoría');
      return;
    }
    if (editProduct.price <= 0) {
      if (showError) showError('El precio debe ser mayor a 0');
      return;
    }

    try {
      setSavingProduct(true);
      
      const updateData: any = {
        name: editProduct.name.trim(),
        description: editProduct.description ? editProduct.description.trim() : null,
        price: editProduct.price,
        category_id: editProduct.category_id
      };
      
      // Solo incluir image_url si tiene un valor (no vacío)
      if (editProduct.image_url && editProduct.image_url.trim() !== '') {
        updateData.image_url = editProduct.image_url;
      } else if (editImagePreview && editImagePreview.trim() !== '') {
        updateData.image_url = editImagePreview;
      }

      await productsApi.update(editingProduct.id, updateData);

      if (showSuccess) showSuccess('Producto actualizado exitosamente');
      setEditingProduct(null);
      setEditProduct({
        name: '',
        description: '',
        price: 0,
        image_url: '',
        category_id: ''
      });
      clearEditImage();
      setShowProductModal(false);
      loadData();
    } catch (error: any) {
      console.error('Error al actualizar producto:', error);
      showError(error.message || 'Error al actualizar el producto');
    } finally {
      setSavingProduct(false);
    }
  };

  const cancelEditProduct = () => {
    setEditingProduct(null);
    setEditProduct({
      name: '',
      description: '',
      price: 0,
      image_url: '',
      category_id: ''
    });
    clearEditImage();
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) {
      return;
    }

    try {
      await productsApi.delete(productId);

      if (showSuccess) showSuccess('Producto eliminado exitosamente');
      loadData();
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      if (showError) showError('Error al eliminar el producto');
    }
  };

  // EXTRAS - Funciones
  const openExtrasModal = (product: any) => {
    setSelectedProductForExtras(product);
    setShowExtrasModal(true);
    loadProductExtras(product.id);
  };

  const closeExtrasModal = () => {
    setShowExtrasModal(false);
    setSelectedProductForExtras(null);
    setProductOptionCategories([]);
    setProductOptions([]);
    setNewOptionCategory({ name: '', is_required: false, max_selections: 1, product_id: '' });
    setNewOption({ name: '', price: 0, category_id: '' });
    setEditingOptionCategory(null);
    setEditingOption(null);
  };

  const saveOptionCategory = async () => {
    if (!newOptionCategory.name.trim()) {
      if (showError) showError('El nombre de la categoría es obligatorio');
      return;
    }

    if (!selectedProductForExtras) {
      if (showError) showError('No hay producto seleccionado');
      return;
    }

    setSavingCategory(true);
    try {
      const categoryData = {
        ...newOptionCategory,
        product_id: selectedProductForExtras.id,
        display_order: productOptionCategories.length,
        order_index: productOptionCategories.length // Para compatibilidad
      };

      await productOptionsApi.createCategory(categoryData);

      if (showSuccess) showSuccess('Categoría de extra creada correctamente');
      setNewOptionCategory({ name: '', is_required: false, max_selections: 1, product_id: '' });
      loadProductExtras(selectedProductForExtras.id);
    } catch (error: any) {
      console.error('Error al crear categoría:', error);
      if (showError) showError(error.message || 'Error al crear la categoría de extra');
    } finally {
      setSavingCategory(false);
    }
  };

  const updateOptionCategory = async () => {
    if (!editingOptionCategory?.name.trim()) {
      if (showError) showError('El nombre de la categoría es obligatorio');
      return;
    }

    setSavingCategory(true);
    try {
      await productOptionsApi.updateCategory(editingOptionCategory.id, {
        name: editingOptionCategory.name,
        is_required: editingOptionCategory.is_required,
        max_selections: editingOptionCategory.max_selections
      });

      if (showSuccess) showSuccess('Categoría actualizada correctamente');
      setEditingOptionCategory(null);
      loadProductExtras(selectedProductForExtras!.id);
    } catch (error: any) {
      console.error('Error al actualizar categoría:', error);
      if (showError) showError(error.message || 'Error al actualizar la categoría');
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteOptionCategory = async (categoryId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta categoría? Se eliminarán todos sus extras.')) {
      return;
    }

    setSavingCategory(true);
    try {
      await productOptionsApi.deleteCategory(categoryId);

      if (showSuccess) showSuccess('Categoría eliminada correctamente');
      loadProductExtras(selectedProductForExtras!.id);
    } catch (error: any) {
      console.error('Error al eliminar categoría:', error);
      if (showError) showError(error.message || 'Error al eliminar la categoría');
    } finally {
      setSavingCategory(false);
    }
  };

  const saveOption = async () => {
    if (!newOption.name.trim()) {
      if (showError) showError('El nombre del extra es obligatorio');
      return;
    }

    if (!newOption.category_id) {
      if (showError) showError('Debes seleccionar una categoría');
      return;
    }

    if (!selectedProductForExtras) {
      if (showError) showError('No hay producto seleccionado');
      return;
    }

    setSavingOption(true);
    try {
      const priceValue = parseFloat(newOption.price) || 0;
      const optionData = {
        name: newOption.name.trim(),
        price: priceValue,
        priceModifier: priceValue, // El backend espera priceModifier
        price_modifier: priceValue, // También acepta snake_case
        optionCategoryId: newOption.category_id, // El backend espera optionCategoryId
        categoryId: newOption.category_id, // Para compatibilidad
        category_id: newOption.category_id, // Para compatibilidad
        displayOrder: productOptions.filter(opt => {
          const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
          return optCatId === newOption.category_id;
        }).length,
        display_order: productOptions.filter(opt => {
          const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
          return optCatId === newOption.category_id;
        }).length,
        isAvailable: true,
        is_available: true
      };

      console.log('💾 [Extras] Creando extra con datos:', optionData);
      const createdOption = await productOptionsApi.createOption(optionData);
      console.log('✅ [Extras] Extra creado:', createdOption);

      if (showSuccess) showSuccess('Extra creado correctamente');
      setNewOption({ name: '', price: 0, category_id: '' });
      
      // Recargar extras después de crear
      await loadProductExtras(selectedProductForExtras.id);
    } catch (error: any) {
      console.error('❌ [Extras] Error al crear extra:', error);
      const errorMessage = error?.details?.message || error?.message || 'Error al crear el extra';
      if (showError) showError(errorMessage);
    } finally {
      setSavingOption(false);
    }
  };

  const updateOption = async () => {
    if (!editingOption?.name.trim()) {
      if (showError) showError('El nombre del extra es obligatorio');
      return;
    }

    setSavingOption(true);
    try {
      await productOptionsApi.updateOption(editingOption.id, {
        name: editingOption.name,
        price: Number(editingOption.price)
      });

      if (showSuccess) showSuccess('Extra actualizado correctamente');
      setEditingOption(null);
      loadProductExtras(selectedProductForExtras!.id);
    } catch (error: any) {
      console.error('Error al actualizar extra:', error);
      if (showError) showError(error.message || 'Error al actualizar el extra');
    } finally {
      setSavingOption(false);
    }
  };

  const deleteOption = async (optionId: string) => {
    if (!confirm('¿Estás seguro de eliminar este extra?')) {
      return;
    }

    setSavingOption(true);
    try {
      await productOptionsApi.deleteOption(optionId);

      if (showSuccess) showSuccess('Extra eliminado correctamente');
      loadProductExtras(selectedProductForExtras!.id);
    } catch (error: any) {
      console.error('Error al eliminar extra:', error);
      if (showError) showError(error.message || 'Error al eliminar el extra');
    } finally {
      setSavingOption(false);
    }
  };

  // Estado de carga global para botones
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header - Minimalista */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Menú</h1>
            <p className="text-sm text-gray-500">Administra productos, categorías, extras e insumos</p>
          </div>
        </div>
      </div>

      {/* Navegación Simplificada */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'products'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            🛒 Productos
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'categories'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            🗂️ Categorías
          </button>
          <button
            onClick={() => setActiveTab('extras')}
            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'extras'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            ➕ Extras
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-8 py-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'stock'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            📦 Insumos
          </button>
        </div>
        <div className="p-6">

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C7C7C7] border-t-[#111111] mx-auto"></div>
              <p className="mt-2 text-sm text-[#C7C7C7] font-medium">Cargando...</p>
            </div>
          ) : (
            <>
              {/* Pestaña Categorías - Diseño Moderno */}
              {activeTab === 'categories' && (
                <div className="p-8">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Categorías</h2>
                      <p className="text-sm text-gray-500">{categories.length} categoría{categories.length !== 1 ? 's' : ''} creada{categories.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => openCategoryModal()}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
                    >
                      <span className="text-lg">+</span>
                      <span>Agregar Categoría</span>
                    </button>
                  </div>

                  {/* Lista de categorías - Cards Modernas */}
                  {categories.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-16 text-center">
                      <div className="text-6xl mb-4">📂</div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay categorías</h3>
                      <p className="text-sm text-gray-500 mb-6">Crea tu primera categoría para organizar los productos</p>
                      <button
                        onClick={() => openCategoryModal()}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all"
                      >
                        + Crear Primera Categoría
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {categories.map((category) => {
                        const productsCount = products.filter(p => p.category_id === category.id).length;
                        return (
                          <div key={category.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-all">
                            <div className="mb-4">
                              <h3 className="font-bold text-xl text-gray-900 mb-2">{category.name}</h3>
                              <p className="text-sm text-gray-500">
                                {productsCount} producto{productsCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <div className="flex gap-2 pt-4 border-t border-gray-100">
                              <button
                                onClick={() => openCategoryModal(category)}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all text-sm"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => deleteCategory(category.id)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all text-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

          {/* Pestaña Recetas - ELIMINADA (se integra en productos) */}
          {false && activeTab === 'recipes' && (
            <div className="space-y-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[#111111] mb-2">RECETAS</h3>
                <p className="text-sm text-[#C7C7C7] mb-4">
                  Define qué insumos usa cada plato y cuánto consume. Primero carga los insumos en "Stock & Insumos".
                </p>
                {ingredients.length === 0 && (
                  <div className="bg-white border-2 border-[#FFC300] rounded-sm p-4 mb-4">
                    <p className="text-sm text-[#111111]">
                      ⚠️ <strong>Primero debes cargar insumos</strong> en la sección "Stock & Insumos" para poder crear recetas.
                    </p>
                  </div>
                )}
              </div>

              {products.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">
                    Primero crea productos del menú para asignarles recetas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((product) => {
                    const productRecipe = recipes.find(r => r.product_id === product.id);
                    return (
                      <div key={product.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-base text-[#111111] mb-1">{product.name}</h3>
                            <div className="text-xs text-[#C7C7C7] mb-2">
                              {categories.find(c => c.id === product.category_id)?.name || 'Sin categoría'}
                            </div>
                            {productRecipe ? (
                              <div className="inline-block px-2 py-1 bg-[#111111] border border-[#FFC300] rounded-sm text-xs font-medium text-white mb-2">
                                ✅ Receta configurada
                              </div>
                            ) : (
                              <div className="inline-block px-2 py-1 bg-white border border-[#C7C7C7] rounded-sm text-xs font-medium text-[#C7C7C7] mb-2">
                                ⚠️ Sin receta
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedProductForRecipe(product);
                              // Cargar receta existente si existe
                              if (productRecipe) {
                                setRecipeForm(productRecipe.ingredients || []);
                              } else {
                                setRecipeForm([]);
                              }
                              setShowRecipeModal(true);
                            }}
                            className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                          >
                            {productRecipe ? 'Editar' : 'Crear'} Receta
                          </button>
                        </div>
                        
                        {productRecipe && productRecipe.ingredients && productRecipe.ingredients.length > 0 && (
                          <div className="pt-3 border-t border-[#C7C7C7]">
                            <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-2">Ingredientes:</div>
                            <div className="space-y-1">
                              {productRecipe.ingredients.slice(0, 3).map((ing: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span className="text-[#111111]">{ing.ingredient_name}</span>
                                  <span className="text-[#C7C7C7]">{ing.quantity} {ingredients.find(i => i.id === ing.ingredient_id)?.unit || ''}</span>
                                </div>
                              ))}
                              {productRecipe.ingredients.length > 3 && (
                                <div className="text-xs text-[#C7C7C7]">+{productRecipe.ingredients.length - 3} más</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pestaña Productos - Diseño Moderno */}
          {activeTab === 'products' && (
            <div className="p-8">
              {/* Header con botón a la izquierda */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setNewProduct({
                        name: '',
                        description: '',
                        price: 0,
                        image_url: '',
                        category_id: ''
                      });
                      setImagePreview('');
                      setSelectedImage(null);
                      setShowProductModal(true);
                    }}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <span className="text-lg">+</span>
                    <span>Agregar Producto</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('¿Deseas agregar productos de ejemplo? Esto creará varios productos con imágenes de muestra.')) {
                        return;
                      }
                      await addSampleProducts();
                    }}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
                    title="Agregar productos de ejemplo con imágenes"
                  >
                    <span className="text-lg">🎲</span>
                    <span>Productos de Ejemplo</span>
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Productos</h2>
                    <p className="text-sm text-gray-500">{products.length} producto{products.length !== 1 ? 's' : ''} en el menú</p>
                  </div>
                </div>
              </div>

              {/* Lista de productos - Cards Modernas */}
              {products.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-16 text-center">
                  <div className="text-6xl mb-4">🍔</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay productos</h3>
                  <p className="text-sm text-gray-500 mb-6">Comienza agregando tu primer producto al menú</p>
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setNewProduct({
                        name: '',
                        description: '',
                        price: 0,
                        image_url: '',
                        category_id: ''
                      });
                      setImagePreview('');
                      setSelectedImage(null);
                      setShowProductModal(true);
                    }}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all"
                  >
                    + Crear Primer Producto
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.map((product) => (
                    <div key={product.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-all">
                      {/* Imagen del producto */}
                      <div className="relative h-48 bg-gray-100">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-50">
                            <span className="text-5xl text-gray-300">📷</span>
                          </div>
                        )}
                        <div className="absolute top-3 right-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            product.is_available 
                              ? 'bg-green-100 text-green-700 border border-green-200' 
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            {product.is_available ? '✓ Disponible' : '✗ No disponible'}
                          </span>
                        </div>
                      </div>

                      {/* Información del producto */}
                      <div className="p-5">
                        <h3 className="font-bold text-lg text-gray-900 mb-2">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{product.description}</p>
                        )}
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {categories.find(c => c.id === product.category_id)?.name || 'Sin categoría'}
                          </span>
                          <span className="text-xl font-bold text-gray-900">
                            ${new Intl.NumberFormat('es-AR').format(product.price)}
                          </span>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setEditProduct({
                                name: product.name,
                                description: product.description || '',
                                price: product.price,
                                image_url: product.image_url || '',
                                category_id: product.category_id || product.categoryId || product.category?.id || ''
                              });
                              setEditImagePreview('');
                              setEditSelectedImage(null);
                              setShowProductModal(true);
                            }}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all text-sm"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pestaña Extras - Diseño Moderno */}
          {activeTab === 'extras' && (
            <div className="p-8 space-y-8">
              {/* Bloque 1: Extras Globales */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Extras Globales</h2>
                    <p className="text-sm text-gray-500">Extras que se pueden asignar a cualquier producto</p>
                  </div>
                  <button
                    onClick={() => {
                      openExtrasManager();
                      loadAllExtras();
                    }}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <span className="text-lg">+</span>
                    <span>Crear Extra</span>
                  </button>
                </div>

                {/* Lista de extras globales - Cards */}
                {allExtras.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
                    <div className="text-5xl mb-4">⚙️</div>
                    <p className="text-sm text-gray-500 mb-4">No hay extras globales creados</p>
                    <button
                      onClick={() => {
                        openExtrasManager();
                        loadAllExtras();
                      }}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-all"
                    >
                      + Crear Primer Extra
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allExtras.map((e) => {
                      const price = Number(e.base_price ?? e.basePrice ?? 0);
                      const active = e.is_active ?? e.isActive ?? true;
                      return (
                        <div key={e.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 hover:shadow-md transition-all">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-bold text-lg text-gray-900 mb-1">{e.name}</h3>
                              <p className="text-xl font-bold text-gray-900 mb-2">
                                ${new Intl.NumberFormat('es-AR').format(price)}
                              </p>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                active 
                                  ? 'bg-green-100 text-green-700 border border-green-200' 
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}>
                                {active ? '✓ Activo' : '✗ Inactivo'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bloque 2: Extras por Producto */}
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Extras por Producto</h2>
                  <p className="text-sm text-gray-500">Selecciona un producto para gestionar sus extras</p>
                </div>

                {products.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
                    <p className="text-sm text-gray-500">Primero crea productos para asignarles extras</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProductForExtras(product);
                          setShowExtrasModal(true);
                          loadProductExtras(product.id);
                        }}
                        className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 hover:shadow-md hover:border-blue-300 transition-all text-left"
                      >
                        <h4 className="font-semibold text-base text-gray-900 mb-1">{product.name}</h4>
                        <p className="text-xs text-gray-500">Gestionar extras</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pestaña Stock & Insumos */}
          {activeTab === 'stock' && (
            <StockManagement />
          )}
        </>
      )}
        </div>
      </div>

      {/* Modal de Instrucciones */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-[#111111]">📚 Instrucciones - Gestión de Menú</h2>
                <button
                  onClick={handleCloseInstructions}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              
              <div className="space-y-4 text-sm text-[#111111]">
                <div>
                  <h3 className="font-bold mb-2">📂 Categorías</h3>
                  <p className="text-[#C7C7C7] mb-2">Organiza tus productos en categorías. Las categorías aparecen en el menú público en el orden que las crees.</p>
                </div>
                
                <div>
                  <h3 className="font-bold mb-2">🍔 Productos</h3>
                  <p className="text-[#C7C7C7] mb-2">Crea productos simples: solo necesitas nombre, precio y categoría. Puedes agregar una imagen y descripción opcional.</p>
                </div>
                
                <div>
                  <h3 className="font-bold mb-2">⚙️ Extras</h3>
                  <p className="text-[#C7C7C7] mb-2">Crea extras globales que puedes asignar a múltiples productos. Primero crea el extra, luego asígnalo a los productos que lo necesiten.</p>
                </div>
                
                <div>
                  <h3 className="font-bold mb-2">📦 Stock & Insumos</h3>
                  <p className="text-[#C7C7C7] mb-2">Gestiona el inventario de insumos y controla el stock mínimo. Útil para recetas y control de costos.</p>
                </div>
                
                <div className="bg-[#FFF9E6] border border-[#FFC300] rounded-sm p-4 mt-4">
                  <p className="text-xs text-[#111111] font-medium">
                    💡 <strong>Tip:</strong> Puedes crear productos rápidamente sin extras. Los extras son opcionales y se agregan después.
                  </p>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleCloseInstructions}
                  className="px-6 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#FFC300]"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Extras */}
      {showExtrasModal && selectedProductForExtras && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header del modal */}
            <div className="sticky top-0 bg-white p-6 border-b shadow-sm z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <i className="ri-restaurant-line text-purple-600 text-xl"></i>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Gestión de Extras
                    </h2>
                    <p className="text-sm text-gray-500">
                      Producto: {selectedProductForExtras.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeExtrasModal}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel izquierdo - Formularios */}
                <div className="space-y-6">
                  {/* Agregar extra existente desde lista global a una categoría del producto */}
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                        <i className="ri-play-list-add-line text-amber-600"></i>
                      </div>
                      <h3 className="font-semibold text-gray-900">Agregar extra existente</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Categoría del producto</label>
                        <select
                          value={selectedTargetCategoryId}
                          onChange={(e) => setSelectedTargetCategoryId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                          <option value="">Seleccionar...</option>
                          {productOptionCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Extra global</label>
                        <select
                          value={selectedExistingExtraId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setSelectedExistingExtraId(id);
                            const extra = allExtras.find(x => x.id === id);
                            const base = Number(extra?.base_price ?? extra?.basePrice ?? 0);
                            setSelectedExistingExtraPrice(base);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                          <option value="">Seleccionar...</option>
                          {allExtras.map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Precio a mostrar</label>
                        <input
                          type="number"
                          step="0.01"
                          value={selectedExistingExtraPrice}
                          onChange={(e) => setSelectedExistingExtraPrice(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="extra-existing-active"
                          type="checkbox"
                          checked={selectedExistingExtraActive}
                          onChange={(e) => setSelectedExistingExtraActive(e.target.checked)}
                        />
                        <label htmlFor="extra-existing-active" className="text-sm text-gray-700">Activo</label>
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={async () => {
                          if (!selectedProductForExtras) {
                            showError && showError('Selecciona un producto');
                            return;
                          }
                          if (!selectedTargetCategoryId) {
                            showError && showError('Selecciona una categoría');
                            return;
                          }
                          if (!selectedExistingExtraId) {
                            showError && showError('Selecciona un extra');
                            return;
                          }
                          try {
                            setSavingOption(true);
                            const extra = allExtras.find(x => x.id === selectedExistingExtraId);
                            const priceValue = parseFloat(selectedExistingExtraPrice.toString()) || 0;
                            const optionData = {
                              optionCategoryId: selectedTargetCategoryId,
                              categoryId: selectedTargetCategoryId,
                              category_id: selectedTargetCategoryId,
                              name: extra?.name || 'Extra',
                              price: priceValue,
                              priceModifier: priceValue, // El backend espera priceModifier
                              price_modifier: priceValue, // También acepta snake_case
                              isAvailable: !!selectedExistingExtraActive,
                              is_available: !!selectedExistingExtraActive,
                              displayOrder: productOptions.filter(opt => {
                                const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
                                return optCatId === selectedTargetCategoryId;
                              }).length,
                              display_order: productOptions.filter(opt => {
                                const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
                                return optCatId === selectedTargetCategoryId;
                              }).length
                            };
                            console.log('💾 [Extras] Agregando extra existente con datos:', optionData);
                            await productOptionsApi.createOption(optionData);
                            console.log('✅ [Extras] Extra agregado correctamente');
                            showSuccess && showSuccess('Extra agregado a la categoría');
                            setSelectedExistingExtraId('');
                            setSelectedTargetCategoryId('');
                            setSelectedExistingExtraPrice(0);
                            setSelectedExistingExtraActive(true);
                            await loadProductExtras(selectedProductForExtras.id);
                          } catch (err: any) {
                            console.error('❌ [Extras] Error al agregar extra:', err);
                            const errorMessage = err?.details?.message || err?.message || 'Error al agregar el extra';
                            showError && showError(errorMessage);
                          } finally {
                            setSavingOption(false);
                          }
                        }}
                        disabled={savingOption}
                        className="px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm border border-[#FFC300] disabled:opacity-50"
                      >
                        {savingOption ? 'Guardando...' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                  {/* Crear/Editar categoría de extras */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <i className="ri-folder-add-line text-blue-600"></i>
                      </div>
                      <h3 className="font-semibold text-gray-900">
                        {editingOptionCategory ? 'Editar Categoría' : 'Nueva Categoría de Extras'}
                      </h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nombre de la categoría
                        </label>
                        <input
                          type="text"
                          placeholder="ej: Tamaños, Ingredientes, Bebidas"
                          value={editingOptionCategory ? editingOptionCategory.name : newOptionCategory.name}
                          onChange={(e) => {
                            if (editingOptionCategory) {
                              setEditingOptionCategory({ ...editingOptionCategory, name: e.target.value });
                            } else {
                              setNewOptionCategory({ ...newOptionCategory, name: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
                          <input
                            type="checkbox"
                            id="is_required"
                            checked={editingOptionCategory ? editingOptionCategory.is_required : newOptionCategory.is_required}
                            onChange={(e) => {
                              if (editingOptionCategory) {
                                setEditingOptionCategory({ ...editingOptionCategory, is_required: e.target.checked });
                              } else {
                                setNewOptionCategory({ ...newOptionCategory, is_required: e.target.checked });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="is_required" className="text-sm font-medium text-gray-700">
                            Obligatorio
                          </label>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Máx. selecciones
                          </label>
                          <input
                            type="number"
                            placeholder="1"
                            min="1"
                            value={editingOptionCategory ? editingOptionCategory.max_selections : newOptionCategory.max_selections}
                            onChange={(e) => {
                              if (editingOptionCategory) {
                                setEditingOptionCategory({ ...editingOptionCategory, max_selections: parseInt(e.target.value) });
                              } else {
                                setNewOptionCategory({ ...newOptionCategory, max_selections: parseInt(e.target.value) });
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        {editingOptionCategory ? (
                          <>
                            <button
                              onClick={updateOptionCategory}
                              disabled={savingCategory}
                              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                              {savingCategory ? (
                                <span className="flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  Guardando...
                                </span>
                              ) : (
                                '💾 Actualizar Categoría'
                              )}
                            </button>
                            <button
                              onClick={() => setEditingOptionCategory(null)}
                              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={saveOptionCategory}
                            disabled={savingCategory}
                            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                          >
                            {savingCategory ? (
                              <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Creando...
                              </span>
                            ) : (
                              '➕ Crear Categoría'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Crear/Editar extra */}
                  {productOptionCategories.length > 0 && (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <i className="ri-add-circle-line text-green-600"></i>
                        </div>
                        <h3 className="font-semibold text-gray-900">
                          {editingOption ? 'Editar Extra' : 'Nuevo Extra'}
                        </h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre del extra
                          </label>
                          <input
                            type="text"
                            placeholder="ej: Grande, Queso extra, Coca Cola"
                            value={editingOption ? editingOption.name : newOption.name}
                            onChange={(e) => {
                              if (editingOption) {
                                setEditingOption({ ...editingOption, name: e.target.value });
                              } else {
                                setNewOption({ ...newOption, name: e.target.value });
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Precio adicional
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                              <input
                                type="number"
                                placeholder="0"
                                min="0"
                                step="0.01"
                                value={editingOption ? (
                                  editingOption.price !== undefined ? editingOption.price : 
                                  (editingOption.price_modifier !== undefined ? editingOption.price_modifier : 
                                  (editingOption.priceModifier !== undefined ? editingOption.priceModifier : ''))
                                ) : (newOption.price || '')}
                                onChange={(e) => {
                                  const priceValue = e.target.value;
                                  if (editingOption) {
                                    setEditingOption({ ...editingOption, price: priceValue });
                                  } else {
                                    setNewOption({ ...newOption, price: priceValue });
                                  }
                                }}
                                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                          
                          {!editingOption && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Categoría
                              </label>
                              <select
                                value={newOption.category_id}
                                onChange={(e) => setNewOption({ ...newOption, category_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              >
                                <option value="">Seleccionar categoría</option>
                                {productOptionCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          {editingOption ? (
                            <>
                              <button
                                onClick={updateOption}
                                disabled={savingOption}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                              >
                                {savingOption ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Guardando...
                                  </span>
                                ) : (
                                  '💾 Actualizar Extra'
                                )}
                              </button>
                              <button
                                onClick={() => setEditingOption(null)}
                                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium transition-colors"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={saveOption}
                              disabled={savingOption}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                              {savingOption ? (
                                <span className="flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  Creando...
                                </span>
                              ) : (
                                '➕ Crear Extra'
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel derecho - Lista de categorías y extras */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <i className="ri-list-check-2 text-purple-600"></i>
                    </div>
                    <h3 className="font-semibold text-gray-900">
                      Categorías y Extras ({productOptionCategories.length})
                    </h3>
                  </div>

                  {productOptionCategories.length > 0 ? (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                      {productOptionCategories.map((category) => (
                        <div key={category.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          {/* Header de la categoría */}
                          <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                                  <i className="ri-folder-line text-gray-600"></i>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900">{category.name}</h4>
                                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                    <span className={`px-2 py-1 rounded-full ${
                                      category.is_required 
                                        ? 'bg-red-100 text-red-700' 
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {category.is_required ? 'Obligatorio' : 'Opcional'}
                                    </span>
                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                      Máx: {category.max_selections}
                                    </span>
                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                      {productOptions.filter(opt => {
                                        const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
                                        return optCatId === category.id;
                                      }).length} extras
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setEditingOptionCategory(category)}
                                  className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar categoría"
                                >
                                  <i className="ri-edit-line"></i>
                                </button>
                                <button
                                  onClick={() => deleteOptionCategory(category.id)}
                                  className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar categoría"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Lista de extras */}
                          <div className="p-4">
                            {productOptions
                              .filter(option => {
                                // Normalizar el campo category_id (puede venir en diferentes formatos)
                                const optCatId = option.category_id || option.categoryId || option.optionCategoryId;
                                return optCatId === category.id;
                              })
                              .map((option, index) => (
                                <div key={option.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-gray-50 ${
                                  index > 0 ? 'border-t border-gray-100' : ''
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                                      <i className="ri-restaurant-line text-green-600 text-sm"></i>
                                    </div>
                                    <div>
                                      <span className="font-medium text-gray-900">{option.name}</span>
                                      <div className="text-sm text-gray-500">
                                        {(() => {
                                          // Normalizar el precio: puede venir como price_modifier, priceModifier, o price
                                          const price = option.price_modifier !== undefined ? option.price_modifier : 
                                                       (option.priceModifier !== undefined ? option.priceModifier : 
                                                       (option.price !== undefined ? option.price : 0));
                                          return price > 0 ? (
                                            <span className="text-green-600 font-medium">+${new Intl.NumberFormat('es-AR').format(price)}</span>
                                          ) : (
                                            <span className="text-blue-600 font-medium">Gratis</span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        // Normalizar el precio antes de editar
                                        const normalizedPrice = option.price_modifier !== undefined ? option.price_modifier : 
                                                                 (option.priceModifier !== undefined ? option.priceModifier : 
                                                                 (option.price !== undefined ? option.price : 0));
                                        setEditingOption({
                                          ...option,
                                          price: normalizedPrice
                                        });
                                      }}
                                      className="w-7 h-7 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Editar extra"
                                    >
                                      <i className="ri-edit-line text-sm"></i>
                                    </button>
                                    <button
                                      onClick={() => deleteOption(option.id)}
                                      className="w-7 h-7 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Eliminar extra"
                                    >
                                      <i className="ri-delete-bin-line text-sm"></i>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            
                            {productOptions.filter(opt => {
                              const optCatId = opt.category_id || opt.categoryId || opt.optionCategoryId;
                              return optCatId === category.id;
                            }).length === 0 && (
                              <div className="text-center py-6 text-gray-500">
                                <i className="ri-inbox-line text-2xl mb-2 block"></i>
                                <p className="text-sm">No hay extras en esta categoría</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-folder-add-line text-2xl text-gray-400"></i>
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-2">No hay categorías de extras</h4>
                      <p className="text-gray-500 text-sm mb-4">
                        Crea una categoría para empezar a agregar extras a este producto.
                      </p>
                      <div className="text-xs text-gray-400">
                        <p>💡 Ejemplos: Tamaños, Ingredientes, Bebidas, Salsas</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear Extra Global y asignar a productos */}
      {extrasManagerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-3xl border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">Crear Extra</h3>
              <button onClick={() => setExtrasManagerOpen(false)} className="text-[#C7C7C7] hover:text-[#111111] text-2xl">×</button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Nombre</label>
                  <input
                    type="text"
                    value={extrasName}
                    onChange={(e) => setExtrasName(e.target.value)}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    placeholder="Ej: Extra queso"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    value={extrasPrice}
                    onChange={(e) => setExtrasPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="extra-active" type="checkbox" checked={extrasActive} onChange={(e) => setExtrasActive(e.target.checked)} />
                <label htmlFor="extra-active" className="text-sm text-[#111111]">Activo</label>
              </div>
              <div className="flex gap-3 pt-4 border-t border-[#C7C7C7]">
                <button
                  onClick={() => setExtrasManagerOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] text-sm font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  onClick={createGlobalExtra}
                  disabled={extrasSaving}
                  className="px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white text-sm font-medium rounded-sm transition-all border border-[#FFC300] disabled:opacity-50"
                >
                  {extrasSaving ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Crear/Editar Receta - Diseño Mejorado */}
      {showRecipeModal && selectedProductForRecipe && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-[100]">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 md:p-8 w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {recipes.find(r => r.product_id === selectedProductForRecipe.id) ? 'Editar' : 'Crear'} Receta
                </h3>
                <p className="text-sm text-gray-500">
                  Producto: <strong>{selectedProductForRecipe.name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRecipeModal(false);
                  setSelectedProductForRecipe(null);
                  setRecipeForm([]);
                }}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {ingredients.length === 0 ? (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-8 text-center">
                <div className="text-5xl mb-4">⚠️</div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  No hay insumos disponibles
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  Primero debes cargar insumos en la sección <strong>"📦 Insumos"</strong> antes de crear recetas.
                </p>
                <button
                  onClick={() => {
                    setShowRecipeModal(false);
                    setActiveTab('stock');
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  Ir a Insumos
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Instrucciones */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Selecciona los insumos</strong> que usa este producto y la <strong>cantidad</strong> de cada uno. 
                    Cada venta descuenta automáticamente del stock.
                  </p>
                </div>

                {/* Buscador de insumos */}
                <div>
                  <input
                    type="text"
                    placeholder="🔍 Buscar insumo..."
                    onChange={(e) => {
                      const searchTerm = e.target.value.toLowerCase();
                      // Filtrar insumos en tiempo real (se puede mejorar con un estado de búsqueda)
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base text-gray-900"
                  />
                </div>

                {/* Lista de insumos disponibles - Diseño mejorado */}
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {ingredients.map((ingredient) => {
                    const existingItem = recipeForm.find(item => item.ingredient_id === ingredient.id);
                    const isLowStock = ingredient.current_stock <= ingredient.min_stock;
                    
                    return (
                      <div 
                        key={ingredient.id} 
                        className={`bg-white border rounded-lg p-4 transition-all ${
                          existingItem 
                            ? 'border-green-300 bg-green-50' 
                            : isLowStock
                            ? 'border-yellow-300 bg-yellow-50'
                            : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-base font-semibold text-gray-900">{ingredient.name}</h4>
                              {isLowStock && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                                  ⚠️ Stock bajo
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span>Stock: <strong>{ingredient.current_stock} {ingredient.unit}</strong></span>
                              <span>Mín: {ingredient.min_stock} {ingredient.unit}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {existingItem ? (
                              <>
                                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={existingItem.quantity}
                                    onChange={(e) => {
                                      const newForm = recipeForm.map(item =>
                                        item.ingredient_id === ingredient.id
                                          ? { ...item, quantity: parseFloat(e.target.value) || 0 }
                                          : item
                                      );
                                      setRecipeForm(newForm);
                                    }}
                                    className="w-20 px-2 py-2 border-0 focus:ring-0 text-sm text-gray-900 font-medium"
                                  />
                                  <span className="text-xs text-gray-500">{ingredient.unit}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setRecipeForm(recipeForm.filter(item => item.ingredient_id !== ingredient.id));
                                  }}
                                  className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg transition-all text-sm"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setRecipeForm([...recipeForm, {
                                    ingredient_id: ingredient.id,
                                    ingredient_name: ingredient.name,
                                    quantity: 0
                                  }]);
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all text-sm"
                              >
                                + Agregar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Resumen de la receta */}
                {recipeForm.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                    <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                      📋 Resumen de la Receta
                    </h4>
                    <div className="space-y-2">
                      {recipeForm
                        .filter(item => item.quantity > 0)
                        .map((item, idx) => {
                          const ingredient = ingredients.find(i => i.id === item.ingredient_id);
                          return (
                            <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                              <span className="font-medium text-gray-900">{item.ingredient_name}</span>
                              <span className="text-sm font-semibold text-blue-600">
                                {item.quantity} {ingredient?.unit || ''}
                              </span>
                            </div>
                          );
                        })}
                      {recipeForm.filter(item => item.quantity > 0).length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-2">
                          Agrega cantidades mayores a 0 para guardar la receta
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Botones de acción */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecipeModal(false);
                      setSelectedProductForRecipe(null);
                      setRecipeForm([]);
                    }}
                    className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      // Validar que haya al menos un insumo con cantidad > 0
                      const validRecipe = recipeForm.filter(item => item.quantity > 0);
                      if (validRecipe.length === 0) {
                        if (showError) showError('Agrega al menos un insumo con cantidad mayor a 0');
                        return;
                      }

                      if (!selectedProductForRecipe) {
                        if (showError) showError('No hay producto seleccionado');
                        return;
                      }

                      try {
                        const recipeData = {
                          product_id: selectedProductForRecipe.id,
                          ingredients: validRecipe
                        };

                        // El backend maneja automáticamente crear o actualizar
                        await recipesApi.create(recipeData);

                        // Recargar recetas
                        await loadRecipes();
                        
                        if (showSuccess) showSuccess('Receta guardada correctamente');
                        setShowRecipeModal(false);
                        setSelectedProductForRecipe(null);
                        setRecipeForm([]);
                      } catch (error: any) {
                        console.error('Error guardando receta:', error);
                        const errorMessage = error?.details?.message || error?.message || 'Error desconocido';
                        if (showError) showError('Error al guardar la receta: ' + errorMessage);
                      }
                    }}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={recipeForm.filter(item => item.quantity > 0).length === 0}
                  >
                    💾 Guardar Receta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Categoría - Premium Style */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-md border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {editingCategory ? 'Editar Categoría' : 'Crear Nueva Categoría'}
              </h3>
              <button
                onClick={closeCategoryModal}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingCategory) {
                  updateCategory();
                } else {
                  saveCategory();
                }
              }}
              className="space-y-6"
            >
              {/* Información básica */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                    Nombre de la Categoría
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Milanesas, Combos, Bebidas..."
                    value={editingCategory ? editCategoryName : newCategoryName}
                    onChange={(e) => {
                      if (editingCategory) {
                        setEditCategoryName(e.target.value);
                      } else {
                        setNewCategoryName(e.target.value);
                      }
                    }}
                    className="w-full px-4 py-3 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-[#C7C7C7] mt-1">
                    El nombre aparecerá en el menú del cliente
                  </p>
                </div>
              </div>

              {/* Información adicional (si está editando) */}
              {editingCategory && (
                <div className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#C7C7C7]">Productos en esta categoría:</span>
                    <span className="font-bold text-[#111111]">
                      {products.filter(p => p.category_id === editingCategory.id).length}
                    </span>
                  </div>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#FFC300] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingCategory
                    ? 'Guardando...'
                    : editingCategory
                    ? '💾 Actualizar Categoría'
                    : '➕ Crear Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Producto - Responsive y Mejorado */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 md:p-8 w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
              </h3>
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setEditingProduct(null);
                  setNewProduct({
                    name: '',
                    description: '',
                    price: 0,
                    image_url: '',
                    category_id: ''
                  });
                  setEditProduct({
                    name: '',
                    description: '',
                    price: 0,
                    image_url: '',
                    category_id: ''
                  });
                  setImagePreview('');
                  setEditImagePreview('');
                  setSelectedImage(null);
                  setEditSelectedImage(null);
                }}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (editingProduct) {
                updateProduct();
                setShowProductModal(false);
              } else {
                saveProduct();
                setShowProductModal(false);
              }
            }} className="space-y-6">
              {/* Información básica */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#111111] uppercase tracking-wider border-b border-[#C7C7C7] pb-2">
                  Información Básica
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                      Nombre del Producto
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Milanesa Napolitana"
                      value={editingProduct ? editProduct.name : newProduct.name}
                      onChange={(e) => {
                        if (editingProduct) {
                          setEditProduct({ ...editProduct, name: e.target.value });
                        } else {
                          setNewProduct({ ...newProduct, name: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                      Precio de Venta ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej: 3500"
                      value={editingProduct ? editProduct.price : newProduct.price}
                      onChange={(e) => {
                        const price = parseFloat(e.target.value) || 0;
                        if (editingProduct) {
                          setEditProduct({ ...editProduct, price });
                        } else {
                          setNewProduct({ ...newProduct, price });
                        }
                      }}
                      className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                      Categoría
                    </label>
                    <select
                      value={editingProduct ? editProduct.category_id : newProduct.category_id}
                      onChange={(e) => {
                        if (editingProduct) {
                          setEditProduct({ ...editProduct, category_id: e.target.value });
                        } else {
                          setNewProduct({ ...newProduct, category_id: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                      required
                    >
                      <option value="">Seleccionar categoría...</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                      Descripción (Opcional)
                    </label>
                    <textarea
                      placeholder="Describe el producto para los clientes..."
                      value={editingProduct ? editProduct.description : newProduct.description}
                      onChange={(e) => {
                        if (editingProduct) {
                          setEditProduct({ ...editProduct, description: e.target.value });
                        } else {
                          setNewProduct({ ...newProduct, description: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Imagen del producto */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#111111] uppercase tracking-wider border-b border-[#C7C7C7] pb-2">
                  Imagen del Producto
                </h4>
                
                {/* Opción 1: URL de imagen */}
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                    URL de Imagen (Opcional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://ejemplo.com/imagen.jpg"
                    value={editingProduct ? editProduct.image_url : newProduct.image_url}
                    onChange={(e) => {
                      const url = e.target.value;
                      if (editingProduct) {
                        setEditProduct({ ...editProduct, image_url: url });
                        setEditImagePreview(url);
                        setEditSelectedImage(null);
                      } else {
                        setNewProduct({ ...newProduct, image_url: url });
                        setImagePreview(url);
                        setSelectedImage(null);
                      }
                    }}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                  <p className="text-xs text-[#C7C7C7] mt-1">O sube una imagen desde tu dispositivo abajo</p>
                </div>

                {/* Opción 2: Subir archivo */}
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">
                    O Subir Imagen desde Dispositivo
                  </label>
                  {(editImagePreview || editProduct.image_url || imagePreview || newProduct.image_url) ? (
                    <div className="flex items-start gap-4">
                      <img
                        src={editImagePreview || editProduct.image_url || imagePreview || newProduct.image_url}
                        alt="Vista previa"
                        className="w-32 h-32 object-cover rounded-sm border border-[#C7C7C7]"
                        onError={(e) => {
                          // Si la imagen falla al cargar, ocultar el error
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="flex flex-col gap-2 flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={editingProduct ? handleEditImageSelect : handleImageSelect}
                          className="hidden"
                          id={editingProduct ? "image-upload-edit-modal" : "image-upload-modal"}
                        />
                        <label
                          htmlFor={editingProduct ? "image-upload-edit-modal" : "image-upload-modal"}
                          className="px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white text-sm font-medium rounded-sm cursor-pointer transition-all border border-[#111111] text-center"
                        >
                          📷 Cambiar Imagen
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingProduct) {
                              setEditProduct({ ...editProduct, image_url: '' });
                              setEditImagePreview('');
                              setEditSelectedImage(null);
                            } else {
                              clearImage();
                            }
                          }}
                          className="px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] text-sm font-medium rounded-sm transition-all border border-[#C7C7C7]"
                        >
                          🗑️ Eliminar Imagen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-[#C7C7C7] rounded-sm p-8 text-center hover:border-[#FFC300] transition-all">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={editingProduct ? handleEditImageSelect : handleImageSelect}
                        className="hidden"
                        id={editingProduct ? "image-upload-edit-modal" : "image-upload-modal"}
                      />
                      <label
                        htmlFor={editingProduct ? "image-upload-edit-modal" : "image-upload-modal"}
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <div className="w-16 h-16 bg-[#F9F9F9] rounded-sm flex items-center justify-center mb-3 border border-[#C7C7C7]">
                          <span className="text-3xl text-[#C7C7C7]">📷</span>
                        </div>
                        <span className="text-sm text-[#111111] font-medium mb-1">Click para seleccionar imagen</span>
                        <span className="text-xs text-[#C7C7C7]">JPG, PNG o WebP (máx. 5MB)</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Secciones adicionales solo al editar */}
              {editingProduct && (
                <>
                  {/* Insumos/Receta - Mejorado */}
                  <div className="space-y-4 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-gray-900 mb-1">
                          🍽️ Insumos (Receta)
                        </h4>
                        <p className="text-xs text-gray-500">
                          Define qué insumos usa este producto y cuánto consume
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          // Asegurar que las recetas estén cargadas
                          await loadRecipes();
                          setSelectedProductForRecipe(editingProduct);
                          // Buscar la receta después de cargar
                          const productRecipe = recipes.find(r => r.product_id === editingProduct.id);
                          if (productRecipe && productRecipe.ingredients) {
                            setRecipeForm(productRecipe.ingredients || []);
                          } else {
                            setRecipeForm([]);
                          }
                          setShowRecipeModal(true);
                        }}
                        className="px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
                      >
                        {recipes.find(r => r.product_id === editingProduct.id) ? (
                          <>
                            <span>✏️</span>
                            <span>Editar Receta</span>
                          </>
                        ) : (
                          <>
                            <span>➕</span>
                            <span>Agregar Receta</span>
                          </>
                        )}
                      </button>
                    </div>
                    {(() => {
                      const productRecipe = recipes.find(r => r.product_id === editingProduct.id);
                      const validIngredients = productRecipe?.ingredients?.filter((ing: any) => ing.quantity > 0) || [];
                      
                      return productRecipe && validIngredients.length > 0 ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-green-800">
                              ✅ Receta configurada
                            </p>
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                              {validIngredients.length} insumo{validIngredients.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {validIngredients.slice(0, 3).map((ing: any, idx: number) => {
                              const ingredient = ingredients.find(i => i.id === ing.ingredient_id);
                              return (
                                <div key={idx} className="text-xs text-green-700">
                                  • {ing.ingredient_name}: <strong>{ing.quantity} {ingredient?.unit || ''}</strong>
                                </div>
                              );
                            })}
                            {validIngredients.length > 3 && (
                              <div className="text-xs text-green-600">
                                +{validIngredients.length - 3} más...
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <p className="text-sm text-yellow-800">
                            ⚠️ No hay receta configurada. Haz clic en "Agregar Receta" para definir los insumos que usa este producto.
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Extras asignados */}
                  <div className="space-y-4 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                        ➕ Extras Asignados
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductForExtras(editingProduct);
                          setShowExtrasModal(true);
                          loadProductExtras(editingProduct.id);
                        }}
                        className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all"
                      >
                        ⚙️ Gestionar Extras
                      </button>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800">
                        💡 Haz clic en "Gestionar Extras" para ver y configurar los extras de este producto.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Botones de acción */}
              <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowProductModal(false);
                    setEditingProduct(null);
                    setNewProduct({
                      name: '',
                      description: '',
                      price: 0,
                      image_url: '',
                      category_id: ''
                    });
                    setEditProduct({
                      name: '',
                      description: '',
                      price: 0,
                      image_url: '',
                      category_id: ''
                    });
                    setImagePreview('');
                    setEditImagePreview('');
                    setSelectedImage(null);
                    setEditSelectedImage(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingProduct ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Guardando...
                    </span>
                  ) : editingProduct ? (
                    '💾 Actualizar Producto'
                  ) : (
                    '➕ Crear Producto'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
