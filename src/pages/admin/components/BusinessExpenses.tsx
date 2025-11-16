import { useState, useEffect } from 'react';

interface Expense {
  id?: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  supplierId?: string;
  notes?: string;
}

const EXPENSE_CATEGORIES = [
  { value: 'proveedores', label: '🛒 Compras a Proveedores' },
  { value: 'combustible', label: '⛽ Combustible del Reparto' },
  { value: 'mantenimiento', label: '🔧 Mantenimiento' },
  { value: 'herramientas', label: '🛠️ Herramientas' },
  { value: 'imprevistos', label: '⚠️ Gastos Imprevistos' },
  { value: 'otros', label: '📋 Otros' },
];

export default function BusinessExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newExpense, setNewExpense] = useState<Expense>({
    date: new Date().toISOString().split('T')[0],
    category: 'proveedores',
    description: '',
    amount: 0
  });
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'https://elbuenmenu.site/api';

  useEffect(() => {
    loadExpenses();
  }, [filterMonth]);

  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/business/expenses?month=${filterMonth}`);
      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
      }
    } catch (error) {
      console.error('Error cargando gastos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveExpense = async () => {
    if (!newExpense.description.trim() || newExpense.amount <= 0) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/business/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newExpense)
      });

      if (response.ok) {
        await loadExpenses();
        setShowModal(false);
        setNewExpense({
          date: new Date().toISOString().split('T')[0],
          category: 'proveedores',
          description: '',
          amount: 0
        });
        alert('✅ Gasto registrado exitosamente');
      } else {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        alert(`❌ Error: ${error.error || 'Error al registrar gasto'}`);
      }
    } catch (error: any) {
      console.error('Error registrando gasto:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expensesByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">💸 GASTOS REALES</h2>
            <p className="text-sm text-[#C7C7C7]">Registra todos los gastos del negocio</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-[#111111] text-white border border-[#FFC300] rounded-sm hover:bg-[#1A1A1A] transition-all text-sm font-medium"
          >
            ➕ Registrar Gasto
          </button>
        </div>
      </div>

      {/* Filtros y resumen */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <label className="text-sm text-[#111111] font-medium">Mes:</label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-3 py-1 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-[#C7C7C7]">Total del mes</p>
            <p className="text-2xl font-bold text-[#111111]">
              ${totalExpenses.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Resumen por categoría */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {Object.entries(expensesByCategory).map(([category, amount]) => {
            const cat = EXPENSE_CATEGORIES.find(c => c.value === category);
            return (
              <div key={category} className="bg-[#F9F9F9] border border-[#C7C7C7] rounded-sm p-3">
                <p className="text-xs text-[#C7C7C7] mb-1">{cat?.label || category}</p>
                <p className="text-lg font-bold text-[#111111]">
                  ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista de gastos */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="p-4 border-b border-[#C7C7C7]">
          <h3 className="text-lg font-bold text-[#111111]">Historial de Gastos</h3>
        </div>
        <div className="divide-y divide-[#C7C7C7]">
          {isLoading ? (
            <div className="p-8 text-center text-[#C7C7C7]">Cargando...</div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-[#C7C7C7]">No hay gastos registrados para este mes</div>
          ) : (
            expenses.map((expense) => {
              const cat = EXPENSE_CATEGORIES.find(c => c.value === expense.category);
              return (
                <div key={expense.id || Math.random()} className="p-4 hover:bg-[#F9F9F9] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{cat?.label.split(' ')[0]}</span>
                        <div>
                          <p className="text-sm font-medium text-[#111111]">{expense.description}</p>
                          <p className="text-xs text-[#C7C7C7]">
                            {new Date(expense.date).toLocaleDateString('es-AR')} • {cat?.label.substring(2)}
                          </p>
                        </div>
                      </div>
                      {expense.notes && (
                        <p className="text-xs text-[#C7C7C7] mt-1">{expense.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#111111]">
                        ${expense.amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal para agregar gasto */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-6 w-full max-w-md border border-[#FFC300]">
            <h3 className="text-xl font-bold text-[#111111] mb-4">➕ Registrar Nuevo Gasto</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">Categoría</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  placeholder="Ej: Compra de papas al proveedor"
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newExpense.amount || ''}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">Fecha</label>
                <input
                  type="date"
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>

              <div>
                <label className="text-sm text-[#111111] font-medium mb-1 block">Notas (opcional)</label>
                <textarea
                  value={newExpense.notes || ''}
                  onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={3}
                  className="w-full px-3 py-2 border border-[#C7C7C7] rounded-sm text-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
              </div>
            </div>

            <div className="flex space-x-4 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#F9F9F9] hover:bg-[#E9E9E9] text-[#111111] font-medium py-2 rounded-sm transition-all border border-[#C7C7C7]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveExpense}
                disabled={isLoading || !newExpense.description.trim() || newExpense.amount <= 0}
                className="flex-1 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 rounded-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#111111]"
              >
                {isLoading ? 'Guardando...' : 'Guardar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

