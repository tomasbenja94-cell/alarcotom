import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';

interface OrderTracking {
  id: string;
  orderNumber: string;
  status: string;
  deliveryStatus?: string; // available, accepted, picked_up, in_multi_route, delivering, delivered
  customerName: string;
  customerAddress: string;
  customerLat: number | null;
  customerLng: number | null;
  store: {
    name: string;
    address: string;
    lat?: number;
    lng?: number;
  };
  deliveryPerson?: {
    name: string;
    phone: string;
    currentLat?: number;
    currentLng?: number;
  };
  estimatedTime?: string;
  items: Array<{ name: string; quantity: number }>;
  total: number;
  createdAt: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  multiRouteOrder?: number;
  multiRouteTotalOrders?: number;
}

const STATUS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  pending: { label: 'Pendiente', icon: 'ri-time-line', color: 'text-yellow-600' },
  confirmed: { label: 'Confirmado', icon: 'ri-check-line', color: 'text-blue-600' },
  preparing: { label: 'Preparando', icon: 'ri-restaurant-line', color: 'text-orange-600' },
  ready: { label: 'Listo para envío', icon: 'ri-checkbox-circle-line', color: 'text-green-600' },
  assigned: { label: 'Repartidor asignado', icon: 'ri-user-line', color: 'text-purple-600' },
  picked_up: { label: 'Retirado del local', icon: 'ri-store-3-line', color: 'text-indigo-600' },
  in_transit: { label: 'En camino', icon: 'ri-e-bike-line', color: 'text-blue-600' },
  delivered: { label: 'Entregado', icon: 'ri-check-double-line', color: 'text-green-600' },
  cancelled: { label: 'Cancelado', icon: 'ri-close-circle-line', color: 'text-red-600' }
};

// Estados detallados del delivery
const DELIVERY_STATUS_LABELS: Record<string, { label: string; description: string; icon: string; color: string }> = {
  available: { label: 'Esperando repartidor', description: 'Tu pedido está listo y buscando repartidor disponible', icon: 'ri-search-line', color: 'text-yellow-600' },
  accepted: { label: 'Repartidor en camino al local', description: 'El repartidor aceptó tu pedido y va hacia el local', icon: 'ri-user-follow-line', color: 'text-purple-600' },
  picked_up: { label: 'Retirado del local', description: 'El repartidor ya tiene tu pedido', icon: 'ri-store-3-line', color: 'text-indigo-600' },
  in_multi_route: { label: 'En ruta de entrega', description: 'El repartidor está realizando entregas', icon: 'ri-route-line', color: 'text-blue-500' },
  delivering: { label: 'Próximo destino', description: 'El repartidor se dirige hacia vos', icon: 'ri-e-bike-2-line', color: 'text-blue-600' },
  delivered: { label: 'Entregado', description: '¡Tu pedido fue entregado!', icon: 'ri-check-double-line', color: 'text-green-600' }
};

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  
  const [order, setOrder] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos del pedido
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(`${API_URL}/orders/track/${token}`);
        if (!response.ok) {
          throw new Error('Pedido no encontrado');
        }
        const data = await response.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchOrder();
      // Polling cada 10 segundos para actualizar ubicación
      const interval = setInterval(fetchOrder, 10000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || !order || mapInstanceRef.current) return;

    // Coordenadas por defecto (Buenos Aires)
    const defaultLat = order.customerLat || -34.6037;
    const defaultLng = order.customerLng || -58.3816;

    // Crear mapa
    const map = L.map(mapRef.current).setView([defaultLat, defaultLng], 15);
    mapInstanceRef.current = map;

    // Agregar tiles de OpenStreetMap (GRATIS)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Icono personalizado para el cliente
    const customerIcon = L.divIcon({
      html: '<div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg"><i class="ri-home-4-fill"></i></div>',
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    // Icono personalizado para el local
    const storeIcon = L.divIcon({
      html: '<div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-lg"><i class="ri-store-2-fill"></i></div>',
      className: 'custom-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    // Icono personalizado para el repartidor
    const deliveryIcon = L.divIcon({
      html: '<div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg animate-pulse"><i class="ri-e-bike-2-fill text-lg"></i></div>',
      className: 'custom-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 40]
    });

    // Marcador del cliente
    if (order.customerLat && order.customerLng) {
      L.marker([order.customerLat, order.customerLng], { icon: customerIcon })
        .addTo(map)
        .bindPopup(`<b>Tu ubicación</b><br>${order.customerAddress || 'Dirección de entrega'}`);
    }

    // Marcador del local
    if (order.store?.lat && order.store?.lng) {
      L.marker([order.store.lat, order.store.lng], { icon: storeIcon })
        .addTo(map)
        .bindPopup(`<b>${order.store.name}</b><br>${order.store.address || ''}`);
    }

    // Marcador del repartidor (si está en camino)
    if (order.deliveryPerson?.currentLat && order.deliveryPerson?.currentLng) {
      deliveryMarkerRef.current = L.marker(
        [order.deliveryPerson.currentLat, order.deliveryPerson.currentLng],
        { icon: deliveryIcon }
      )
        .addTo(map)
        .bindPopup(`<b>${order.deliveryPerson.name}</b><br>Tu repartidor`);
    }

    // Ajustar vista para mostrar todos los marcadores
    const bounds = L.latLngBounds([]);
    if (order.customerLat && order.customerLng) {
      bounds.extend([order.customerLat, order.customerLng]);
    }
    if (order.store?.lat && order.store?.lng) {
      bounds.extend([order.store.lat, order.store.lng]);
    }
    if (order.deliveryPerson?.currentLat && order.deliveryPerson?.currentLng) {
      bounds.extend([order.deliveryPerson.currentLat, order.deliveryPerson.currentLng]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [order]);

  // Actualizar posición del repartidor
  useEffect(() => {
    if (!mapInstanceRef.current || !order?.deliveryPerson?.currentLat) return;

    const deliveryIcon = L.divIcon({
      html: '<div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg animate-pulse"><i class="ri-e-bike-2-fill text-lg"></i></div>',
      className: 'custom-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 40]
    });

    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.setLatLng([
        order.deliveryPerson.currentLat,
        order.deliveryPerson.currentLng!
      ]);
    } else {
      deliveryMarkerRef.current = L.marker(
        [order.deliveryPerson.currentLat, order.deliveryPerson.currentLng!],
        { icon: deliveryIcon }
      )
        .addTo(mapInstanceRef.current)
        .bindPopup(`<b>${order.deliveryPerson.name}</b><br>Tu repartidor`);
    }
  }, [order?.deliveryPerson?.currentLat, order?.deliveryPerson?.currentLng]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando seguimiento...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <i className="ri-error-warning-line text-5xl text-red-500 mb-4"></i>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Pedido no encontrado</h2>
          <p className="text-gray-600 mb-4">{error || 'El enlace de seguimiento no es válido'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
  const deliveryInfo = order.deliveryStatus ? DELIVERY_STATUS_LABELS[order.deliveryStatus] : null;
  const isInTransit = order.status === 'in_transit' || ['picked_up', 'in_multi_route', 'delivering'].includes(order.deliveryStatus || '');
  const isMultiRoute = order.deliveryStatus === 'in_multi_route';
  const isNextDelivery = order.deliveryStatus === 'delivering';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            >
              <i className="ri-arrow-left-line text-gray-600"></i>
            </button>
            <div className="text-center">
              <h1 className="font-bold text-gray-800">Pedido #{order.orderNumber}</h1>
              <p className="text-xs text-gray-500">{order.store.name}</p>
            </div>
            <div className="w-10"></div>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div 
        ref={mapRef} 
        className="w-full h-[40vh] z-10"
        style={{ minHeight: '250px' }}
      />

      {/* Info del pedido */}
      <div className="bg-white rounded-t-3xl -mt-6 relative z-20 min-h-[50vh]">
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto my-3"></div>

        {/* Estado actual */}
        <div className="px-4 pb-4">
          <div className={`flex items-center gap-3 p-4 rounded-2xl ${
            order.status === 'delivered' ? 'bg-green-50' :
            order.status === 'cancelled' ? 'bg-red-50' : 
            isNextDelivery ? 'bg-gradient-to-r from-blue-50 to-indigo-50' :
            isMultiRoute ? 'bg-purple-50' : 'bg-blue-50'
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              order.status === 'delivered' ? 'bg-green-500' :
              order.status === 'cancelled' ? 'bg-red-500' : 
              isNextDelivery ? 'bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse' :
              isMultiRoute ? 'bg-purple-500' : 'bg-blue-500'
            } text-white`}>
              <i className={`${deliveryInfo?.icon || statusInfo.icon} text-xl`}></i>
            </div>
            <div className="flex-1">
              <p className={`font-bold ${deliveryInfo?.color || statusInfo.color}`}>
                {deliveryInfo?.label || statusInfo.label}
              </p>
              {deliveryInfo?.description && (
                <p className="text-sm text-gray-600">{deliveryInfo.description}</p>
              )}
              {order.estimatedTime && isInTransit && (
                <p className="text-xs text-gray-500 mt-1">Tiempo estimado: ~{order.estimatedTime}</p>
              )}
            </div>
          </div>
          
          {/* Info adicional de ruta múltiple */}
          {isMultiRoute && order.multiRouteOrder !== undefined && order.multiRouteTotalOrders && (
            <div className="mt-2 bg-purple-50 rounded-xl p-3 border border-purple-100">
              <div className="flex items-center gap-2">
                <i className="ri-route-line text-purple-500"></i>
                <span className="text-sm text-purple-700">
                  Posición {order.multiRouteOrder + 1} de {order.multiRouteTotalOrders} en la ruta
                </span>
              </div>
              <p className="text-xs text-purple-600 mt-1">
                El repartidor está realizando entregas. Te avisamos cuando se dirija hacia vos.
              </p>
            </div>
          )}
          
          {isNextDelivery && (
            <div className="mt-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200">
              <div className="flex items-center gap-2">
                <i className="ri-e-bike-2-line text-blue-600 text-lg animate-bounce"></i>
                <span className="text-sm font-medium text-blue-700">
                  ¡Sos el próximo destino!
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                El repartidor se dirige hacia tu ubicación.
              </p>
            </div>
          )}
        </div>

        {/* Timeline de estados */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between">
            {['confirmed', 'preparing', 'in_transit', 'delivered'].map((status, index) => {
              const statusIndex = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit', 'delivered'].indexOf(order.status);
              const thisIndex = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit', 'delivered'].indexOf(status);
              const isCompleted = thisIndex <= statusIndex;
              const isCurrent = status === order.status;

              return (
                <div key={status} className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                  } ${isCurrent ? 'ring-4 ring-green-200' : ''}`}>
                    {isCompleted ? (
                      <i className="ri-check-line text-sm"></i>
                    ) : (
                      <span className="text-xs">{index + 1}</span>
                    )}
                  </div>
                  <p className={`text-[10px] mt-1 text-center ${isCompleted ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                    {STATUS_LABELS[status]?.label.split(' ')[0]}
                  </p>
                  {index < 3 && (
                    <div className={`absolute h-0.5 w-full ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} 
                         style={{ top: '50%', left: '50%', transform: 'translateY(-50%)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Repartidor */}
        {order.deliveryPerson && isInTransit && (
          <div className="px-4 pb-4">
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs text-gray-500 mb-2">Tu repartidor</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white">
                    <i className="ri-user-line text-xl"></i>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{order.deliveryPerson.name}</p>
                    <p className="text-sm text-gray-500">En camino hacia vos</p>
                  </div>
                </div>
                {order.deliveryPerson.phone && (
                  <a
                    href={`tel:${order.deliveryPerson.phone}`}
                    className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white"
                  >
                    <i className="ri-phone-line"></i>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resumen del pedido */}
        <div className="px-4 pb-6">
          <h3 className="font-bold text-gray-800 mb-3">Tu pedido</h3>
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.quantity}x {item.name}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>${order.total.toLocaleString('es-AR')}</span>
            </div>
          </div>
        </div>

        {/* Dirección de entrega */}
        <div className="px-4 pb-8">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="ri-map-pin-line text-blue-600"></i>
            </div>
            <div>
              <p className="text-xs text-gray-500">Entregar en</p>
              <p className="font-medium text-gray-800">{order.customerAddress}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CSS para los marcadores personalizados */}
      <style>{`
        .custom-marker {
          background: transparent;
          border: none;
        }
        .custom-marker > div {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
