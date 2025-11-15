import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { trackingApi } from '../../lib/api';
import { getRoute, formatDistance, formatDuration } from '../../lib/mapbox';

// Declarar tipos para Mapbox GL
declare global {
  interface Window {
    mapboxgl: any;
  }
}

interface TrackingData {
  order: {
    id: string;
    order_number: string;
    status: string;
    customer_name: string;
    customer_address: string;
    customer_lat?: number;
    customer_lng?: number;
    delivery_code?: string;
    created_at: string;
  };
  driver: {
    id: string;
    name: string;
    last_lat?: number;
    last_lng?: number;
    last_seen_at?: string;
  } | null;
}

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [route, setRoute] = useState<any>(null);
  const [eta, setEta] = useState<{ distance: number; duration: number } | null>(null);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);

  // Cargar datos de tracking
  const loadTrackingData = async () => {
    if (!token) return;
    
    try {
      const data = await trackingApi.getByToken(token);
      setTrackingData(data);
      setError('');
      
      // Si hay driver y ubicación, calcular ruta
      if (data.driver && data.driver.last_lat && data.driver.last_lng && 
          data.order.customer_lat && data.order.customer_lng) {
        const routeData = await getRoute(
          [data.driver.last_lng, data.driver.last_lat],
          [data.order.customer_lng, data.order.customer_lat]
        );
        
        if (routeData) {
          setRoute(routeData.geometry);
          setEta({
            distance: routeData.distance,
            duration: routeData.duration
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar información de tracking');
    } finally {
      setLoading(false);
    }
  };

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainerRef.current || !trackingData) return;

    // Cargar Mapbox GL JS
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.onload = () => {
      const link = document.createElement('link');
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      if (window.mapboxgl) {
        window.mapboxgl.accessToken = "pk.eyJ1IjoiZWxidWVubWVudSIsImEiOiJjbWdqMnRwZWMwZ2FvMmtuMjFvMGR1NXNiIn0.7ACTVWHp6JJ6l5kY5O3GzQ";
        
        // Calcular centro del mapa
        let center: [number, number] = [-58.3816, -34.6037]; // Buenos Aires por defecto
        let zoom = 12;
        
        if (trackingData.driver?.last_lat && trackingData.driver?.last_lng) {
          center = [trackingData.driver.last_lng, trackingData.driver.last_lat];
        } else if (trackingData.order.customer_lng && trackingData.order.customer_lat) {
          center = [trackingData.order.customer_lng, trackingData.order.customer_lat];
        }

        // Crear mapa
        const map = new window.mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: center,
          zoom: zoom
        });

        mapRef.current = map;

        map.on('load', () => {
          // Agregar marker del cliente
          if (trackingData.order.customer_lat && trackingData.order.customer_lng) {
            new window.mapboxgl.Marker({ color: '#10b981' })
              .setLngLat([trackingData.order.customer_lng, trackingData.order.customer_lat])
              .setPopup(new window.mapboxgl.Popup().setHTML(`
                <div class="p-2">
                  <p class="font-semibold">📍 Destino</p>
                  <p class="text-sm">${trackingData.order.customer_address}</p>
                </div>
              `))
              .addTo(map);
          }

          // Agregar marker del repartidor
          if (trackingData.driver?.last_lat && trackingData.driver?.last_lng) {
            const driverMarker = new window.mapboxgl.Marker({ color: '#3b82f6' })
              .setLngLat([trackingData.driver.last_lng, trackingData.driver.last_lat])
              .setPopup(new window.mapboxgl.Popup().setHTML(`
                <div class="p-2">
                  <p class="font-semibold">🛵 Repartidor</p>
                  <p class="text-sm">${trackingData.driver.name}</p>
                </div>
              `))
              .addTo(map);
            
            driverMarkerRef.current = driverMarker;
          }

          // Agregar ruta si existe
          if (route) {
            if (map.getSource('route')) {
              (map.getSource('route') as any).setData({
                type: 'Feature',
                geometry: route
              });
            } else {
              map.addSource('route', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: route
                }
              });

              map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': '#3b82f6',
                  'line-width': 4
                }
              });
            }
          }

          // Ajustar vista para mostrar ambos puntos
          if (trackingData.driver?.last_lat && trackingData.driver?.last_lng && 
              trackingData.order.customer_lat && trackingData.order.customer_lng) {
            const bounds = new window.mapboxgl.LngLatBounds();
            bounds.extend([trackingData.driver.last_lng, trackingData.driver.last_lat]);
            bounds.extend([trackingData.order.customer_lng, trackingData.order.customer_lat]);
            map.fitBounds(bounds, { padding: 50 });
          }
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [trackingData, route]);

  // Actualizar posición del repartidor
  useEffect(() => {
    if (!trackingData || !mapRef.current || !driverMarkerRef.current) return;

    if (trackingData.driver?.last_lat && trackingData.driver?.last_lng) {
      const newPosition: [number, number] = [
        trackingData.driver.last_lng,
        trackingData.driver.last_lat
      ];

      // Animar marker
      driverMarkerRef.current.setLngLat(newPosition);

      // Actualizar ruta si existe
      if (route && mapRef.current.getSource('route')) {
        const routeData = {
          type: 'Feature',
          geometry: route
        };
        (mapRef.current.getSource('route') as any).setData(routeData);
      }
    }
  }, [trackingData, route]);

  // Cargar datos iniciales y polling
  useEffect(() => {
    loadTrackingData();
    const interval = setInterval(loadTrackingData, 5000); // Cada 5 segundos
    return () => clearInterval(interval);
  }, [token]);

  // Obtener texto del estado
  const getStatusText = () => {
    if (!trackingData) return '';
    
    switch (trackingData.order.status) {
      case 'preparing':
        return 'Preparando';
      case 'assigned':
        return 'Asignado';
      case 'in_transit':
        return 'En camino';
      case 'delivered':
        return 'Entregado';
      default:
        return trackingData.order.status;
    }
  };

  // Obtener emoji del estado
  const getStatusEmoji = () => {
    if (!trackingData) return '📦';
    
    switch (trackingData.order.status) {
      case 'preparing':
        return '👨‍🍳';
      case 'assigned':
        return '🛵';
      case 'in_transit':
        return '🚚';
      case 'delivered':
        return '✅';
      default:
        return '📦';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando información de tu pedido...</p>
        </div>
      </div>
    );
  }

  if (error || !trackingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600">
            {error || 'No se pudo encontrar información del pedido'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mapa */}
      <div ref={mapContainerRef} className="w-full h-96 bg-gray-200" />

      {/* Información del pedido */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Estado */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-3xl">{getStatusEmoji()}</span>
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                Pedido {trackingData.order.order_number}
              </h2>
              <p className="text-sm text-gray-600">Estado: {getStatusText()}</p>
            </div>
          </div>

          {trackingData.order.status === 'delivered' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold">
                ✅ Pedido entregado. ¡Buen provecho!
              </p>
            </div>
          ) : (
            <>
              {/* ETA y distancia */}
              {eta && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Tiempo estimado</p>
                    <p className="text-xl font-bold text-blue-700">
                      {formatDuration(eta.duration)}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Distancia</p>
                    <p className="text-xl font-bold text-green-700">
                      {formatDistance(eta.distance)}
                    </p>
                  </div>
                </div>
              )}

              {/* Información del repartidor */}
              {trackingData.driver && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-600 mb-1">Repartidor</p>
                  <p className="font-semibold text-gray-800">
                    🛵 {trackingData.driver.name}
                  </p>
                  {trackingData.driver.last_seen_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Última actualización: {new Date(trackingData.driver.last_seen_at).toLocaleTimeString('es-AR')}
                    </p>
                  )}
                </div>
              )}

              {/* Código de entrega */}
              {trackingData.order.delivery_code && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-600 mb-1">Código de entrega</p>
                  <p className="font-mono text-2xl font-bold text-blue-600">
                    {trackingData.order.delivery_code}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Tené este código listo para dárselo al repartidor
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Información del pedido */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-3">Detalles del pedido</h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-600">Cliente:</span>{' '}
              <span className="font-medium">{trackingData.order.customer_name}</span>
            </p>
            <p>
              <span className="text-gray-600">Dirección:</span>{' '}
              <span className="font-medium">{trackingData.order.customer_address}</span>
            </p>
            <p>
              <span className="text-gray-600">Fecha:</span>{' '}
              <span className="font-medium">
                {new Date(trackingData.order.created_at).toLocaleString('es-AR')}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

