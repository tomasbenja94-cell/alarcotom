import { useState, useEffect } from 'react';

interface BugReport {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  component: string;
  timestamp: Date;
  resolved: boolean;
}

export default function BugDetection() {
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<{
    type: string;
    resolved: boolean | null;
  }>({ type: 'all', resolved: false });

  useEffect(() => {
    loadBugs();
    // Detectar errores en tiempo real
    const errorHandler = (event: ErrorEvent) => {
      const bug: BugReport = {
        id: `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        message: event.message || 'Error desconocido',
        component: event.filename || 'Unknown',
        timestamp: new Date(),
        resolved: false,
      };
      addBug(bug);
    };

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const bug: BugReport = {
        id: `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        message: event.reason?.message || 'Promise rejection',
        component: 'Promise',
        timestamp: new Date(),
        resolved: false,
      };
      addBug(bug);
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }, []);

  const loadBugs = async () => {
    try {
      setLoading(true);
      // Cargar bugs del localStorage (por ahora)
      const savedBugs = localStorage.getItem('admin_bugs');
      if (savedBugs) {
        const parsed = JSON.parse(savedBugs).map((b: any) => ({
          ...b,
          timestamp: new Date(b.timestamp),
        }));
        setBugs(parsed);
      }
    } catch (error) {
      console.error('Error loading bugs:', error);
    } finally {
      setLoading(false);
    }
  };

  const addBug = (bug: BugReport) => {
    setBugs((prev) => {
      const updated = [bug, ...prev].slice(0, 100); // Mantener solo los últimos 100
      localStorage.setItem('admin_bugs', JSON.stringify(updated));
      return updated;
    });
  };

  const resolveBug = (id: string) => {
    setBugs((prev) => {
      const updated = prev.map((b) =>
        b.id === id ? { ...b, resolved: true } : b
      );
      localStorage.setItem('admin_bugs', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteBug = (id: string) => {
    setBugs((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      localStorage.setItem('admin_bugs', JSON.stringify(updated));
      return updated;
    });
  };

  const filteredBugs = bugs.filter((bug) => {
    if (activeFilters.type !== 'all' && bug.type !== activeFilters.type) {
      return false;
    }
    if (activeFilters.resolved !== null && bug.resolved !== activeFilters.resolved) {
      return false;
    }
    return true;
  });

  const stats = {
    total: bugs.length,
    errors: bugs.filter((b) => b.type === 'error').length,
    warnings: bugs.filter((b) => b.type === 'warning').length,
    unresolved: bugs.filter((b) => !b.resolved).length,
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
        <h2 className="text-xl font-bold text-slate-800">Detección de Bugs y Errores</h2>
        <button
          onClick={() => {
            setBugs([]);
            localStorage.removeItem('admin_bugs');
          }}
          className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Limpiar todo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-500 mb-1">Errores</p>
          <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-500 mb-1">Advertencias</p>
          <p className="text-2xl font-bold text-amber-600">{stats.warnings}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 mb-1">Sin resolver</p>
          <p className="text-2xl font-bold text-blue-600">{stats.unresolved}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={activeFilters.type}
          onChange={(e) => setActiveFilters({ ...activeFilters, type: e.target.value })}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">Todos los tipos</option>
          <option value="error">Errores</option>
          <option value="warning">Advertencias</option>
          <option value="info">Info</option>
        </select>
        <select
          value={activeFilters.resolved === null ? 'all' : activeFilters.resolved ? 'resolved' : 'unresolved'}
          onChange={(e) => {
            const value = e.target.value;
            setActiveFilters({
              ...activeFilters,
              resolved: value === 'all' ? null : value === 'resolved',
            });
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">Todos</option>
          <option value="unresolved">Sin resolver</option>
          <option value="resolved">Resueltos</option>
        </select>
      </div>

      {/* Lista de bugs */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredBugs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-bug-line text-4xl mb-3 block"></i>
            <p>No se encontraron bugs o errores</p>
          </div>
        ) : (
          filteredBugs.map((bug) => (
            <div
              key={bug.id}
              className={`p-4 rounded-xl border-2 ${
                bug.resolved
                  ? 'bg-slate-50 border-slate-200 opacity-60'
                  : bug.type === 'error'
                  ? 'bg-red-50 border-red-200'
                  : bug.type === 'warning'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        bug.type === 'error'
                          ? 'bg-red-500 text-white'
                          : bug.type === 'warning'
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      {bug.type.toUpperCase()}
                    </span>
                    {bug.resolved && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        RESUELTO
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {bug.timestamp.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <p className="font-medium text-slate-800 mb-1">{bug.message}</p>
                  <p className="text-xs text-slate-500">Componente: {bug.component}</p>
                </div>
                <div className="flex gap-2">
                  {!bug.resolved && (
                    <button
                      onClick={() => resolveBug(bug.id)}
                      className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Resolver
                    </button>
                  )}
                  <button
                    onClick={() => deleteBug(bug.id)}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

