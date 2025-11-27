import { useState, useEffect } from 'react';

interface Review {
  id: string;
  customer_name: string;
  rating: number;
  comment: string;
  order_id: string;
  created_at: string;
  response?: string;
  responded_at?: string;
}

export default function ReviewsManagement() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'responded'>('all');
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState('');

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      const storeId = localStorage.getItem('adminStoreId');
      
      const response = await fetch(`${API_URL}/reviews?storeId=${storeId}`, {
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReviews(data || []);
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (reviewId: string) => {
    if (!responseText.trim()) {
      alert('Por favor escribe una respuesta');
      return;
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`${API_URL}/reviews/${reviewId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ response: responseText })
      });
      
      if (response.ok) {
        await loadReviews();
        setSelectedReview(null);
        setResponseText('');
      }
    } catch (error) {
      console.error('Error responding to review:', error);
      alert('Error al responder la reseña');
    }
  };

  const filteredReviews = reviews.filter((review) => {
    if (filter === 'pending') return !review.response;
    if (filter === 'responded') return !!review.response;
    return true;
  });

  const stats = {
    total: reviews.length,
    average: reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0',
    pending: reviews.filter(r => !r.response).length,
    ratings: {
      5: reviews.filter(r => r.rating === 5).length,
      4: reviews.filter(r => r.rating === 4).length,
      3: reviews.filter(r => r.rating === 3).length,
      2: reviews.filter(r => r.rating === 2).length,
      1: reviews.filter(r => r.rating === 1).length,
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
        <h2 className="text-xl font-bold text-slate-800">Gestión de Reseñas</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <p className="text-xs text-amber-600 mb-1">Total Reseñas</p>
          <p className="text-2xl font-bold text-amber-700">{stats.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Promedio</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-blue-700">{stats.average}</p>
            <i className="ri-star-fill text-blue-500"></i>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-600 mb-1">Sin Responder</p>
          <p className="text-2xl font-bold text-red-700">{stats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 mb-1">5 Estrellas</p>
          <p className="text-2xl font-bold text-green-700">{stats.ratings[5]}</p>
        </div>
      </div>

      {/* Distribución de Ratings */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <h3 className="font-semibold mb-3">Distribución de Calificaciones</h3>
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = stats.ratings[rating as keyof typeof stats.ratings];
          const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
          
          return (
            <div key={rating} className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1 w-20">
                <span className="text-sm font-medium">{rating}</span>
                <i className="ri-star-fill text-amber-400"></i>
              </div>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    rating >= 4 ? 'bg-green-500' : rating >= 3 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              <span className="text-sm text-slate-600 w-12 text-right">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'Todas' },
          { id: 'pending', label: 'Sin Responder' },
          { id: 'responded', label: 'Respondidas' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === f.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de Reseñas */}
      <div className="space-y-3">
        {filteredReviews.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl">
            <i className="ri-star-line text-4xl text-slate-400 mb-3 block"></i>
            <p className="text-slate-500">No hay reseñas</p>
          </div>
        ) : (
          filteredReviews.map((review) => (
            <div
              key={review.id}
              className="p-4 rounded-xl border-2 bg-white border-slate-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-bold text-slate-800">{review.customer_name}</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <i
                          key={star}
                          className={`ri-star-${
                            star <= review.rating ? 'fill' : 'line'
                          } text-amber-400`}
                        ></i>
                      ))}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(review.created_at).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mb-2">{review.comment}</p>
                  {review.response && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs font-semibold text-blue-700 mb-1">
                        Respuesta del negocio:
                      </p>
                      <p className="text-sm text-blue-900">{review.response}</p>
                      <p className="text-xs text-blue-600 mt-1">
                        {new Date(review.responded_at!).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                  )}
                </div>
                {!review.response && (
                  <button
                    onClick={() => {
                      setSelectedReview(review);
                      setResponseText('');
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  >
                    Responder
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Respuesta */}
      {selectedReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Responder Reseña</h3>
            <div className="mb-4">
              <p className="font-medium text-slate-800 mb-1">{selectedReview.customer_name}</p>
              <p className="text-sm text-slate-600">{selectedReview.comment}</p>
            </div>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg mb-4"
              rows={4}
              placeholder="Escribe tu respuesta..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedReview(null);
                  setResponseText('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRespond(selectedReview.id)}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600"
              >
                Enviar Respuesta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

