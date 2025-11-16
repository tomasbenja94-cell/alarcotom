import { useState, useEffect } from 'react';

interface Product {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  price: number;
  labels?: string[];
}

const LABEL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  más_vendido: { label: 'Más Vendido', color: '#10B981', icon: '🟩' },
  recomendado: { label: 'Recomendado', color: '#F59E0B', icon: '🟨' },
  pocas_ventas: { label: 'Pocas Ventas', color: '#EF4444', icon: '🟥' },
  nuevo: { label: 'Nuevo', color: '#C7C7C7', icon: '⚪' },
  muy_pedido_hoy: { label: 'Muy Pedido Hoy', color: '#FFC300', icon: '🔥' }
};

export default function ProductLabels() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // Cargar productos
      const productsResponse = await fetch(`${API_URL}/products`);
      const productsData = await productsResponse.ok ? await productsResponse.json() : [];
      
      // Cargar etiquetas
      const labelsResponse = await fetch(`${API_URL}/api/products/labels`);
      const labelsData = await labelsResponse.ok ? await labelsResponse.json() : { labels: {} };
      
      // Combinar productos con etiquetas
      const productsWithLabels = productsData.map((p: Product) => ({
        ...p,
        labels: labelsData.labels[p.id] ? JSON.parse(labelsData.labels[p.id]) : []
      }));
      
      setProducts(productsWithLabels);
    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLabels = async () => {
    if (!confirm('¿Actualizar etiquetas automáticamente?\n\nEsto analizará las ventas y actualizará las etiquetas de todos los productos.')) {
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`${API_URL}/api/products/labels/update`, {
        method: 'POST'
      });

      if (response.ok) {
        await loadProducts();
        alert('✅ Etiquetas actualizadas exitosamente');
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al actualizar etiquetas'}`);
      }
    } catch (error: any) {
      console.error('Error actualizando etiquetas:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleLabel = async (productId: string, labelType: string, currentLabels: string[]) => {
    const newLabels = currentLabels.includes(labelType)
      ? currentLabels.filter(l => l !== labelType)
      : [...currentLabels, labelType];

    try {
      const response = await fetch(`${API_URL}/api/products/labels/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels: newLabels })
      });

      if (response.ok) {
        await loadProducts();
      } else {
        alert('Error al actualizar etiquetas');
      }
    } catch (error) {
      console.error('Error actualizando etiqueta:', error);
      alert('Error al actualizar etiquetas');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">🏷️ ETIQUETAS INTELIGENTES</h2>
            <p className="text-sm text-[#C7C7C7]">Gestiona etiquetas automáticas de productos</p>
          </div>
          <button
            onClick={updateLabels}
            disabled={isUpdating}
            className="px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isUpdating ? 'Actualizando...' : '🔄 Actualizar Etiquetas'}
          </button>
        </div>
      </div>

      {/* Leyenda de etiquetas */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <h3 className="text-sm font-bold text-[#111111] mb-3">Leyenda de Etiquetas</h3>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(LABEL_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center space-x-2">
              <span className="text-xl">{config.icon}</span>
              <span className="text-sm text-[#111111]">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de productos */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="p-4 border-b border-[#C7C7C7]">
          <h3 className="text-lg font-bold text-[#111111]">
            Productos ({products.length})
          </h3>
        </div>
        <div className="divide-y divide-[#C7C7C7]">
          {isLoading ? (
            <div className="p-8 text-center text-[#C7C7C7]">Cargando productos...</div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-[#C7C7C7]">No hay productos registrados</div>
          ) : (
            products.map((product) => (
              <div key={product.id} className="p-4 hover:bg-[#F9F9F9] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h4 className="text-sm font-bold text-[#111111]">{product.name}</h4>
                      <span className="text-xs text-[#C7C7C7]">
                        ${product.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {product.categoryName && (
                        <span className="text-xs text-[#C7C7C7]">• {product.categoryName}</span>
                      )}
                    </div>
                    
                    {/* Etiquetas actuales */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {product.labels && product.labels.length > 0 ? (
                        product.labels.map((label) => {
                          const config = LABEL_CONFIG[label];
                          if (!config) return null;
                          return (
                            <span
                              key={label}
                              className="px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-all"
                              style={{ 
                                backgroundColor: config.color + '20',
                                color: config.color,
                                border: `1px solid ${config.color}`
                              }}
                              onClick={() => toggleLabel(product.id, label, product.labels || [])}
                            >
                              {config.icon} {config.label}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-[#C7C7C7] italic">Sin etiquetas</span>
                      )}
                    </div>

                    {/* Botones para agregar etiquetas */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(LABEL_CONFIG).map(([key, config]) => {
                        const hasLabel = product.labels?.includes(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleLabel(product.id, key, product.labels || [])}
                            className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                              hasLabel
                                ? 'bg-[#111111] text-white border-[#FFC300]'
                                : 'bg-white text-[#111111] border-[#C7C7C7] hover:border-[#FFC300]'
                            }`}
                          >
                            {config.icon} {hasLabel ? 'Quitar' : 'Agregar'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

