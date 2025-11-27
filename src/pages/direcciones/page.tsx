import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface Address {
  id: string;
  label: string;
  address: string;
  details?: string;
  isDefault: boolean;
}

const labelIcons: Record<string, string> = {
  'Casa': 'ri-home-4-fill',
  'Trabajo': 'ri-building-2-fill',
  'Otro': 'ri-map-pin-2-fill',
};

export default function DireccionesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([
    { id: '1', label: 'Casa', address: 'Av. Corrientes 1234, CABA', details: 'Piso 3, Depto B', isDefault: true },
    { id: '2', label: 'Trabajo', address: 'Av. 9 de Julio 567, CABA', isDefault: false },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', address: '', details: '' });

  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100);
  }, []);

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

  const getIcon = (label: string) => labelIcons[label] || labelIcons['Otro'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header premium */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.3),transparent_60%)]"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className={`relative px-4 pt-6 pb-6 transition-all duration-700 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(-1)} 
                className="w-11 h-11 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all"
              >
                <i className="ri-arrow-left-line text-white text-xl"></i>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/30">
                  <i className="ri-map-pin-2-fill text-white text-2xl"></i>
                </div>
                <div>
                  <h1 className="text-xl font-black text-white">Mis Direcciones</h1>
                  <p className="text-sm text-white/70">{addresses.length} guardadas</p>
                </div>
              </div>
            </div>
            {isAuthenticated && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
              >
                <i className="ri-add-line text-emerald-600 text-xl"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto -mt-2">
        {!isAuthenticated ? (
          <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-lg border border-white/50 transition-all duration-700 delay-200 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center">
              <i className="ri-map-pin-2-line text-4xl text-emerald-400"></i>
            </div>
            <p className="text-gray-900 font-bold text-lg mb-2">Iniciá sesión</p>
            <p className="text-gray-500 text-sm mb-5">Para guardar tus direcciones</p>
            <button 
              onClick={() => navigate('/login')} 
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all"
            >
              Iniciar sesión
            </button>
          </div>
        ) : showForm ? (
          <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/50 space-y-4 transition-all duration-700 delay-200 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <i className={editingId ? 'ri-edit-line' : 'ri-add-line'} text-emerald-500></i>
              {editingId ? 'Editar' : 'Nueva'} dirección
            </h2>
            
            {/* Etiquetas rápidas */}
            <div className="flex gap-2">
              {['Casa', 'Trabajo', 'Otro'].map(label => (
                <button
                  key={label}
                  onClick={() => setForm(f => ({ ...f, label }))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    form.label === label
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <i className={getIcon(label)}></i>
                  {label}
                </button>
              ))}
            </div>
            
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Dirección completa"
              className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
            />
            <input
              type="text"
              value={form.details}
              onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))}
              placeholder="Detalles adicionales (piso, depto, etc.)"
              className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ label: '', address: '', details: '' }); }}
                className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl text-gray-600 font-semibold hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.label || !form.address}
                className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none transition-all"
              >
                Guardar
              </button>
            </div>
          </div>
        ) : addresses.length === 0 ? (
          <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-8 text-center shadow-lg border border-white/50 transition-all duration-700 delay-200 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center">
              <i className="ri-map-pin-add-line text-4xl text-emerald-400"></i>
            </div>
            <p className="text-gray-900 font-bold text-lg">Sin direcciones</p>
            <p className="text-gray-500 text-sm mt-1 mb-5">Agregá tu primera dirección</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all"
            >
              <i className="ri-add-line mr-2"></i>
              Agregar dirección
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr, idx) => (
              <div 
                key={addr.id} 
                className={`bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-lg border border-white/50 animate-fadeInUp ${
                  addr.isDefault ? 'ring-2 ring-emerald-500/30' : ''
                }`}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    addr.isDefault 
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30' 
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    <i className={`${getIcon(addr.label)} text-xl`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900">{addr.label}</p>
                      {addr.isDefault && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                          PRINCIPAL
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1 truncate">{addr.address}</p>
                    {addr.details && <p className="text-xs text-gray-400 mt-0.5">{addr.details}</p>}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      className="flex-1 py-2.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-all"
                    >
                      <i className="ri-checkbox-circle-line mr-1"></i>
                      Usar como principal
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(addr)}
                    className="w-11 h-11 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="w-11 h-11 flex items-center justify-center text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-all"
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
