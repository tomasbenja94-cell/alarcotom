
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface ProductOption {
  id: string;
  name: string;
  price: number;
  is_required: boolean;
  category_id: string;
  display_order: number;
}

interface OptionCategory {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  display_order: number;
  product_id: string;
  depends_on_category_id?: string;
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

interface ProductOptionsManagerProps {
  product: Product;
  onClose: () => void;
}

export default function ProductOptionsManager({ product, onClose }: ProductOptionsManagerProps) {
  const [categories, setCategories] = useState<OptionCategory[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showOptionForm, setShowOptionForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<OptionCategory | null>(null);
  const [editingOption, setEditingOption] = useState<ProductOption | null>(null);

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    min_selections: 0,
    max_selections: 1,
    is_required: false,
    display_order: 0,
    depends_on_category_id: ''
  });

  const [optionForm, setOptionForm] = useState({
    name: '',
    price: 0,
    is_required: false,
    display_order: 0
  });

  useEffect(() => {
    loadData();
  }, [product.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Cargar categorías de opciones
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('product_option_categories')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('display_order');

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        setCategories([]);
      } else {
        setCategories(categoriesData || []);
      }

      // Cargar opciones solo si hay categorías
      if (categoriesData && categoriesData.length > 0) {
        const { data: optionsData, error: optionsError } = await supabase
          .from('product_options')
          .select('*')
          .in('category_id', categoriesData.map(c => c.id))
          .eq('is_active', true)
          .order('display_order');

        if (optionsError) {
          console.error('Error loading options:', optionsError);
          setOptions([]);
        } else {
          setOptions(optionsData || []);
        }
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setCategories([]);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async () => {
    try {
      if (!categoryForm.name.trim()) {
        alert('El nombre de la categoría es obligatorio');
        return;
      }

      const categoryData = {
        name: categoryForm.name.trim(),
        min_selections: categoryForm.min_selections,
        max_selections: categoryForm.max_selections,
        is_required: categoryForm.is_required,
        display_order: categoryForm.display_order,
        depends_on_category_id: categoryForm.depends_on_category_id || null
      };

      if (editingCategory) {
        const { error } = await supabase
          .from('product_option_categories')
          .update({
            ...categoryData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_option_categories')
          .insert({
            ...categoryData,
            product_id: product.id,
            is_active: true
          });

        if (error) throw error;
      }
      
      resetCategoryForm();
      await loadData();
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Error al guardar la categoría. Inténtalo de nuevo.');
    }
  };

  const handleSaveOption = async () => {
    try {
      if (!selectedCategoryId) {
        alert('Selecciona una categoría primero');
        return;
      }

      if (!optionForm.name.trim()) {
        alert('El nombre de la opción es obligatorio');
        return;
      }

      if (editingOption) {
        const { error } = await supabase
          .from('product_options')
          .update({
            name: optionForm.name.trim(),
            price: optionForm.price,
            is_required: optionForm.is_required,
            display_order: optionForm.display_order,
            category_id: selectedCategoryId,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOption.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_options')
          .insert({
            name: optionForm.name.trim(),
            price: optionForm.price,
            is_required: optionForm.is_required,
            display_order: optionForm.display_order,
            category_id: selectedCategoryId,
            is_active: true
          });

        if (error) throw error;
      }
      
      resetOptionForm();
      await loadData();
    } catch (error) {
      console.error('Error saving option:', error);
      alert('Error al guardar la opción. Inténtalo de nuevo.');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (confirm('¿Eliminar esta categoría y todas sus opciones?')) {
      try {
        // Primero eliminar todas las opciones de esta categoría
        await supabase
          .from('product_options')
          .update({ is_active: false })
          .eq('category_id', categoryId);
          
        // Luego desactivar la categoría
        await supabase
          .from('product_option_categories')
          .update({ is_active: false })
          .eq('id', categoryId);
        
        await loadData();
      } catch (error) {
        console.error('Error deleting category:', error);
        alert('Error al eliminar la categoría. Inténtalo de nuevo.');
      }
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (confirm('¿Eliminar esta opción?')) {
      try {
        await supabase
          .from('product_options')
          .update({ is_active: false })
          .eq('id', optionId);
        
        await loadData();
      } catch (error) {
        console.error('Error deleting option:', error);
        alert('Error al eliminar la opción. Inténtalo de nuevo.');
      }
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      min_selections: 0,
      max_selections: 1,
      is_required: false,
      display_order: categories.length,
      depends_on_category_id: ''
    });
    setEditingCategory(null);
    setShowCategoryForm(false);
  };

  const resetOptionForm = () => {
    setOptionForm({
      name: '',
      price: 0,
      is_required: false,
      display_order: 0
    });
    setEditingOption(null);
    setShowOptionForm(false);
    setSelectedCategoryId('');
  };

  const editCategory = (category: OptionCategory) => {
    setCategoryForm({
      name: category.name,
      min_selections: category.min_selections,
      max_selections: category.max_selections,
      is_required: category.is_required,
      display_order: category.display_order,
      depends_on_category_id: category.depends_on_category_id || ''
    });
    setEditingCategory(category);
    setShowCategoryForm(true);
  };

  const editOption = (option: ProductOption) => {
    setOptionForm({
      name: option.name,
      price: option.price,
      is_required: option.is_required,
      display_order: option.display_order
    });
    setEditingOption(option);
    setSelectedCategoryId(option.category_id);
    setShowOptionForm(true);
  };

  const getCategoryName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Categoría eliminada';
  };

  const getAvailableParentCategories = (): OptionCategory[] => {
    if (editingCategory) {
      // Al editar, excluir la categoría actual y sus dependientes
      return categories.filter(c => 
        c.id !== editingCategory.id && 
        c.depends_on_category_id !== editingCategory.id
      );
    }
    return categories;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
            <div className="text-sm text-gray-600">Cargando opciones...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Gestionar Opciones del Producto</h2>
              <p className="text-sm text-gray-600 mt-1">Producto: {product.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Ejemplo explicativo mejorado */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-blue-800 mb-2">💡 Sistema de Categorías Secuenciales:</h4>
            <div className="text-sm text-blue-700 space-y-2">
              <div><strong>1. PAPAS</strong> (Obligatorio, se desbloquea primero)</div>
              <div className="ml-4">• Papas Chicas ($0)</div>
              <div className="ml-4">• Papas Grandes (+$500)</div>
              
              <div><strong>2. ADEREZOS</strong> (Depende de PAPAS)</div>
              <div className="ml-4">• Sin Cheddar ($0)</div>
              <div className="ml-4">• Con Cheddar (+$100)</div>
              
              <div><strong>3. EXTRAS</strong> (Depende de ADEREZOS, máximo 2 selecciones)</div>
              <div className="ml-4">• Bacon (+$200)</div>
              <div className="ml-4">• Cebolla (+$50)</div>
              <div className="ml-4">• Queso Extra (+$150)</div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              <strong>Flujo:</strong> El cliente debe elegir PAPAS → se desbloquea ADEREZOS → al elegir aderezos se desbloquea EXTRAS
            </div>
          </div>

          {/* Categorías */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Categorías de Opciones</h3>
              <button
                onClick={() => {
                  setCategoryForm({
                    name: '',
                    min_selections: 1,
                    max_selections: 1,
                    is_required: true,
                    display_order: categories.length,
                    depends_on_category_id: ''
                  });
                  setShowCategoryForm(true);
                }}
                className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 flex items-center gap-2"
              >
                <i className="ri-add-line"></i>
                Nueva Categoría
              </button>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="mb-2">
                  <i className="ri-folder-add-line text-4xl"></i>
                </div>
                <p>No hay categorías de opciones.</p>
                <p className="text-sm">Crea categorías secuenciales como "PAPAS", "ADEREZOS", "EXTRAS", etc.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((category, index) => (
                  <div key={category.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                            #{index + 1}
                          </span>
                          <h4 className="font-semibold text-lg text-gray-800">{category.name}</h4>
                          {category.depends_on_category_id && (
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                              <i className="ri-lock-line mr-1"></i>
                              Depende de: {getCategoryName(category.depends_on_category_id)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Selecciones: {category.min_selections} - {category.max_selections}
                          {category.is_required && (
                            <span className="ml-2 bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                              Obligatorio
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editCategory(category)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-medium text-gray-700">Opciones disponibles:</div>
                        <button
                          onClick={() => {
                            setSelectedCategoryId(category.id);
                            setOptionForm({
                              name: '',
                              price: 0,
                              is_required: false,
                              display_order: options.filter(opt => opt.category_id === category.id).length
                            });
                            setShowOptionForm(true);
                          }}
                          className="text-orange-600 hover:text-orange-800 text-sm flex items-center gap-1"
                        >
                          <i className="ri-add-line"></i>
                          Agregar opción
                        </button>
                      </div>
                      
                      {options.filter(opt => opt.category_id === category.id).length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          Sin opciones. Agrega opciones como "Chicas", "Grandes", "Con Cheddar", etc.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {options.filter(opt => opt.category_id === category.id).map((option) => (
                            <div key={option.id} className="flex justify-between items-center bg-gray-50 p-3 rounded border">
                              <div>
                                <span className="font-medium">{option.name}</span>
                                <div className="text-sm text-gray-600">
                                  {option.price === 0 ? (
                                    <span className="text-green-600">Gratis</span>
                                  ) : (
                                    <span className="text-orange-600">+${option.price.toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => editOption(option)}
                                  className="text-blue-600 hover:text-blue-800 p-1"
                                >
                                  <i className="ri-edit-line"></i>
                                </button>
                                <button
                                  onClick={() => handleDeleteOption(option.id)}
                                  className="text-red-600 hover:text-red-800 p-1"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal para categoría */}
        {showCategoryForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría de Opciones'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre de la categoría</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Ej: PAPAS, ADEREZOS, EXTRAS"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Depende de categoría</label>
                  <select
                    value={categoryForm.depends_on_category_id}
                    onChange={(e) => setCategoryForm({...categoryForm, depends_on_category_id: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Sin dependencia (se desbloquea primero)</option>
                    {getAvailableParentCategories().map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Si depende de otra categoría, se desbloqueará solo cuando la anterior esté completa
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Mín. selecciones</label>
                    <input
                      type="number"
                      min="0"
                      value={categoryForm.min_selections}
                      onChange={(e) => setCategoryForm({...categoryForm, min_selections: parseInt(e.target.value) || 0})}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Máx. selecciones</label>
                    <input
                      type="number"
                      min="1"
                      value={categoryForm.max_selections}
                      onChange={(e) => setCategoryForm({...categoryForm, max_selections: parseInt(e.target.value) || 1})}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={categoryForm.is_required}
                      onChange={(e) => setCategoryForm({...categoryForm, is_required: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm">El cliente debe elegir obligatoriamente</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Orden de visualización</label>
                  <input
                    type="number"
                    min="0"
                    value={categoryForm.display_order}
                    onChange={(e) => setCategoryForm({...categoryForm, display_order: parseInt(e.target.value) || 0})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveCategory}
                  disabled={!categoryForm.name.trim()}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
                >
                  {editingCategory ? 'Actualizar' : 'Crear Categoría'}
                </button>
                <button
                  onClick={resetCategoryForm}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para opción */}
        {showOptionForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">
                {editingOption ? 'Editar Opción' : 'Nueva Opción'}
              </h3>
              
              <div className="space-y-4">
                {!editingOption && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Categoría</label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Seleccionar categoría</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Nombre de la opción</label>
                  <input
                    type="text"
                    value={optionForm.name}
                    onChange={(e) => setOptionForm({...optionForm, name: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Ej: Papas Chicas, Con Cheddar, Bacon"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Precio adicional
                    <span className="text-gray-500 text-xs ml-1">(Deja en 0 si es gratis)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={optionForm.price}
                    onChange={(e) => setOptionForm({...optionForm, price: parseFloat(e.target.value) || 0})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Orden de visualización</label>
                  <input
                    type="number"
                    min="0"
                    value={optionForm.display_order}
                    onChange={(e) => setOptionForm({...optionForm, display_order: parseInt(e.target.value) || 0})}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveOption}
                  disabled={!optionForm.name.trim() || !selectedCategoryId}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
                >
                  {editingOption ? 'Actualizar' : 'Crear Opción'}
                </button>
                <button
                  onClick={resetOptionForm}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
