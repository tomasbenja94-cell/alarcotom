import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface Address {
  id: string;
  label: string;
  address: string;
  details?: string;
  isDefault: boolean;
}

export default function DireccionesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([
    { id: '1', label: 'Casa', address: 'Av. Corrientes 1234, CABA', details: 'Piso 3, Depto B', isDefault: true },
    { id: '2', label: 'Trabajo', address: 'Av. 9 de Julio 567, CABA', isDefault: false },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', address: '', details: '' });

  const handleSave = () => {
    if (!form.label || !form.address) return;
    
    if (editingId) {
      setAddresses(prev => prev.map(a => 
        a.id === editingId ? { ...a, ...form } : a
      ));
    } else {
      setAddresses(prev => [...prev, {
        id: Date.now().toString(),
        ...form,
        isDefault: prev.length === 0
      }]);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ label: '', address: '', details: '' });
  };

  const handleEdit = (addr: Address) => {
    setForm({ label: addr.label, address: addr.address, details: addr.details || '' });
    setEditingId(addr.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setAddresses(prev => prev.filter(a => a.id !== id));
  };

  const handleSetDefault = (id: string) => {
    setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100">
              <i className="ri-arrow-left-line text-gray-600"></i>
            </button>
            <h1 className="text-lg font-bold text-gray-800">Mis Direcciones</h1>
          </div>
          {isAuthenticated && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-500 text-white"
            >
              <i className="ri-add-line text-xl"></i>
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {!isAuthenticated ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <i className="ri-map-pin-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500 mb-4">Iniciá sesión para guardar direcciones</p>
            <button onClick={() => navigate('/login')} className="px-6 py-2 bg-rose-500 text-white rounded-xl">
              Iniciar sesión
            </button>
          </div>
        ) : showForm ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800">{editingId ? 'Editar' : 'Nueva'} dirección</h2>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Etiqueta (ej: Casa, Trabajo)"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Dirección completa"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="text"
              value={form.details}
              onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))}
              placeholder="Detalles adicionales (opcional)"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ label: '', address: '', details: '' }); }}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.label || !form.address}
                className="flex-1 py-3 bg-rose-500 text-white rounded-xl disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        ) : addresses.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <i className="ri-map-pin-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500">No tenés direcciones guardadas</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-6 py-2 bg-rose-500 text-white rounded-xl"
            >
              Agregar dirección
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map(addr => (
              <div key={addr.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${addr.isDefault ? 'bg-rose-100 text-rose-500' : 'bg-gray-100 text-gray-500'}`}>
                    <i className="ri-map-pin-2-fill"></i>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{addr.label}</p>
                      {addr.isDefault && (
                        <span className="text-xs bg-rose-100 text-rose-500 px-2 py-0.5 rounded-full">Principal</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{addr.address}</p>
                    {addr.details && <p className="text-xs text-gray-400 mt-0.5">{addr.details}</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg"
                    >
                      Usar como principal
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(addr)}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg"
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
  );
}

