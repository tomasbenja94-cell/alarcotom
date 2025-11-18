
import { useState, useEffect } from 'react';
import { categoriesApi, productsApi, productOptionsApi, extrasApi } from '../../../lib/api';
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

export default function MenuManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'categories' | 'recipes' | 'products' | 'extras' | 'stock'>('categories');
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
    loadData();
    loadIngredients();
    loadRecipes();
  }, []);

  const loadIngredients = async () => {
    try {
      // Intentar cargar insumos desde la API del backend (si existe)
      const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/ingredients` : `${API_URL}/api/ingredients`;
      const response = await fetch(endpoint);
      
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
      
      const data = await response.json();
      setIngredients(data || []);
    } catch (error: any) {
      // Silenciar errores - la tabla puede no existir
      setIngredients([]);
    }
  };

  const loadRecipes = async () => {
    try {
      // Intentar cargar recetas desde la API del backend
      const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';
      const endpoint = API_URL.endsWith('/api') ? `${API_URL}/recipes` : `${API_URL}/api/recipes`;
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        // Si el endpoint no existe (404), usar datos vacíos sin mostrar error
        if (response.status === 404) {
          setRecipes([]);
          return;
        }
        // Solo loggear otros errores
        const errorData = await response.json().catch(() => ({}));
        console.error('Error loading recipes:', errorData);
        setRecipes([]);
        return;
      }
      
      const data = await response.json();
      setRecipes(data || []);
    } catch (error: any) {
      // Silenciar errores - la tabla puede no existir
      setRecipes([]);
    }
  };

  // Cargar datos usando backend API (seguro)
  const loadData = async () => {
    setLoading(true);
    try {
      const categoriesData = await categoriesApi.getAll();
      const productsData = await productsApi.getAll();
      setCategories(categoriesData || []);
      setProducts(productsData || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      if (showError) {
        showError('Error al cargar datos del menú');
      }
    } finally {
      setLoading(false);
    }
  };

  // Cargar extras de un producto específico usando backend API
  const loadProductExtras = async (productId: string) => {
    try {
      const categoriesData = await productOptionsApi.getCategories(productId);
      setProductOptionCategories(categoriesData || []);
      let allOptions: any[] = [];
      for (const cat of categoriesData || []) {
        const opts = await productOptionsApi.getOptions(cat.id);
        allOptions = allOptions.concat(opts || []);
      }
      setProductOptions(allOptions);
    } catch (error) {
      console.error('Error al cargar extras:', error);
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

  // Función para convertir imagen a base64
  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Manejar selección de imagen para nuevo producto
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setSelectedImage(file);
        const base64 = await convertImageToBase64(file);
        setImagePreview(base64);
        setNewProduct({ ...newProduct, image_url: base64 });
      } catch (error) {
        if (showError) showError('Error al procesar la imagen');
      }
    }
  };

  // Manejar selección de imagen para editar producto
  const handleEditImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setEditSelectedImage(file);
        const base64 = await convertImageToBase64(file);
        setEditImagePreview(base64);
        setEditProduct({ ...editProduct, image_url: base64 });
      } catch (error) {
        if (showError) showError('Error al procesar la imagen');
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
        is_active: true
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
        is_available: true
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

  const startEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditProduct({
      name: product.name,
      description: product.description || '',
      price: product.price,
      image_url: product.image_url || '',
      category_id: product.category_id
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
        description: editProduct.description.trim(),
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

    setSavingOption(true);
    try {
      const optionData = {
        ...newOption,
        price: Number(newOption.price),
        display_order: productOptions.filter(opt => opt.category_id === newOption.category_id).length,
        order_index: productOptions.filter(opt => opt.category_id === newOption.category_id).length // Para compatibilidad
      };

      await productOptionsApi.createOption(optionData);

      if (showSuccess) showSuccess('Extra creado correctamente');
      setNewOption({ name: '', price: 0, category_id: '' });
      loadProductExtras(selectedProductForExtras!.id);
    } catch (error: any) {
      console.error('Error al crear extra:', error);
      const errorMessage = error?.details || error?.message || 'Error al crear el extra';
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
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">MENÚ</h2>
            <p className="text-sm text-[#C7C7C7]">Flujo: 1️⃣ Categorías → 2️⃣ Recetas → 3️⃣ Productos → 4️⃣ Extras</p>
          </div>
        </div>
      </div>

      {/* Pestañas - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="flex border-b border-[#C7C7C7]">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === 'categories'
                ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
            }`}
          >
            📂 Categorías
          </button>
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === 'recipes'
                ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
            }`}
          >
            🍽️ Recetas
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === 'products'
                ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
            }`}
          >
            🍔 Productos
          </button>
          <button
            onClick={() => setActiveTab('extras')}
            className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === 'extras'
                ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
            }`}
          >
            ⚙️ Extras
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === 'stock'
                ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
            }`}
          >
            📦 Stock & Insumos
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
              {/* Pestaña Categorías */}
              {activeTab === 'categories' && (
                <div className="space-y-6">
                  {/* Header con botón agregar */}
                  <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[#111111] mb-1">CATEGORÍAS ({categories.length})</h3>
                        <p className="text-xs text-[#C7C7C7]">Organiza tus productos por categorías</p>
                      </div>
                      <button
                        onClick={() => openCategoryModal()}
                        className="px-4 py-2 text-sm font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
                      >
                        + Agregar Categoría
                      </button>
                    </div>
                  </div>

                  {/* Lista de categorías - Premium Style */}
                  {categories.length === 0 ? (
                    <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-12 text-center">
                      <div className="text-5xl mb-4">📂</div>
                      <p className="text-sm text-[#C7C7C7] font-medium mb-4">No hay categorías registradas. Agrega la primera.</p>
                      <button
                        onClick={() => openCategoryModal()}
                        className="px-4 py-2 text-sm font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
                      >
                        + Crear Primera Categoría
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {categories.map((category) => {
                        const productsCount = products.filter(p => p.category_id === category.id).length;
                        return (
                          <div key={category.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-bold text-base text-[#111111] mb-1">{category.name}</h4>
                                <p className="text-xs text-[#C7C7C7]">
                                  {productsCount} producto{productsCount !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-3 border-t border-[#C7C7C7]">
                              <button
                                onClick={() => openCategoryModal(category)}
                                className="flex-1 px-3 py-2 text-xs font-medium bg-white hover:bg-[#F9F9F9] text-[#111111] rounded-sm transition-all border border-[#C7C7C7]"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => deleteCategory(category.id)}
                                className="flex-1 px-3 py-2 text-xs font-medium bg-white hover:bg-[#F9F9F9] text-[#111111] rounded-sm transition-all border border-[#C7C7C7]"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

          {/* Pestaña Recetas */}
          {activeTab === 'recipes' && (
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

          {/* Pestaña Productos */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Botón para crear nuevo producto */}
              <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#111111]">PRODUCTOS DEL MENÚ ({products.length})</h3>
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
                    className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                  >
                    + Agregar Producto
                  </button>
                </div>
              </div>

              {/* Lista de productos - Premium Style */}
              {products.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-12 text-center">
                  <div className="text-5xl mb-4">🍔</div>
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay productos creados. Agrega el primero.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((product) => (
                    <div key={product.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm overflow-hidden hover:border-[#FFC300] transition-all">
                      {/* Imagen del producto */}
                      <div className="relative h-48 bg-[#F9F9F9]">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl text-[#C7C7C7]">📷</span>
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 rounded-sm text-xs font-medium border ${
                            product.is_available 
                              ? 'bg-[#111111] text-white border-[#FFC300]' 
                              : 'bg-white text-[#C7C7C7] border-[#C7C7C7]'
                          }`}>
                            {product.is_available ? '✅ Disponible' : '❌ No disponible'}
                          </span>
                        </div>
                      </div>

                      {/* Información del producto */}
                      <div className="p-4">
                        <h3 className="font-bold text-base text-[#111111] mb-1">{product.name}</h3>
                        {product.description && (
                          <p className="text-xs text-[#C7C7C7] mb-3 line-clamp-2">{product.description}</p>
                        )}
                        <div className="flex items-center justify-between mb-3 pt-3 border-t border-[#C7C7C7]">
                          <span className="text-xs text-[#C7C7C7] uppercase tracking-wider">
                            {categories.find(c => c.id === product.category_id)?.name || 'Sin categoría'}
                          </span>
                          <span className="text-xl font-bold text-[#111111]">
                            ${new Intl.NumberFormat('es-AR').format(product.price)}
                          </span>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex gap-2 pt-3 border-t border-[#C7C7C7]">
                          <button
                            onClick={() => {
                              setSelectedProductForExtras(product);
                              setShowExtrasModal(true);
                              loadProductExtras(product.id);
                            }}
                            className="flex-1 px-3 py-2 text-xs font-medium bg-white hover:bg-[#F9F9F9] text-[#111111] rounded-sm transition-all border border-[#C7C7C7]"
                          >
                            ⚙️ Extras
                          </button>
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setEditProduct({
                                name: product.name,
                                description: product.description || '',
                                price: product.price,
                                image_url: product.image_url || '',
                                category_id: product.category_id || ''
                              });
                              setEditImagePreview('');
                              setEditSelectedImage(null);
                              setShowProductModal(true);
                            }}
                            className="flex-1 px-3 py-2 text-xs font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="px-3 py-2 text-xs font-medium bg-white hover:bg-[#F9F9F9] text-[#111111] rounded-sm transition-all border border-[#C7C7C7]"
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

          {/* Pestaña Extras */}
          {activeTab === 'extras' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#C7C7C7] rounded-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#111111]">GESTIÓN DE EXTRAS</h3>
                    <p className="text-xs text-[#C7C7C7]">Crea un extra y asígnalo a múltiples productos</p>
                  </div>
                  <button
                    onClick={() => {
                      openExtrasManager();
                    }}
                    className="px-4 py-2 text-sm font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#FFC300]"
                  >
                    + Crear Extra
                  </button>
                </div>
                <div className="mb-4">
                  <button
                    onClick={loadAllExtras}
                    className="px-3 py-2 text-xs border border-[#C7C7C7] rounded-sm hover:bg-[#F9F9F9]"
                  >
                    Refrescar lista
                  </button>
                </div>
                {/* Lista de extras globales */}
                {allExtras.length === 0 ? (
                  <div className="text-sm text-[#C7C7C7]">No hay extras aún. Crea el primero.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#C7C7C7]">
                          <th className="py-2 pr-4">Extra</th>
                          <th className="py-2 pr-4">Precio base</th>
                          <th className="py-2 pr-4">Estado</th>
                          <th className="py-2 pr-4">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allExtras.map((e) => {
                          const price = Number(e.base_price ?? e.basePrice ?? 0);
                          const active = e.is_active ?? e.isActive ?? true;
                          return (
                            <tr key={e.id} className="border-b border-[#F0F0F0]">
                              <td className="py-2 pr-4">{e.name}</td>
                              <td className="py-2 pr-4">${new Intl.NumberFormat('es-AR').format(price)}</td>
                              <td className="py-2 pr-4">{active ? 'Activo' : 'Inactivo'}</td>
                              <td className="py-2 pr-4">
                                <span className="text-xs text-[#C7C7C7]">Editar/Asignar desde cada producto</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Acceso por producto (gestión por categoría del producto) */}
              <div className="bg-white border border-[#C7C7C7] rounded-sm p-6">
                <p className="text-xs text-[#C7C7C7] mb-4">O gestiona extras de un producto específico:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        setSelectedProductForExtras(product);
                        setShowExtrasModal(true);
                        loadProductExtras(product.id);
                      }}
                      className="p-4 border border-[#C7C7C7] rounded-sm hover:border-[#FFC300] transition-all text-left"
                    >
                      <h4 className="text-sm font-medium text-[#111111]">{product.name}</h4>
                      <p className="text-xs text-[#C7C7C7] mt-1">Gestionar extras</p>
                    </button>
                  ))}
                </div>
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
                            await productOptionsApi.createOption({
                              optionCategoryId: selectedTargetCategoryId,
                              name: extra?.name || 'Extra',
                              priceModifier: Number(selectedExistingExtraPrice) || 0,
                              isAvailable: !!selectedExistingExtraActive,
                              displayOrder: 0
                            });
                            showSuccess && showSuccess('Extra agregado a la categoría');
                            setSelectedExistingExtraId('');
                            setSelectedTargetCategoryId('');
                            setSelectedExistingExtraPrice(0);
                            setSelectedExistingExtraActive(true);
                            await loadProductExtras(selectedProductForExtras.id);
                          } catch (err: any) {
                            console.error(err);
                            showError && showError(err?.message || 'Error al agregar el extra');
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
                                value={editingOption ? editingOption.price : newOption.price}
                                onChange={(e) => {
                                  if (editingOption) {
                                    setEditingOption({ ...editingOption, price: e.target.value });
                                  } else {
                                    setNewOption({ ...newOption, price: e.target.value });
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
                                      {productOptions.filter(opt => opt.category_id === category.id).length} extras
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
                              .filter(option => option.category_id === category.id)
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
                                        {option.price > 0 ? (
                                          <span className="text-green-600 font-medium">+${option.price}</span>
                                        ) : (
                                          <span className="text-blue-600 font-medium">Gratis</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setEditingOption(option)}
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
                            
                            {productOptions.filter(opt => opt.category_id === category.id).length === 0 && (
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
      {/* Modal: Crear/Editar Receta */}
      {showRecipeModal && selectedProductForRecipe && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {recipes.find(r => r.product_id === selectedProductForRecipe.id) ? 'Editar' : 'Crear'} Receta - {selectedProductForRecipe.name}
              </h3>
              <button
                onClick={() => {
                  setShowRecipeModal(false);
                  setSelectedProductForRecipe(null);
                  setRecipeForm([]);
                }}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            {ingredients.length === 0 ? (
              <div className="bg-white border-2 border-[#FFC300] rounded-sm p-6 text-center">
                <p className="text-sm text-[#111111] mb-2">
                  ⚠️ <strong>Primero debes cargar insumos</strong>
                </p>
                <p className="text-xs text-[#C7C7C7]">
                  Ve a "Stock & Insumos" y carga los productos crudos antes de crear recetas.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[#C7C7C7] mb-3">
                    Selecciona los insumos que usa este plato y cuánto consume de cada uno. Cada venta descuenta automáticamente del stock.
                  </p>
                </div>

                {/* Lista de insumos disponibles */}
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {ingredients.map((ingredient) => {
                    const existingItem = recipeForm.find(item => item.ingredient_id === ingredient.id);
                    return (
                      <div key={ingredient.id} className="bg-white border border-[#C7C7C7] rounded-sm p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-[#111111]">{ingredient.name}</h4>
                            <p className="text-xs text-[#C7C7C7]">Stock: {ingredient.current_stock} {ingredient.unit}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {existingItem ? (
                              <>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={existingItem.quantity}
                                  onChange={(e) => {
                                    const newForm = recipeForm.map(item =>
                                      item.ingredient_id === ingredient.id
                                        ? { ...item, quantity: parseFloat(e.target.value) || 0 }
                                        : item
                                    );
                                    setRecipeForm(newForm);
                                  }}
                                  className="w-24 px-3 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                                  min="0"
                                />
                                <span className="text-xs text-[#C7C7C7]">{ingredient.unit}</span>
                                <button
                                  onClick={() => {
                                    setRecipeForm(recipeForm.filter(item => item.ingredient_id !== ingredient.id));
                                  }}
                                  className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                                >
                                  Quitar
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
                                className="px-4 py-2 text-xs font-medium bg-[#111111] hover:bg-[#1A1A1A] text-white rounded-sm transition-all border border-[#111111]"
                              >
                                Agregar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {recipeForm.length > 0 && (
                  <div className="pt-4 border-t border-[#C7C7C7]">
                    <h4 className="text-sm font-bold text-[#111111] mb-3">Resumen de la Receta:</h4>
                    <div className="space-y-2">
                      {recipeForm.map((item, idx) => {
                        const ingredient = ingredients.find(i => i.id === item.ingredient_id);
                        return (
                          <div key={idx} className="flex justify-between text-sm p-2 bg-[#F9F9F9] rounded-sm">
                            <span className="text-[#111111]">{item.ingredient_name}</span>
                            <span className="font-medium text-[#111111]">{item.quantity} {ingredient?.unit || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecipeModal(false);
                      setSelectedProductForRecipe(null);
                      setRecipeForm([]);
                    }}
                    className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
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
                        const existingRecipe = recipes.find(r => r.product_id === selectedProductForRecipe.id);
                        
                        const recipeData = {
                          product_id: selectedProductForRecipe.id,
                          ingredients: validRecipe
                        };

                        let result;
                        if (existingRecipe) {
                          // Actualizar receta existente
                          const { data, error } = await supabase
                            .from('recipes')
                            .update({
                              ...recipeData,
                              updated_at: new Date().toISOString()
                            })
                            .eq('id', existingRecipe.id)
                            .select()
                            .single();

                          if (error) {
                            // Si la tabla no existe, mostrar instrucciones
                            if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                              alert(`⚠️ La tabla de recetas no existe. Necesitas crearla primero en Supabase.\n\nSQL:\nCREATE TABLE IF NOT EXISTS recipes (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    product_id UUID REFERENCES products(id) ON DELETE CASCADE,\n    ingredients JSONB NOT NULL,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()\n);`);
                              return;
                            }
                            throw error;
                          }

                          result = data;
                        } else {
                          // Crear nueva receta
                          const { data, error } = await supabase
                            .from('recipes')
                            .insert([recipeData])
                            .select()
                            .single();

                          if (error) {
                            // Si la tabla no existe, mostrar instrucciones
                            if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message?.includes('does not exist')) {
                              alert(`⚠️ La tabla de recetas no existe. Necesitas crearla primero en Supabase.\n\nSQL:\nCREATE TABLE IF NOT EXISTS recipes (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    product_id UUID REFERENCES products(id) ON DELETE CASCADE,\n    ingredients JSONB NOT NULL,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()\n);`);
                              return;
                            }
                            throw error;
                          }

                          result = data;
                        }

                        // Recargar recetas desde Supabase para asegurar consistencia
                        await loadRecipes();
                        
                        if (showSuccess) showSuccess('Receta guardada correctamente');
                        setShowRecipeModal(false);
                        setSelectedProductForRecipe(null);
                        setRecipeForm([]);
                      } catch (error: any) {
                        console.error('Error guardando receta:', error);
                        if (showError) showError('Error al guardar la receta: ' + (error.message || 'Error desconocido'));
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
                  >
                    Guardar Receta
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

      {/* Modal: Crear/Editar Producto - Premium Style */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-[#FFC300]">
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
                
                {(editImagePreview || editProduct.image_url || imagePreview || newProduct.image_url) ? (
                  <div className="flex items-start gap-4">
                    <img
                      src={editImagePreview || editProduct.image_url || imagePreview || newProduct.image_url}
                      alt="Vista previa"
                      className="w-32 h-32 object-cover rounded-sm border border-[#C7C7C7]"
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

              {/* Botones de acción */}
              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
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
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#FFC300] disabled:opacity-50"
                >
                  {savingProduct ? 'Guardando...' : editingProduct ? '💾 Actualizar Producto' : '➕ Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
