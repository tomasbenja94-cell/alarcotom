import { useState, useEffect } from 'react';

interface ChecklistTask {
  id?: string;
  title: string;
  description?: string;
  emoji?: string;
  isCompleted: boolean;
  completedAt?: string;
  assignedTo?: string;
  priority: number; // 0 = normal, 1 = alta, 2 = urgente
}

const defaultTasks: ChecklistTask[] = [
  { title: 'Comprar papas', emoji: '🥔', isCompleted: false, priority: 0 },
  { title: 'Cambiar aceite de la freidora', emoji: '🧴', isCompleted: false, priority: 1 },
  { title: 'Reponer envases', emoji: '📦', isCompleted: false, priority: 0 },
  { title: 'Llamar al proveedor', emoji: '📞', isCompleted: false, priority: 0 },
];

export default function DailyChecklist() {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [newTask, setNewTask] = useState<ChecklistTask>({ title: '', isCompleted: false, priority: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    loadTodayTasks();
  }, []);

  const loadTodayTasks = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/checklist/today`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      } else {
        // Si no hay tareas, cargar las por defecto
        setTasks(defaultTasks);
      }
    } catch (error) {
      console.error('Error cargando checklist:', error);
      setTasks(defaultTasks);
    } finally {
      setIsLoading(false);
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/checklist/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTask)
      });

      if (response.ok) {
        const data = await response.json();
        setTasks([...tasks, data.task]);
        setNewTask({ title: '', isCompleted: false, priority: 0 });
      } else {
        // Fallback: agregar localmente
        setTasks([...tasks, { ...newTask, id: Date.now().toString() }]);
        setNewTask({ title: '', isCompleted: false, priority: 0 });
      }
    } catch (error) {
      // Fallback: agregar localmente
      setTasks([...tasks, { ...newTask, id: Date.now().toString() }]);
      setNewTask({ title: '', isCompleted: false, priority: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/checklist/task/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isCompleted: !task.isCompleted
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(tasks.map(t => t.id === taskId ? data.task : t));
      } else {
        // Fallback: actualizar localmente
        setTasks(tasks.map(t => 
          t.id === taskId 
            ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date().toISOString() : undefined }
            : t
        ));
      }
    } catch (error) {
      // Fallback: actualizar localmente
      setTasks(tasks.map(t => 
        t.id === taskId 
          ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date().toISOString() : undefined }
          : t
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    setIsLoading(true);
    try {
      await fetch(`${API_URL}/api/system/checklist/task/${taskId}`, {
        method: 'DELETE'
      });
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (error) {
      setTasks(tasks.filter(t => t.id !== taskId));
    } finally {
      setIsLoading(false);
    }
  };

  const completedCount = tasks.filter(t => t.isCompleted).length;
  const totalCount = tasks.length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 text-xs font-medium bg-white text-[#111111] border border-[#C7C7C7] hover:bg-[#F9F9F9] rounded transition-all flex items-center space-x-2"
        title="Checklist de tareas diarias"
      >
        <span>📝</span>
        <span>Checklist</span>
        {totalCount > 0 && (
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            completedCount === totalCount 
              ? 'bg-green-100 text-green-700' 
              : 'bg-[#FFC300] text-[#111111]'
          }`}>
            {completedCount}/{totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-[#FFC300] shadow-lg rounded-sm z-50 max-h-[600px] overflow-y-auto">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#C7C7C7]">
              <h3 className="text-lg font-bold text-[#111111]">📝 Checklist Diario</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[#C7C7C7] hover:text-[#111111] transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Progreso */}
            {totalCount > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-[#111111] mb-2">
                  <span>Progreso del día</span>
                  <span className="font-bold">{completedCount}/{totalCount} completadas</span>
                </div>
                <div className="w-full bg-[#C7C7C7] rounded-full h-2">
                  <div 
                    className="bg-[#FFC300] h-2 rounded-full transition-all"
                    style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Lista de tareas */}
            <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
              {tasks.length === 0 ? (
                <p className="text-sm text-[#C7C7C7] text-center py-4">No hay tareas para hoy</p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id || Math.random()}
                    className={`flex items-start space-x-3 p-3 border rounded-sm ${
                      task.isCompleted 
                        ? 'border-[#C7C7C7] bg-[#F9F9F9]' 
                        : 'border-[#FFC300] bg-white'
                    }`}
                  >
                    <button
                      onClick={() => task.id && toggleTask(task.id)}
                      className={`mt-0.5 w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
                        task.isCompleted
                          ? 'bg-[#111111] border-[#111111]'
                          : 'border-[#C7C7C7] hover:border-[#111111]'
                      }`}
                    >
                      {task.isCompleted && <span className="text-white text-xs">✔</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        {task.emoji && <span className="text-base">{task.emoji}</span>}
                        <p className={`text-sm font-medium ${task.isCompleted ? 'line-through text-[#C7C7C7]' : 'text-[#111111]'}`}>
                          {task.title}
                        </p>
                        {task.priority > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            task.priority === 2 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {task.priority === 2 ? 'Urgente' : 'Alta'}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-[#C7C7C7] mt-1">{task.description}</p>
                      )}
                      {task.assignedTo && (
                        <p className="text-xs text-[#C7C7C7] mt-1">👤 {task.assignedTo}</p>
                      )}
                      {task.isCompleted && task.completedAt && (
                        <p className="text-xs text-[#C7C7C7] mt-1">
                          Completada: {new Date(task.completedAt).toLocaleTimeString('es-AR')}
                        </p>
                      )}
                    </div>
                    {task.id && (
                      <button
                        onClick={() => deleteTask(task.id!)}
                        className="text-[#C7C7C7] hover:text-red-600 transition-colors"
                        title="Eliminar tarea"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Formulario para nueva tarea */}
            <div className="border-t border-[#C7C7C7] pt-4">
              <h4 className="text-sm font-bold text-[#111111] mb-3">Agregar tarea</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Emoji (opcional)"
                    value={newTask.emoji || ''}
                    onChange={(e) => setNewTask({ ...newTask, emoji: e.target.value })}
                    className="w-16 px-2 py-1.5 border border-[#C7C7C7] rounded-sm text-sm text-[#111111]"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    placeholder="Título de la tarea"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && addTask()}
                    className="flex-1 px-3 py-1.5 border border-[#C7C7C7] rounded-sm text-sm text-[#111111] focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Responsable (opcional)"
                  value={newTask.assignedTo || ''}
                  onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#C7C7C7] rounded-sm text-sm text-[#111111] focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                />
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-[#C7C7C7] rounded-sm text-sm text-[#111111] focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300]"
                >
                  <option value={0}>Prioridad Normal</option>
                  <option value={1}>Prioridad Alta</option>
                  <option value={2}>Prioridad Urgente</option>
                </select>
                <button
                  onClick={addTask}
                  disabled={!newTask.title.trim() || isLoading}
                  className="w-full bg-[#111111] hover:bg-[#1A1A1A] text-white font-medium py-2 rounded-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Agregar Tarea
                </button>
              </div>
            </div>

            {/* Info footer */}
            <div className="mt-4 pt-4 border-t border-[#C7C7C7]">
              <p className="text-xs text-[#C7C7C7] text-center">
                💡 El checklist se resetea automáticamente a las 00:00
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

