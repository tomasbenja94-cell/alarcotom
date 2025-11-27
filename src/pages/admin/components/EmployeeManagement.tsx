import { useState, useEffect } from 'react';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Employee>>({
    name: '',
    email: '',
    role: 'staff',
    phone: '',
    is_active: true,
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/employees?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmployees(data || []);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const url = editingEmployee 
        ? `${API_URL}/employees/${editingEmployee.id}`
        : `${API_URL}/employees`;
      
      const response = await fetch(url, {
        method: editingEmployee ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ ...form, store_id: storeId })
      });
      
      if (response.ok) {
        await loadEmployees();
        setShowModal(false);
        setEditingEmployee(null);
        setForm({
          name: '',
          email: '',
          role: 'staff',
          phone: '',
          is_active: true,
        });
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('Error al guardar el empleado');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700';
      case 'manager': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente';
      default: return 'Personal';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Gestión de Empleados</h2>
        <button
          onClick={() => {
            setEditingEmployee(null);
            setForm({
              name: '',
              email: '',
              role: 'staff',
              phone: '',
              is_active: true,
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Empleado
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Total Empleados</p>
          <p className="text-2xl font-bold text-blue-700">{employees.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 mb-1">Activos</p>
          <p className="text-2xl font-bold text-green-700">
            {employees.filter(e => e.is_active).length}
          </p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs text-purple-600 mb-1">Administradores</p>
          <p className="text-2xl font-bold text-purple-700">
            {employees.filter(e => e.role === 'admin').length}
          </p>
        </div>
      </div>

      {/* Lista de Empleados */}
      <div className="space-y-3">
        {employees.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-user-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay empleados registrados</p>
          </div>
        ) : (
          employees.map((employee) => (
            <div
              key={employee.id}
              className={`p-4 rounded-xl border-2 ${
                employee.is_active
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-slate-800">{employee.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getRoleColor(employee.role)}`}>
                      {getRoleLabel(employee.role)}
                    </span>
                    {employee.is_active ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        ACTIVO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
                        INACTIVO
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p><i className="ri-mail-line mr-2"></i>{employee.email}</p>
                    {employee.phone && (
                      <p><i className="ri-phone-line mr-2"></i>{employee.phone}</p>
                    )}
                    {employee.last_login && (
                      <p className="text-xs text-slate-500">
                        Último acceso: {new Date(employee.last_login).toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingEmployee(employee);
                      setForm(employee);
                      setShowModal(true);
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">
              {editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Nombre</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="email@ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="+54 9 11 1234-5678"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Rol</label>
                <select
                  value={form.role || 'staff'}
                  onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="staff">Personal</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium">Empleado activo</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingEmployee(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-semibold hover:shadow-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

