import { useState, useEffect } from 'react';
import { storeCategoriesApi } from '../../../lib/api';

interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  displayOrder: number;
  isActive: boolean;
  _count?: {
    stores: number;
  };
}

export default function StoreCategoriesManagement() {
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<StoreCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon: '',
    color: '#FFD523',
    displayOrder: 0
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await storeCategoriesApi.getAll();
      setCategories(data);
    } catch (error) {
      console.error('Error loading store categories:', error);
      alert('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (!formData.name || !formData.slug) {
        alert('Nombre y slug son requeridos');
        return;
      }

      await storeCategoriesApi.create(formData);
      alert('✅ Categoría creada exitosamente');
      setShowCreateModal(false);
      setFormData({ name: '', slug: '', icon: '', color: '#FFD523', displayOrder: 0 });
      loadCategories();
    } catch (error: any) {
      console.error('Error creating category:', error);
      alert(`❌ Error: ${error.message || 'No se pudo crear la categoría'}`);
    }
  };

  const handleUpdate = async () => {
    if (!editingCategory) return;
    
    try {
      await storeCategoriesApi.update(editingCategory.id, formData);
      alert('✅ Categoría actualizada exitosamente');
      setEditingCategory(null);
      setFormData({ name: '', slug: '', icon: '', color: '#FFD523', displayOrder: 0 });
      loadCategories();
    } catch (error: any) {
      console.error('Error updating category:', error);
      alert(`❌ Error: ${error.message || 'No se pudo actualizar la categoría'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta categoría? No se puede eliminar si tiene tiendas asignadas.')) {
      return;
    }

    try {
      await storeCategoriesApi.delete(id);
      alert('✅ Categoría eliminada exitosamente');
      loadCategories();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      alert(`❌ Error: ${error.message || 'No se pudo eliminar la categoría'}`);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({ name: '', slug: '', icon: '', color: '#FFD523', displayOrder: categories.length });
    setShowCreateModal(true);
  };

  const openEditModal = (category: StoreCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      icon: category.icon || '',
      color: category.color || '#FFD523',
      displayOrder: category.displayOrder
    });
    setShowCreateModal(true);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FFD523]/20 border-t-[#FFD523] mx-auto"></div>
        <p className="mt-4 text-gray-600">Cargando categorías...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Categorías de Tiendas</h2>
          <p className="text-sm text-gray-500">
            Gestiona las categorías que aparecen en la pantalla de inicio (Restaurantes, Bebidas, Kioscos, etc.)
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all shadow-sm flex items-center gap-2"
        >
          <i className="ri-add-line text-xl"></i>
          <span>Nueva Categoría</span>
        </button>
      </div>

      {/* Lista de categorías */}
      {categories.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-16 text-center">
          <i className="ri-folder-line text-6xl text-gray-300 mb-4"></i>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay categorías</h3>
          <p className="text-sm text-gray-500 mb-6">Crea tu primera categoría para organizar las tiendas</p>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
          >
            + Crear Primera Categoría
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <div
              key={category.id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {category.icon && (
                    <span className="text-3xl">{category.icon}</span>
                  )}
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{category.name}</h3>
                    <p className="text-xs text-gray-500">/{category.slug}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  category.isActive 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {category.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {category.color && (
                <div className="mb-3">
                  <div
                    className="w-full h-8 rounded-lg"
                    style={{ backgroundColor: category.color }}
                  ></div>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <strong>{category._count?.stores || 0}</strong> tienda(s) asignada(s)
                </p>
                <p className="text-xs text-gray-500">Orden: {category.displayOrder}</p>
              </div>

              <div className="flex gap-2 pt-4 border-t border-gray-100">
                <button
                  onClick={() => openEditModal(category)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all text-sm"
                >
                  <i className="ri-edit-line mr-1"></i>
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-all text-sm"
                  disabled={category._count && category._count.stores > 0}
                  title={category._count && category._count.stores > 0 ? 'No se puede eliminar: tiene tiendas asignadas' : 'Eliminar'}
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear/Editar */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCategory(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      name,
                      slug: formData.slug || generateSlug(name)
                    });
                  }}
                  placeholder="Ej: Restaurantes, Bebidas, Kioscos..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD523]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slug * (URL amigable)
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="restaurantes, bebidas, kioscos..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD523]"
                />
                <p className="text-xs text-gray-500 mt-1">Se genera automáticamente desde el nombre</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Icono (Emoji)
                </label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🍔, 🥤, 🍫..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD523]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#FFD523"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD523]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Orden de visualización
                </label>
                <input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD523]"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCategory(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={editingCategory ? handleUpdate : handleCreate}
                className="flex-1 px-4 py-2 bg-[#FFD523] text-black rounded-lg font-semibold hover:bg-[#FFE066] transition-all"
              >
                {editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

