
import { useState, useEffect } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

export default function ErrorBoundary({ children, fallback: Fallback }: ErrorBoundaryProps) {
  const [state, setState] = useState<ErrorBoundaryState>({ hasError: false });

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      setState({ hasError: true, error: new Error(error.message) });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      setState({ hasError: true, error: new Error(event.reason) });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const resetError = () => {
    setState({ hasError: false, error: undefined });
  };

  if (state.hasError) {
    if (Fallback) {
      return <Fallback error={state.error} resetError={resetError} />;
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-error-warning-line text-red-600 text-2xl"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">¡Ups! Algo salió mal</h2>
          <p className="text-gray-600 mb-6">
            Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
          </p>
          <div className="space-y-3">
            <button
              onClick={resetError}
              className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Intentar de nuevo
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Recargar página
            </button>
          </div>
          {state.error && (
            <details className="mt-4 text-left">
              <summary className="text-sm text-gray-500 cursor-pointer">Detalles del error</summary>
              <pre className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded overflow-auto">
                {state.error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
