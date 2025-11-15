
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ProductOptionsManager from './components/ProductOptionsManager';

interface Category {
  id: string;
  name: string;
  display_order: number;
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
  display_order: number;
}

export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [showOptionsManager, setShowOptionsManager] = useState(false);
  const [selectedProductForOptions, setSelectedProductForOptions] = useState<Product | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    display_order: 0
  });

  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    category_id: '',
    display_order: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Cargar categorías
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('*')
        .order('display_order');

      // Cargar productos
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('display_order');

      if (categoriesData) {
        setCategories(categoriesData);
        if (categoriesData.length > 0 && !selectedCategory) {
          setSelectedCategory(categoriesData[0].id);
        }
      }
      if (productsData) setProducts(productsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Crear vista previa
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        setProductForm({ ...productForm, image_url: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview('');
    setProductForm({ ...productForm, image_url: '' });
  };

  const saveCategory = async () => {
    try {
      if (editingCategory) {
        // Actualizar categoría
        const { error } = await supabase
          .from('categories')
          .update({
            name: categoryForm.name,
            display_order: categoryForm.display_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        // Crear nueva categoría
        const { error } = await supabase
          .from('categories')
          .insert({
            name: categoryForm.name,
            display_order: categoryForm.display_order,
            is_active: true
          });

        if (error) throw error;
      }

      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', display_order: 0 });
      loadData();
    } catch (error) {
      console.error('Error saving category:', error);
    }
  };

  const saveProduct = async () => {
    try {
      if (editingProduct) {
        // Actualizar producto
        const { error } = await supabase
          .from('products')
          .update({
            name: productForm.name,
            description: productForm.description,
            price: productForm.price,
            image_url: productForm.image_url,
            category_id: productForm.category_id,
            display_order: productForm.display_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        // Crear nuevo producto
        const { error } = await supabase
          .from('products')
          .insert({
            name: productForm.name,
            description: productForm.description,
            price: productForm.price,
            image_url: productForm.image_url,
            category_id: productForm.category_id,
            is_available: true,
            display_order: productForm.display_order
          });

        if (error) throw error;
      }

      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm({
        name: '',
        description: '',
        price: 0,
        image_url: '',
        category_id: '',
        display_order: 0
      });
      setSelectedImage(null);
      setImagePreview('');
      loadData();
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta categoría? Se eliminarán todos sus productos.')) {
      return;
    }

    try {
      // Primero eliminar productos de la categoría
      await supabase
        .from('products')
        .delete()
        .eq('category_id', categoryId);

      // Luego eliminar la categoría
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const toggleProductAvailability = async (productId: string, isAvailable: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_available: !isAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error updating product availability:', error);
    }
  };

  const openCategoryModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        display_order: category.display_order
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        display_order: categories.length
      });
    }
    setShowCategoryModal(true);
  };

  const openProductModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        description: product.description,
        price: product.price,
        image_url: product.image_url,
        category_id: product.category_id,
        display_order: product.display_order
      });
      setImagePreview(product.image_url);
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        description: '',
        price: 0,
        image_url: '',
        category_id: selectedCategory,
        display_order: products.filter(p => p.category_id === selectedCategory).length
      });
      setSelectedImage(null);
      setImagePreview('');
    }
    setShowProductModal(true);
  };

  const openOptionsManager = (product: Product) => {
    setSelectedProductForOptions(product);
    setShowOptionsManager(true);
  };

  const filteredProducts = products.filter(product => product.category_id === selectedCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando gestión del menú...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center">
              <img 
                src="https://static.readdy.ai/image/579dc380da62aab76f072e02550f7c3a/332b1be8324fefebf657042245060b3e.png" 
                alt="El Buen Menú" 
                className="w-10 h-10 rounded-full mr-3"
              />
              <h1 className="text-xl font-semibold text-gray-900">
                El Buen Menú
              </h1>
              <span className="ml-3 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                Gestión del Menú
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => openCategoryModal()}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-xs font-medium"
              >
                <i className="ri-add-line mr-1"></i>
                Nueva Categoría
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Categorías */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">Categorías</h3>
              </div>
              <div className="p-3">
                <div className="space-y-1">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs ${
                        selectedCategory === category.id
                          ? 'bg-orange-100 border border-orange-300'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{category.name}</p>
                        <p className="text-xs text-gray-500">
                          {products.filter(p => p.category_id === category.id).length} productos
                        </p>
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCategoryModal(category);
                          }}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <i className="ri-edit-line text-xs"></i>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCategory(category.id);
                          }}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content - Productos */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium text-gray-900">
                    Productos - {categories.find(c => c.id === selectedCategory)?.name}
                  </h3>
                  <button
                    onClick={() => openProductModal()}
                    disabled={!selectedCategory}
                    className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-lg text-xs font-medium"
                  >
                    <i className="ri-add-line mr-1"></i>
                    Nuevo Producto
                  </button>
                </div>
              </div>

              <div className="p-4">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="ri-restaurant-line text-3xl text-gray-400 mb-3"></i>
                    <p className="text-gray-500 text-sm">No hay productos en esta categoría</p>
                    <button
                      onClick={() => openProductModal()}
                      className="mt-3 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-xs font-medium"
                    >
                      Agregar primer producto
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <div className="aspect-square">
                          <img
                            src={product.image_url || 'https://readdy.ai/api/search-image?query=delicious%20food%20plate%20restaurant%20menu%20item&width=200&height=200&seq=product-placeholder&orientation=squarish'}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-medium text-gray-900 text-xs leading-tight">{product.name}</h4>
                            <div className="flex items-center ml-1">
                              <button
                                onClick={() => toggleProductAvailability(product.id, product.is_available)}
                                className={`w-6 h-3 rounded-full relative transition-colors ${
                                  product.is_available ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              >
                                <div className={`w-2 h-2 bg-white rounded-full absolute top-0.5 transition-transform ${
                                  product.is_available ? 'translate-x-3' : 'translate-x-0.5'
                                }`}></div>
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{product.description}</p>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-orange-600">
                              ${product.price.toLocaleString()}
                            </span>
                            <div className="flex space-x-1">
                              <button
                                onClick={() => openOptionsManager(product)}
                                className="bg-blue-100 hover:bg-blue-200 text-blue-600 hover:text-blue-700 p-1.5 rounded-md transition-colors"
                                title="Configurar opciones y extras"
                              >
                                <i className="ri-settings-3-line text-sm"></i>
                              </button>
                              <button
                                onClick={() => openProductModal(product)}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-700 p-1.5 rounded-md transition-colors"
                                title="Editar producto"
                              >
                                <i className="ri-edit-line text-sm"></i>
                              </button>
                              <button
                                onClick={() => deleteProduct(product.id)}
                                className="bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 p-1.5 rounded-md transition-colors"
                                title="Eliminar producto"
                              >
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            </div>
                          </div>
                          {!product.is_available && (
                            <div className="mt-1">
                              <span className="inline-flex px-1 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                No disponible
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Categoría */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de la categoría
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Ej: Combos, Bebidas, Postres"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Orden de visualización
                </label>
                <input
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={saveCategory}
                disabled={!categoryForm.name}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium"
              >
                {editingCategory ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Producto */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del producto
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Ej: Milanesa con papas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Descripción del producto..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio
                </label>
                <input
                  type="number"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                  placeholder="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imagen del producto
                </label>
                <div className="space-y-3">
                  {/* Vista previa de la imagen seleccionada */}
                  {imagePreview && (
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <img
                        src={imagePreview}
                        alt="Vista previa"
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">
                          {selectedImage ? selectedImage.name : 'Imagen seleccionada'}
                        </p>
                      </div>
                      <button
                        onClick={clearImage}
                        className="text-red-500 hover:text-red-700"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  )}
                  
                  {/* Input para seleccionar imagen del dispositivo */}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-colors"
                    >
                      <div className="text-center">
                        <i className="ri-image-add-line text-2xl text-gray-400 mb-2"></i>
                        <p className="text-sm text-gray-600">
                          Seleccionar imagen del dispositivo
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          JPG, PNG, GIF hasta 10MB
                        </p>
                      </div>
                    </label>
                  </div>
                  
                  {/* Campo manual para URL */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      O ingresa una URL de imagen:
                    </label>
                    <input
                      type="url"
                      value={productForm.image_url}
                      onChange={(e) => {
                        setProductForm({ ...productForm, image_url: e.target.value });
                        setImagePreview(e.target.value);
                        setSelectedImage(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría
                </label>
                <select
                  value={productForm.category_id}
                  onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="">Seleccionar categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Orden de visualización
                </label>
                <input
                  type="number"
                  value={productForm.display_order}
                  onChange={(e) => setProductForm({ ...productForm, display_order: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowProductModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={saveProduct}
                disabled={!productForm.name || !productForm.category_id || productForm.price <= 0}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium"
              >
                {editingProduct ? 'Actualizar' : 'Crear'}
              </button>
              {/* Botón para configurar opciones después de crear/actualizar */}
              {editingProduct && (
                <button
                  onClick={() => {
                    setShowProductModal(false);
                    openOptionsManager(editingProduct);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                  title="Configurar opciones y extras"
                >
                  <i className="ri-settings-3-line mr-1"></i>
                  Opciones
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Opciones de Producto */}
      {showOptionsManager && selectedProductForOptions && (
        <ProductOptionsManager
          product={selectedProductForOptions}
          onClose={() => {
            setShowOptionsManager(false);
            setSelectedProductForOptions(null);
          }}
        />
      )}
    </div>
  );
}
