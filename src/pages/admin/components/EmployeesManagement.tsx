import { useState, useEffect } from 'react';

interface Employee {
  id: string;
  name: string;
  role: 'cocina' | 'caja' | 'limpieza' | 'administracion' | 'otro';
  hourly_rate: number;
  daily_rate?: number;
  delivery_rate?: number;
  base_salary?: number;
  is_active: boolean;
  created_at: string;
}

interface TimeClock {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out?: string;
  hours_worked?: number;
  date: string;
}

interface Payment {
  id: string;
  employee_id: string;
  amount: number;
  payment_date: string;
  payment_method?: string;
  reference?: string;
  period_start?: string;
  period_end?: string;
  hours_worked?: number;
  created_at: string;
}

interface SalaryCalculation {
  employee_id: string;
  period_start: string;
  period_end: string;
  hours_worked: number;
  hourly_amount: number;
  daily_amount: number;
  delivery_amount: number;
  base_salary: number;
  bonuses: number;
  deductions: number;
  total: number;
}

export default function EmployeesManagement() {
  const [activeTab, setActiveTab] = useState<'employees' | 'timeclock' | 'payments' | 'performance'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeClocks, setTimeClocks] = useState<TimeClock[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para formulario de empleado
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    role: 'cocina' as Employee['role'],
    hourly_rate: 0,
    daily_rate: 0,
    delivery_rate: 0,
    base_salary: 0,
    is_active: true
  });

  // Estados para fichada
  const [selectedEmployeeForClock, setSelectedEmployeeForClock] = useState<Employee | null>(null);
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockAction, setClockAction] = useState<'in' | 'out'>('in');

  // Estados para pagos
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEmployeeForPayment, setSelectedEmployeeForPayment] = useState<Employee | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'efectivo',
    reference: '',
    period_start: '',
    period_end: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Aquí cargarías desde la API cuando esté implementada
      // Por ahora, datos de ejemplo
      setEmployees([]);
      setTimeClocks([]);
      setPayments([]);
    } catch (error) {
      console.error('Error loading employees data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        // Actualizar empleado
        alert('Funcionalidad de actualización próxima - Endpoint pendiente');
      } else {
        // Crear nuevo empleado
        alert('Funcionalidad de creación próxima - Endpoint pendiente');
      }

      setShowEmployeeModal(false);
      setEditingEmployee(null);
      setEmployeeForm({
        name: '',
        role: 'cocina',
        hourly_rate: 0,
        daily_rate: 0,
        delivery_rate: 0,
        base_salary: 0,
        is_active: true
      });
      await loadData();
    } catch (error) {
      console.error('Error saving employee:', error);
      alert('Error al guardar empleado');
    }
  };

  const handleClockIn = async (employeeId: string) => {
    try {
      // Registrar entrada
      alert(`Funcionalidad de fichada próxima - Empleado ${employeeId}`);
      await loadData();
    } catch (error) {
      console.error('Error clocking in:', error);
    }
  };

  const handleClockOut = async (employeeId: string) => {
    try {
      // Registrar salida
      alert(`Funcionalidad de fichada próxima - Empleado ${employeeId}`);
      await loadData();
    } catch (error) {
      console.error('Error clocking out:', error);
    }
  };

  const calculateSalary = (employee: Employee, periodStart: string, periodEnd: string): SalaryCalculation | null => {
    // Calcular sueldo basado en fichadas del período
    const periodClocks = timeClocks.filter(tc => 
      tc.employee_id === employee.id &&
      tc.date >= periodStart &&
      tc.date <= periodEnd &&
      tc.clock_out
    );

    const totalHours = periodClocks.reduce((sum, tc) => sum + (tc.hours_worked || 0), 0);
    const hourlyAmount = totalHours * (employee.hourly_rate || 0);
    const dailyAmount = 0; // Calcular según días trabajados
    const deliveryAmount = 0; // Calcular según entregas (si aplica)
    const baseSalary = employee.base_salary || 0;
    const bonuses = 0;
    const deductions = 0;

    return {
      employee_id: employee.id,
      period_start: periodStart,
      period_end: periodEnd,
      hours_worked: totalHours,
      hourly_amount: hourlyAmount,
      daily_amount: dailyAmount,
      delivery_amount: deliveryAmount,
      base_salary: baseSalary,
      bonuses,
      deductions,
      total: hourlyAmount + dailyAmount + deliveryAmount + baseSalary + bonuses - deductions
    };
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForPayment) return;

    try {
      // Registrar pago
      alert('Funcionalidad de registro de pago próxima');
      setShowPaymentModal(false);
      setSelectedEmployeeForPayment(null);
      setPaymentForm({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'efectivo',
        reference: '',
        period_start: '',
        period_end: ''
      });
      await loadData();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeEmployees = filteredEmployees.filter(emp => emp.is_active);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getRoleLabel = (role: Employee['role']) => {
    const labels = {
      cocina: '👨‍🍳 Cocina',
      caja: '💳 Caja',
      limpieza: '🧹 Limpieza',
      administracion: '📋 Administración',
      otro: '👤 Otro'
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#C7C7C7] border-t-[#111111] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#C7C7C7] font-medium">Cargando empleados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Premium Style */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-[#111111]">EMPLEADOS</h2>
            <p className="text-sm text-[#C7C7C7]">Administra personal, horarios, sueldos y pagos del negocio</p>
          </div>
          <button
            onClick={() => {
              setShowEmployeeModal(true);
              setEditingEmployee(null);
            }}
            className="px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
          >
            + Agregar Empleado
          </button>
        </div>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-1">TOTAL EMPLEADOS</div>
          <div className="text-2xl font-bold text-[#111111]">{employees.length}</div>
          <div className="text-xs text-[#C7C7C7] mt-1">{activeEmployees.length} activos</div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-1">EN TURNO</div>
          <div className="text-2xl font-bold text-[#111111]">
            {timeClocks.filter(tc => !tc.clock_out).length}
          </div>
          <div className="text-xs text-[#C7C7C7] mt-1">Empleados trabajando</div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-1">PAGOS ESTE MES</div>
          <div className="text-2xl font-bold text-[#111111]">
            {formatCurrency(
              payments
                .filter(p => {
                  const paymentDate = new Date(p.payment_date);
                  const now = new Date();
                  return paymentDate.getMonth() === now.getMonth() && 
                         paymentDate.getFullYear() === now.getFullYear();
                })
                .reduce((sum, p) => sum + p.amount, 0)
            )}
          </div>
        </div>
        <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
          <div className="text-xs text-[#C7C7C7] font-medium uppercase tracking-wider mb-1">HORAS ESTE MES</div>
          <div className="text-2xl font-bold text-[#111111]">
            {timeClocks
              .filter(tc => {
                const clockDate = new Date(tc.date);
                const now = new Date();
                return clockDate.getMonth() === now.getMonth() && 
                       clockDate.getFullYear() === now.getFullYear() &&
                       tc.clock_out;
              })
              .reduce((sum, tc) => sum + (tc.hours_worked || 0), 0)
              .toFixed(1)}
          </div>
          <div className="text-xs text-[#C7C7C7] mt-1">Horas trabajadas</div>
        </div>
      </div>

      {/* Navegación de tabs */}
      <div className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm">
        <div className="flex border-b border-[#C7C7C7]">
          {[
            { id: 'employees', label: 'Empleados', icon: '👥' },
            { id: 'timeclock', label: 'Control de Horario', icon: '🕐' },
            { id: 'payments', label: 'Pagos', icon: '💰' },
            { id: 'performance', label: 'Rendimiento', icon: '📊' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 text-xs font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#FFC300] text-[#111111] bg-[#FFF9E6]'
                  : 'border-transparent text-[#C7C7C7] hover:text-[#111111]'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido de tabs */}
        <div className="p-6">
          {/* Tab: Empleados */}
          {activeTab === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <input
                  type="text"
                  placeholder="🔍 Buscar por nombre o rol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full max-w-md px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-sm text-[#111111]"
                />
              </div>

              {filteredEmployees.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">
                    {searchTerm ? 'No se encontraron empleados' : 'No hay empleados registrados. Agrega el primero.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5 hover:border-[#FFC300] transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-bold text-base text-[#111111] mb-1">{emp.name}</h3>
                          <div className="text-xs text-[#C7C7C7] mb-2">{getRoleLabel(emp.role)}</div>
                          <div className={`inline-block px-2 py-1 rounded-sm text-xs font-medium ${
                            emp.is_active 
                              ? 'bg-[#111111] text-white border border-[#FFC300]' 
                              : 'bg-white text-[#C7C7C7] border border-[#C7C7C7]'
                          }`}>
                            {emp.is_active ? '✅ Activo' : '❌ Inactivo'}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setEditingEmployee(emp);
                            setEmployeeForm({
                              name: emp.name,
                              role: emp.role,
                              hourly_rate: emp.hourly_rate,
                              daily_rate: emp.daily_rate || 0,
                              delivery_rate: emp.delivery_rate || 0,
                              base_salary: emp.base_salary || 0,
                              is_active: emp.is_active
                            });
                            setShowEmployeeModal(true);
                          }}
                          className="px-3 py-1 text-xs font-medium text-[#111111] hover:bg-[#F9F9F9] rounded-sm transition-all border border-[#C7C7C7]"
                        >
                          Editar
                        </button>
                      </div>
                      
                      <div className="space-y-2 pt-3 border-t border-[#C7C7C7]">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#C7C7C7]">Pago por hora:</span>
                          <span className="font-medium text-[#111111]">{formatCurrency(emp.hourly_rate)}</span>
                        </div>
                        {emp.daily_rate && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#C7C7C7]">Pago por día:</span>
                            <span className="font-medium text-[#111111]">{formatCurrency(emp.daily_rate)}</span>
                          </div>
                        )}
                        {emp.base_salary && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#C7C7C7]">Sueldo base:</span>
                            <span className="font-medium text-[#111111]">{formatCurrency(emp.base_salary)}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-[#C7C7C7] flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedEmployeeForPayment(emp);
                            setPaymentForm({
                              amount: '',
                              payment_date: new Date().toISOString().split('T')[0],
                              payment_method: 'efectivo',
                              reference: '',
                              period_start: '',
                              period_end: ''
                            });
                            setShowPaymentModal(true);
                          }}
                          className="flex-1 px-3 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white text-xs font-medium rounded-sm transition-all border border-[#111111]"
                        >
                          💰 Pagar
                        </button>
                        <button
                          onClick={() => {
                            const isClockedIn = timeClocks.some(tc => 
                              tc.employee_id === emp.id && !tc.clock_out
                            );
                            setSelectedEmployeeForClock(emp);
                            setClockAction(isClockedIn ? 'out' : 'in');
                            setShowClockModal(true);
                          }}
                          className="flex-1 px-3 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] text-xs font-medium rounded-sm transition-all border border-[#C7C7C7]"
                        >
                          🕐 {timeClocks.some(tc => tc.employee_id === emp.id && !tc.clock_out) ? 'Salida' : 'Entrada'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Control de Horario */}
          {activeTab === 'timeclock' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">FICHADA DE EMPLEADOS</h3>
                <p className="text-xs text-[#C7C7C7]">Registra entrada y salida de cada empleado</p>
              </div>

              {activeEmployees.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay empleados activos para fichar</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeEmployees.map((emp) => {
                    const currentClock = timeClocks.find(tc => 
                      tc.employee_id === emp.id && !tc.clock_out
                    );
                    const isClockedIn = !!currentClock;

                    return (
                      <div key={emp.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-4">
                        <h4 className="font-medium text-sm text-[#111111] mb-2">{emp.name}</h4>
                        <div className="text-xs text-[#C7C7C7] mb-3">{getRoleLabel(emp.role)}</div>
                        
                        {isClockedIn && currentClock && (
                          <div className="mb-3 p-2 bg-[#FFF9E6] border border-[#FFC300] rounded-sm">
                            <div className="text-xs text-[#111111] font-medium">🟢 En turno</div>
                            <div className="text-xs text-[#C7C7C7] mt-1">
                              Entrada: {new Date(currentClock.clock_in).toLocaleTimeString('es-AR')}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => {
                            if (isClockedIn && currentClock) {
                              handleClockOut(emp.id);
                            } else {
                              handleClockIn(emp.id);
                            }
                          }}
                          className={`w-full px-3 py-2 text-xs font-medium rounded-sm transition-all border ${
                            isClockedIn
                              ? 'bg-white hover:bg-[#F9F9F9] text-[#111111] border-[#C7C7C7]'
                              : 'bg-[#111111] hover:bg-[#1A1A1A] text-white border-[#FFC300]'
                          }`}
                        >
                          {isClockedIn ? '🕐 Registrar Salida' : '🕐 Registrar Entrada'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Historial de fichadas */}
              <div className="mt-6">
                <h3 className="text-base font-bold text-[#111111] mb-4">HISTORIAL DE FICHADAS</h3>
                {timeClocks.length === 0 ? (
                  <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                    <p className="text-sm text-[#C7C7C7] font-medium">No hay fichadas registradas</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#C7C7C7]">
                          <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Empleado</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Fecha</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Entrada</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Salida</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeClocks.map((clock) => {
                          const employee = employees.find(emp => emp.id === clock.employee_id);
                          return (
                            <tr key={clock.id} className="border-b border-[#C7C7C7] hover:bg-[#F9F9F9]">
                              <td className="py-3 px-4 text-sm font-medium text-[#111111]">
                                {employee?.name || 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                                {new Date(clock.date).toLocaleDateString('es-AR')}
                              </td>
                              <td className="py-3 px-4 text-xs text-[#111111]">
                                {new Date(clock.clock_in).toLocaleTimeString('es-AR')}
                              </td>
                              <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                                {clock.clock_out ? new Date(clock.clock_out).toLocaleTimeString('es-AR') : '-'}
                              </td>
                              <td className="py-3 px-4 text-xs font-medium text-[#111111]">
                                {clock.hours_worked ? `${clock.hours_worked.toFixed(2)}h` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Pagos */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">REGISTRO DE PAGOS</h3>
                <p className="text-xs text-[#C7C7C7]">Registra y gestiona los pagos a empleados</p>
              </div>

              {payments.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay pagos registrados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#C7C7C7]">
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Empleado</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Fecha</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Monto</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Método</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Referencia</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-[#111111] uppercase tracking-wider">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const employee = employees.find(emp => emp.id === payment.employee_id);
                        return (
                          <tr key={payment.id} className="border-b border-[#C7C7C7] hover:bg-[#F9F9F9]">
                            <td className="py-3 px-4 text-sm font-medium text-[#111111]">
                              {employee?.name || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                              {new Date(payment.payment_date).toLocaleDateString('es-AR')}
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-[#111111]">
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                              {payment.payment_method || '-'}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                              {payment.reference || '-'}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#C7C7C7]">
                              {payment.hours_worked ? `${payment.hours_worked.toFixed(1)}h` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Rendimiento */}
          {activeTab === 'performance' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-base font-bold text-[#111111] mb-2">RENDIMIENTO DEL PERSONAL</h3>
                <p className="text-xs text-[#C7C7C7]">Métricas y estadísticas de cada empleado</p>
              </div>

              {activeEmployees.length === 0 ? (
                <div className="bg-white border border-[#C7C7C7] rounded-sm p-8 text-center">
                  <p className="text-sm text-[#C7C7C7] font-medium">No hay empleados activos</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeEmployees.map((emp) => {
                    const employeeClocks = timeClocks.filter(tc => tc.employee_id === emp.id && tc.clock_out);
                    const totalHours = employeeClocks.reduce((sum, tc) => sum + (tc.hours_worked || 0), 0);
                    const employeePayments = payments.filter(p => p.employee_id === emp.id);
                    const totalPaid = employeePayments.reduce((sum, p) => sum + p.amount, 0);
                    
                    return (
                      <div key={emp.id} className="bg-white border border-[#C7C7C7] rounded-sm shadow-sm p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="font-bold text-base text-[#111111]">{emp.name}</h4>
                            <div className="text-xs text-[#C7C7C7] mt-1">{getRoleLabel(emp.role)}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-3 bg-[#F9F9F9] rounded-sm border border-[#C7C7C7]">
                            <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-1">Horas Totales</div>
                            <div className="text-lg font-bold text-[#111111]">{totalHours.toFixed(1)}h</div>
                          </div>
                          <div className="p-3 bg-[#F9F9F9] rounded-sm border border-[#C7C7C7]">
                            <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-1">Días Trabajados</div>
                            <div className="text-lg font-bold text-[#111111]">{employeeClocks.length}</div>
                          </div>
                          <div className="p-3 bg-[#F9F9F9] rounded-sm border border-[#C7C7C7]">
                            <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-1">Total Pagado</div>
                            <div className="text-lg font-bold text-[#111111]">{formatCurrency(totalPaid)}</div>
                          </div>
                          <div className="p-3 bg-[#F9F9F9] rounded-sm border border-[#C7C7C7]">
                            <div className="text-xs text-[#C7C7C7] uppercase tracking-wider mb-1">Promedio/Hora</div>
                            <div className="text-lg font-bold text-[#111111]">
                              {totalHours > 0 ? formatCurrency(totalPaid / totalHours) : '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Agregar/Editar Empleado */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-2xl border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                {editingEmployee ? 'Editar Empleado' : 'Agregar Empleado'}
              </h3>
              <button
                onClick={() => {
                  setShowEmployeeModal(false);
                  setEditingEmployee(null);
                  setEmployeeForm({
                    name: '',
                    role: 'cocina',
                    hourly_rate: 0,
                    daily_rate: 0,
                    delivery_rate: 0,
                    base_salary: 0,
                    is_active: true
                  });
                }}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEmployeeSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Nombre Completo</label>
                  <input
                    type="text"
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Rol</label>
                  <select
                    value={employeeForm.role}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value as Employee['role'] })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  >
                    <option value="cocina">👨‍🍳 Cocina</option>
                    <option value="caja">💳 Caja</option>
                    <option value="limpieza">🧹 Limpieza</option>
                    <option value="administracion">📋 Administración</option>
                    <option value="otro">👤 Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Pago por Hora ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={employeeForm.hourly_rate || ''}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Pago por Día ($) - Opcional</label>
                  <input
                    type="number"
                    step="0.01"
                    value={employeeForm.daily_rate || ''}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, daily_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Pago por Entrega ($) - Opcional</label>
                  <input
                    type="number"
                    step="0.01"
                    value={employeeForm.delivery_rate || ''}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, delivery_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Sueldo Base Mensual ($) - Opcional</label>
                  <input
                    type="number"
                    step="0.01"
                    value={employeeForm.base_salary || ''}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, base_salary: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={employeeForm.is_active}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, is_active: e.target.checked })}
                      className="w-4 h-4 border-[#C7C7C7] rounded focus:ring-[#FFC300]"
                    />
                    <span className="text-xs text-[#111111] font-medium">Empleado activo</span>
                  </label>
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
                <button
                  type="button"
                  onClick={() => {
                    setShowEmployeeModal(false);
                    setEditingEmployee(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
                >
                  {editingEmployee ? 'Actualizar' : 'Crear'} Empleado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pago */}
      {showPaymentModal && selectedEmployeeForPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm shadow-xl p-8 w-full max-w-lg border border-[#FFC300]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#111111]">
                Registrar Pago - {selectedEmployeeForPayment.name}
              </h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedEmployeeForPayment(null);
                }}
                className="text-[#C7C7C7] hover:text-[#111111] text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Fecha de Pago</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Método</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="deposito">Depósito</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Periodo Desde (opcional)</label>
                  <input
                    type="date"
                    value={paymentForm.period_start}
                    onChange={(e) => setPaymentForm({ ...paymentForm, period_start: e.target.value })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Periodo Hasta (opcional)</label>
                  <input
                    type="date"
                    value={paymentForm.period_end}
                    onChange={(e) => setPaymentForm({ ...paymentForm, period_end: e.target.value })}
                    className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#C7C7C7] font-medium mb-1 uppercase tracking-wider">Referencia (opcional)</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="Ej: Nro. de transferencia, comprobante, etc."
                  className="w-full px-4 py-2 border border-[#C7C7C7] rounded-sm focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] text-sm text-[#111111]"
                />
              </div>

              <div className="flex space-x-3 pt-4 border-t border-[#C7C7C7]">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedEmployeeForPayment(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white hover:bg-[#F9F9F9] text-[#111111] font-medium rounded-sm transition-all border border-[#C7C7C7]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium rounded-sm transition-all border border-[#111111]"
                >
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

