import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { deliveryApi, ordersApi } from '../../lib/api';
import { getRoute, formatDistance, formatDuration, calculateDistance } from '../../lib/mapbox';

// Declarar tipos para Mapbox GL
declare global {
  interface Window {
    mapboxgl: any;
  }
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  balance: number;
  current_order_id?: string;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_address: string;
  customer_lat?: number;
  customer_lng?: number;
  total: number;
  status: string;
  delivery_code?: string;
  items: Array<{
    product_name: string;
    quantity: number;
    subtotal: number;
  }>;
  created_at?: string;
}

// Toast notification component - Estilo premium minimalista
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = 'bg-white';
  const borderColor = type === 'success' ? 'border-[#FFC300]' : type === 'error' ? 'border-red-300' : 'border-[#C7C7C7]';
  const textColor = 'text-[#111111]';
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

  return (
    <div className={`fixed top-4 right-4 ${bgColor} ${textColor} border ${borderColor} px-5 py-4 rounded-lg shadow-lg z-50 flex items-center space-x-3 min-w-[300px] max-w-md`}>
      <span className="text-xl">{icon}</span>
      <p className="font-medium flex-1 text-sm">{message}</p>
      <button onClick={onClose} className="text-[#C7C7C7] hover:text-[#111111] font-bold text-lg">×</button>
    </div>
  );
}

export default function DeliveryPage() {
  // Estados principales
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'history' | 'available' | 'transactions'>('history');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [eta, setEta] = useState<string>('');
  const [distance, setDistance] = useState<string>('');
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  
  // Refs
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ordersIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const routeUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRouteUpdateRef = useRef<number>(0);
  
  // Memoizar estado del pedido actual
  const currentOrderStatus = useMemo(() => {
    if (!currentOrder) return null;
    return {
      isPreparing: ['preparing', 'pending', 'confirmed'].includes(currentOrder.status),
      isAssigned: currentOrder.status === 'assigned',
      isInTransit: currentOrder.status === 'in_transit',
      isReady: currentOrder.status === 'ready',
    };
  }, [currentOrder?.status]);

  // Función para mostrar toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  // Cargar sesión guardada al iniciar
  useEffect(() => {
    const initializeSession = async () => {
      setIsInitializing(true);
      const savedSession = localStorage.getItem('delivery_driver_session');
      
      if (savedSession) {
        try {
          const sessionData = JSON.parse(savedSession);
          const { driver: savedDriver, timestamp } = sessionData;
          
          const sessionAge = Date.now() - timestamp;
          const maxAge = 24 * 60 * 60 * 1000;
          
          if (sessionAge < maxAge && savedDriver && savedDriver.id) {
            setDriver(savedDriver);
            setIsLoggedIn(true);
            
            // Verificar que el token esté guardado
            const savedToken = localStorage.getItem('driverToken');
            if (!savedToken) {
              // Si no hay token, forzar re-login
              localStorage.removeItem('delivery_driver_session');
              setIsInitializing(false);
              return;
            }
            
            // Solicitar permiso de geolocalización
            if ('geolocation' in navigator) {
              navigator.geolocation.getCurrentPosition(
                () => {
                  setLocationPermission(true);
                  startLocationTracking(savedDriver.id);
                },
                () => {
                  setError('Se requiere permiso de ubicación para usar la app');
                  showToast('Permiso de ubicación requerido', 'error');
                }
              );
            }
            
            // Cargar datos iniciales
            await Promise.all([
              loadOrders(savedDriver.id, false),
              loadOrderHistory(savedDriver.id, false),
              loadTransactions(savedDriver.id, false)
            ]);
            
            // Iniciar polling
            startOrdersPolling(savedDriver.id);
            setIsInitializing(false);
            showToast('Sesión restaurada', 'success');
          } else {
            localStorage.removeItem('delivery_driver_session');
            localStorage.removeItem('driverToken');
            setIsInitializing(false);
          }
        } catch (err) {
          console.error('Error cargando sesión:', err);
          localStorage.removeItem('delivery_driver_session');
          setIsInitializing(false);
        }
      } else {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, []);

  // Guardar sesión cuando cambia el driver
  useEffect(() => {
    if (driver && isLoggedIn) {
      localStorage.setItem('delivery_driver_session', JSON.stringify({
        driver,
        timestamp: Date.now()
      }));
    } else {
      localStorage.removeItem('delivery_driver_session');
      localStorage.removeItem('driverToken');
    }
  }, [driver, isLoggedIn]);

  // Login mejorado
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    try {
      const loginResponse = await deliveryApi.login(username, password);
      
      // Guardar token en localStorage
      if (loginResponse.access_token || loginResponse.accessToken) {
        localStorage.setItem('driverToken', loginResponse.access_token || loginResponse.accessToken);
      }
      
      // Extraer datos del driver (puede venir como 'driver' o directamente)
      const driverData = loginResponse.driver || loginResponse;
      setDriver(driverData);
      setIsLoggedIn(true);
      showToast(`¡Bienvenido, ${driverData.name}!`, 'success');
      
      // Solicitar permiso de geolocalización
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => {
            setLocationPermission(true);
            startLocationTracking(driverData.id);
            showToast('Ubicación GPS activada', 'success');
          },
          () => {
            setError('Se requiere permiso de ubicación para usar la app');
            showToast('Permiso de ubicación requerido', 'error');
          }
        );
      } else {
        setError('Tu navegador no soporta geolocalización');
        showToast('Navegador no compatible con GPS', 'error');
      }
      
      // Cargar datos
      await Promise.all([
        loadOrders(driverData.id, false),
        loadOrderHistory(driverData.id, false),
        loadTransactions(driverData.id, false)
      ]);
      
      // Iniciar polling
      startOrdersPolling(driverData.id);
    } catch (err: any) {
      const errorMsg = err.message || 'Error al iniciar sesión';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Iniciar polling de pedidos
  const startOrdersPolling = useCallback((driverId: string) => {
    if (!driverId) {
      console.warn('⚠️ startOrdersPolling: driverId no proporcionado');
      return;
    }
    
    if (ordersIntervalRef.current) {
      clearInterval(ordersIntervalRef.current);
    }
    
    ordersIntervalRef.current = setInterval(async () => {
      try {
        if (!driverId) {
          console.warn('⚠️ Polling: driverId no disponible');
          return;
        }
        
        await Promise.all([
          loadOrders(driverId, true), // silent update
          loadOrderHistory(driverId, true),
          loadTransactions(driverId, true)
        ]);
        setLastUpdateTime(new Date());
      } catch (err) {
        console.error('Error en polling:', err);
      }
    }, 10000); // Cada 10 segundos
  }, []);

  // Iniciar tracking de ubicación mejorado
  const startLocationTracking = useCallback((driverId: string) => {
    if (!driverId) {
      console.warn('⚠️ startLocationTracking: driverId no proporcionado');
      return;
    }
    
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    locationIntervalRef.current = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              
              setDriverLocation({ lat, lng });
              
              if (driverId) {
                await deliveryApi.updateLocation(driverId, lat, lng);
              }
              
              // Actualizar ruta con debounce
              if (currentOrder && currentOrder.customer_lat && currentOrder.customer_lng) {
                const now = Date.now();
                if (now - lastRouteUpdateRef.current > 10000) { // Actualizar ruta cada 10 segundos
                  lastRouteUpdateRef.current = now;
                  updateRoute(lat, lng, currentOrder.customer_lat, currentOrder.customer_lng);
                }
              }
            } catch (err) {
              console.error('Error actualizando ubicación:', err);
            }
          },
          (err) => {
            console.error('Error obteniendo ubicación:', err);
            if (err.code === 1) {
              setLocationPermission(false);
              showToast('Permiso de ubicación denegado', 'error');
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
          }
        );
      }
    }, 5000);
  }, [currentOrder]);

  // Actualizar ruta en el mapa con optimización
  const updateRoute = useCallback(async (driverLat: number, driverLng: number, customerLat: number, customerLng: number) => {
    // Cancelar actualización pendiente
    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
    }

    routeUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        const route = await getRoute([driverLng, driverLat], [customerLng, customerLat]);
        if (route) {
          setRouteData(route);
          setEta(formatDuration(route.duration));
          setDistance(formatDistance(route.distance));
          
          if (mapRef.current && route) {
            drawRouteOnMap(mapRef.current, route);
            updateDriverMarker(driverLat, driverLng);
            updateCustomerMarker(customerLat, customerLng);
            
            const bounds = new window.mapboxgl.LngLatBounds();
            bounds.extend([driverLng, driverLat]);
            bounds.extend([customerLng, customerLat]);
            mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
          }
        }
      } catch (err) {
        console.error('Error obteniendo ruta:', err);
      }
    }, 500); // Debounce de 500ms
  }, []);
  
  // Dibujar ruta en el mapa
  const drawRouteOnMap = useCallback((map: any, route: any) => {
    if (!map || !route || !route.geometry) return;
    
    try {
      // Eliminar capa anterior
      if (map.getLayer('route')) {
        map.removeLayer('route');
      }
      if (map.getSource('route')) {
        map.removeSource('route');
      }
    } catch (e) {
      // Ignorar errores
    }
    
    // Agregar nueva ruta
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: route.geometry
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
        'line-width': 5,
        'line-opacity': 0.8
      }
    });
    
    routeLayerRef.current = true;
  }, []);
  
  // Actualizar marcador del repartidor
  const updateDriverMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;
    
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'driver-marker';
      el.innerHTML = '<div style="width: 30px; height: 30px; background: #10b981; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>';
      
      driverMarkerRef.current = new window.mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new window.mapboxgl.Popup().setHTML('<div class="p-2"><strong>🛵 Tu ubicación</strong></div>'))
        .addTo(mapRef.current);
    }
  }, []);
  
  // Actualizar marcador del cliente
  const updateCustomerMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;
    
    if (customerMarkerRef.current) {
      customerMarkerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'customer-marker';
      el.innerHTML = '<div style="width: 30px; height: 30px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>';
      
      customerMarkerRef.current = new window.mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new window.mapboxgl.Popup().setHTML('<div class="p-2"><strong>📍 Destino</strong></div>'))
        .addTo(mapRef.current);
    }
  }, []);

  // Inicializar mapa mejorado
  useEffect(() => {
    if (!currentOrder || !currentOrder.customer_lat || !currentOrder.customer_lng || !mapContainerRef.current || activeTab !== 'history') {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          // Ignorar errores
        }
        mapRef.current = null;
        driverMarkerRef.current = null;
        customerMarkerRef.current = null;
        routeLayerRef.current = null;
      }
      return;
    }
    
    const loadMapbox = () => {
      if (!window.mapboxgl) {
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
        script.onload = () => {
          const link = document.createElement('link');
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
          link.rel = 'stylesheet';
          document.head.appendChild(link);
          
          if (window.mapboxgl) {
            window.mapboxgl.accessToken = "pk.eyJ1IjoiZWxidWVubWVudSIsImEiOiJjbWdqMnRwZWMwZ2FvMmtuMjFvMGR1NXNiIn0.7ACTVWHp6JJ6l5kY5O3GzQ";
            initializeMap();
          }
        };
        document.head.appendChild(script);
      } else {
        if (mapRef.current) {
          updateMapView();
        } else {
          initializeMap();
        }
      }
    };
    
    const initializeMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      
      const centerLat = driverLocation?.lat || currentOrder.customer_lat || -34.6037;
      const centerLng = driverLocation?.lng || currentOrder.customer_lng || -58.3816;
      
      const map = new window.mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerLng, centerLat],
        zoom: 13,
        pitch: 45,
        bearing: 0
      });
      
      mapRef.current = map;
      
      map.on('load', () => {
        updateMapView();
      });
    };
    
    const updateMapView = () => {
      if (!mapRef.current || !currentOrder) return;
      
      if (currentOrder.customer_lat && currentOrder.customer_lng && driverLocation) {
        updateRoute(
          driverLocation.lat,
          driverLocation.lng,
          currentOrder.customer_lat,
          currentOrder.customer_lng
        );
        
        const bounds = new window.mapboxgl.LngLatBounds();
        bounds.extend([driverLocation.lng, driverLocation.lat]);
        bounds.extend([currentOrder.customer_lng, currentOrder.customer_lat]);
        mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      } else if (currentOrder.customer_lat && currentOrder.customer_lng) {
        updateCustomerMarker(currentOrder.customer_lat, currentOrder.customer_lng);
        mapRef.current.setCenter([currentOrder.customer_lng, currentOrder.customer_lat]);
        mapRef.current.setZoom(14);
      }
    };
    
    loadMapbox();
    
    return () => {
      // Cleanup se hace en el efecto principal
    };
  }, [currentOrder?.id, activeTab, driverLocation, updateRoute, updateCustomerMarker]);

  // Actualizar ruta cuando cambia la ubicación
  useEffect(() => {
    if (currentOrder && driverLocation && currentOrder.customer_lat && currentOrder.customer_lng) {
      const now = Date.now();
      if (now - lastRouteUpdateRef.current > 10000) {
        lastRouteUpdateRef.current = now;
        updateRoute(
          driverLocation.lat,
          driverLocation.lng,
          currentOrder.customer_lat,
          currentOrder.customer_lng
        );
      }
    }
  }, [driverLocation, currentOrder?.customer_lat, currentOrder?.customer_lng, updateRoute]);

  // Cargar pedidos optimizado
  const loadOrders = useCallback(async (driverId: string, silent: boolean = false) => {
    try {
      if (!driverId) {
        console.warn('⚠️ loadOrders: driverId no proporcionado');
        return;
      }
      
      if (!silent) setLoading(true);
      
      const [available, driverData] = await Promise.all([
        deliveryApi.getAvailableOrders(),
        deliveryApi.getBalance(driverId)
      ]);

      setAvailableOrders(available);
      
      if (driverData && driver) {
        const updatedDriver = { ...driver, balance: driverData.balance };
        setDriver(updatedDriver);
        
        if (updatedDriver.current_order_id) {
          try {
            const allOrders = await ordersApi.getAll();
            const current = allOrders.find((o: Order) => o.id === updatedDriver.current_order_id);
            if (current) {
              setCurrentOrder(current);
            } else {
              setCurrentOrder(null);
            }
          } catch (err) {
            console.error('Error cargando pedido actual:', err);
          }
        } else {
          setCurrentOrder(null);
        }
      }
    } catch (err) {
      console.error('Error cargando pedidos:', err);
      if (!silent) {
        showToast('Error al cargar pedidos', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [driver, showToast]);
  
  // Cargar historial optimizado
  const loadOrderHistory = useCallback(async (driverId: string, silent: boolean = false) => {
    try {
      const allOrders = await ordersApi.getAll();
      const inProgress = allOrders.filter((order: any) => {
        const orderDriverId = order.delivery_person_id || order.deliveryPersonId;
        return orderDriverId === driverId && 
               order.status !== 'delivered' && 
               order.status !== 'cancelled';
      });
      setOrderHistory(inProgress);
    } catch (err) {
      console.error('Error cargando historial:', err);
      if (!silent) {
        showToast('Error al cargar historial', 'error');
      }
    }
  }, [showToast]);

  // Cargar transacciones (movimientos)
  const loadTransactions = useCallback(async (driverId: string, silent: boolean = false) => {
    try {
      if (!driverId) {
        console.warn('⚠️ loadTransactions: driverId no proporcionado');
        return;
      }
      
      const balanceData = await deliveryApi.getBalance(driverId);
      if (balanceData && balanceData.transactions) {
        // Ordenar por fecha descendente (más recientes primero)
        const sortedTransactions = balanceData.transactions.sort((a: any, b: any) => {
          const dateA = new Date(a.created_at || a.createdAt || 0);
          const dateB = new Date(b.created_at || b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
        setTransactions(sortedTransactions);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error('Error cargando transacciones:', err);
      if (!silent) {
        showToast('Error al cargar movimientos', 'error');
      }
    }
  }, [showToast]);

  // Aceptar pedido mejorado
  const handleAcceptOrder = useCallback(async (orderId: string) => {
    if (!driver) return;
    
    setLoading(true);
    setError('');
    try {
      const acceptedOrder = await deliveryApi.acceptOrder(driver.id, orderId);
      
      const updatedDriver = { ...driver, current_order_id: acceptedOrder.id };
      setDriver(updatedDriver);
      setCurrentOrder(acceptedOrder);
      setActiveTab('history');
      
      showToast(`Pedido ${acceptedOrder.order_number} aceptado`, 'success');
      
      await Promise.all([
        loadOrders(driver.id, true),
        loadOrderHistory(driver.id, true),
        loadTransactions(driver.id, true)
      ]);
      
      if (acceptedOrder.customer_lat && acceptedOrder.customer_lng && driverLocation) {
        updateRoute(
          driverLocation.lat,
          driverLocation.lng,
          acceptedOrder.customer_lat,
          acceptedOrder.customer_lng
        );
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Error al aceptar pedido';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }, [driver, driverLocation, loadOrders, loadOrderHistory, updateRoute, showToast]);

  // Actualizar estado del pedido mejorado
  const handleUpdateStatus = useCallback(async (status: string, order?: Order) => {
    const orderToUpdate = order || currentOrder;
    if (!driver || !orderToUpdate) return;
    
    setLoading(true);
    setError('');
    try {
      await deliveryApi.updateOrderStatus(driver.id, orderToUpdate.id, status);
      
      if (orderToUpdate.id === currentOrder?.id) {
        setCurrentOrder({ ...orderToUpdate, status });
      }
      
      const statusMessages: Record<string, string> = {
        'in_transit': '¡Pedido en camino!'
      };
      
      if (statusMessages[status]) {
        showToast(statusMessages[status], 'success');
      }
      
      await Promise.all([
        loadOrders(driver.id, true),
        loadOrderHistory(driver.id, true)
      ]);
    } catch (err: any) {
      const errorMsg = err.message || 'Error al actualizar estado';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }, [driver, currentOrder, loadOrders, loadOrderHistory, showToast]);

  // Entregar pedido mejorado
  const handleDeliverOrder = useCallback(async () => {
    if (!driver || !currentOrder || !deliveryCode.trim()) {
      setError('Ingresa el código de entrega');
      showToast('Ingresa el código de entrega', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await deliveryApi.deliverOrder(driver.id, currentOrder.id, deliveryCode);
      setShowDeliveryModal(false);
      setDeliveryCode('');
      setError('');
      setCurrentOrder(null);
      
      // Mensaje de éxito personalizado según si hubo cobro en efectivo
      let successMessage = '¡Pedido entregado exitosamente! +$3000';
      if (result && result.cash_collected && result.cash_collected > 0) {
        const formattedCash = new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(result.cash_collected);
        const formattedTotal = new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(result.total_added || (result.cash_collected + result.delivery_fee));
        successMessage = `¡Pedido entregado!💰 Cobro: ${formattedCash} + $3000 = ${formattedTotal}`;
      }
      
      showToast(successMessage, 'success');
      
      // Recargar datos incluyendo transacciones
      await Promise.all([
        loadOrders(driver.id, true),
        loadOrderHistory(driver.id, true),
        loadTransactions(driver.id, true)
      ]);
      
      // Cambiar a la pestaña de movimientos si hubo cobro en efectivo
      if (result && result.cash_collected && result.cash_collected > 0) {
        setActiveTab('transactions');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Error al entregar pedido';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }, [driver, currentOrder, deliveryCode, loadOrders, loadOrderHistory, loadTransactions, showToast]);

  // Logout mejorado
  const handleLogout = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    if (ordersIntervalRef.current) {
      clearInterval(ordersIntervalRef.current);
    }
    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
    }
    
    setIsLoggedIn(false);
    setDriver(null);
    setCurrentOrder(null);
    setAvailableOrders([]);
    setOrderHistory([]);
    setLocationPermission(false);
    localStorage.removeItem('delivery_driver_session');
    localStorage.removeItem('driverToken');
    showToast('Sesión cerrada', 'info');
  }, [showToast]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (ordersIntervalRef.current) {
        clearInterval(ordersIntervalRef.current);
      }
      if (routeUpdateTimeoutRef.current) {
        clearTimeout(routeUpdateTimeoutRef.current);
      }
    };
  }, []);

  // Pantalla de carga inicial
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#111111] border-t-transparent mx-auto mb-4"></div>
          <p className="text-[#111111] text-xl font-semibold">Cargando...</p>
        </div>
      </div>
    );
  }

  // Pantalla de login mejorada - Estilo premium minimalista
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-[#C7C7C7] p-10 w-full max-w-md transform transition-all">
          <div className="text-center mb-8">
            <div className="rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 border-2 border-[#FFC300] bg-white">
              <span className="text-4xl">🛵</span>
            </div>
            <h1 className="text-4xl font-bold text-[#111111] mb-2">El Buen Menú</h1>
            <p className="text-[#C7C7C7] font-medium">App de Repartidores</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#111111] mb-2">
                Usuario
              </label>
              <input
                type="text"
                name="username"
                required
                className="w-full px-5 py-4 border border-[#C7C7C7] rounded-lg focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-base bg-white text-[#111111]"
                placeholder="Ingresa tu usuario"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#111111] mb-2">
                Contraseña
              </label>
              <input
                type="password"
                name="password"
                required
                className="w-full px-5 py-4 border border-[#C7C7C7] rounded-lg focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] transition-all text-base bg-white text-[#111111]"
                placeholder="Ingresa tu contraseña"
              />
            </div>
            
            {error && (
              <div className="bg-white border border-red-300 text-[#111111] px-5 py-4 rounded-lg text-sm font-medium">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#111111] hover:bg-[#000000] text-white font-semibold py-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md border-2 border-[#FFC300] hover:border-[#FFC300]"
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Iniciando sesión...</span>
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Pantalla principal mejorada - Estilo premium minimalista
  return (
    <div className="min-h-screen bg-white">
      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header premium minimalista */}
      <div className="bg-white border-b border-[#C7C7C7] sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg p-3 border border-[#C7C7C7] bg-white">
                <span className="text-2xl">🛵</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#111111]">Hola, {driver?.name}</h1>
                <div className="flex items-center space-x-6 mt-2">
                  <div className="flex items-center space-x-2 border border-[#C7C7C7] rounded-lg px-3 py-1.5 bg-white">
                    <span className="text-base">💰</span>
                    <span className="text-sm font-medium text-[#111111]">
                      Saldo: <span className="font-semibold">${driver?.balance?.toLocaleString('es-AR') || '0'}</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 border border-[#C7C7C7] rounded-lg px-3 py-1.5 bg-white">
                    <span className="text-base">📦</span>
                    <span className="text-sm font-medium text-[#111111]">
                      Pedidos: <span className="font-semibold">{orderHistory.length}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white hover:bg-gray-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-[#C7C7C7] text-[#111111] hover:border-[#FFC300]"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Estado de ubicación premium minimalista */}
        <div className={`p-5 rounded-lg border ${
          locationPermission 
            ? 'bg-white border-[#C7C7C7]' 
            : 'bg-white border-[#C7C7C7]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`rounded-lg p-3 border ${
                locationPermission ? 'bg-white border-[#C7C7C7]' : 'bg-white border-[#C7C7C7]'
              }`}>
                <span className="text-2xl">{locationPermission ? '📍' : '⚠️'}</span>
              </div>
              <div>
                <p className="font-semibold text-base text-[#111111]">
                  {locationPermission ? 'Ubicación GPS activa' : 'Esperando permiso de ubicación'}
                </p>
                <p className="text-sm text-[#C7C7C7] mt-1">
                  {locationPermission ? 'Tu ubicación se está compartiendo en tiempo real' : 'Necesitamos tu ubicación para mostrar rutas GPS'}
                </p>
              </div>
            </div>
            {locationPermission && (
              <div className="bg-[#111111] rounded-lg px-4 py-2 border border-[#FFC300]">
                <span className="text-white font-medium text-xs uppercase tracking-wide">ACTIVO</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-white border border-red-300 text-[#111111] px-5 py-4 rounded-lg">
            <div className="flex items-center space-x-3">
              <span className="text-xl">⚠️</span>
              <p className="font-medium text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Tabs premium minimalistas */}
        <div className="bg-white rounded-lg border border-[#C7C7C7] p-1">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'history'
                  ? 'bg-[#111111] text-white border border-[#FFC300]'
                  : 'text-[#111111] hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-base">🚚</span>
                <span>Pedidos</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  activeTab === 'history' 
                    ? 'bg-white bg-opacity-20 text-white' 
                    : 'bg-gray-100 text-[#111111]'
                }`}>
                  {orderHistory.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('available')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'available'
                  ? 'bg-[#111111] text-white border border-[#FFC300]'
                  : 'text-[#111111] hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-base">📋</span>
                <span>Disponibles</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  activeTab === 'available' 
                    ? 'bg-white bg-opacity-20 text-white' 
                    : 'bg-gray-100 text-[#111111]'
                }`}>
                  {availableOrders.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab('transactions');
                if (driver) {
                  loadTransactions(driver.id, false);
                }
              }}
              className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'transactions'
                  ? 'bg-[#111111] text-white border border-[#FFC300]'
                  : 'text-[#111111] hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <span className="text-base">💰</span>
                <span>Movimientos</span>
              </div>
            </button>
          </div>
        </div>

        {/* Tab: Pedidos en Curso */}
        {activeTab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-extrabold text-gray-800">Pedidos en Curso</h2>
              {lastUpdateTime && (
                <p className="text-sm text-gray-500">
                  Última actualización: {lastUpdateTime.toLocaleTimeString()}
                </p>
              )}
            </div>
            {orderHistory.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#C7C7C7] p-12 text-center">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-base text-[#111111] font-medium">No tenés pedidos en curso en este momento</p>
                <p className="text-sm text-[#C7C7C7] mt-2">Los nuevos pedidos aparecerán aquí automáticamente</p>
              </div>
            ) : (
              <div className="space-y-6">
                {orderHistory.map((order, index) => {
                  const isCurrentOrder = order.id === currentOrder?.id;
                  const orderEta = isCurrentOrder ? eta : '';
                  const orderDistance = isCurrentOrder ? distance : '';
                  
                  return (
                    <div 
                      key={order.id} 
                      className="bg-white rounded-lg border border-[#C7C7C7] overflow-hidden transform transition-all duration-200 hover:shadow-md"
                    >
                      {/* Header minimalista del pedido */}
                      <div className="bg-[#111111] text-white p-5 border-b border-[#FFC300]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="bg-white bg-opacity-10 rounded-lg p-3 border border-white border-opacity-20">
                              <span className="text-2xl">📦</span>
                            </div>
                            <div>
                              <h3 className="font-bold text-xl">
                                {order.order_number}
                              </h3>
                              <p className="text-gray-300 text-xs font-medium">Pedido</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
                              order.status === 'assigned' ? 'bg-white text-[#111111]' :
                              order.status === 'in_transit' ? 'bg-white text-[#111111]' :
                              order.status === 'preparing' ? 'bg-white bg-opacity-50 text-white' :
                              order.status === 'ready' ? 'bg-white text-[#111111]' :
                              'bg-white bg-opacity-50 text-white'
                            }`}>
                              {order.status === 'assigned' ? '🚚 Asignado' :
                               order.status === 'in_transit' ? '📍 En camino' :
                               order.status === 'preparing' ? '⏳ Preparando' :
                               order.status === 'ready' ? '✅ Listo' :
                               order.status}
                            </div>
                            {isCurrentOrder && (
                              <div className="mt-2 px-3 py-1 bg-[#FFC300] text-[#111111] rounded text-xs font-medium uppercase">
                                ACTIVO
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Información del pedido minimalista */}
                      <div className="p-5">
                        {/* Cliente y Total destacados */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                          <div className="bg-white rounded-lg p-4 border border-[#C7C7C7]">
                            <p className="text-xs font-medium text-[#C7C7C7] uppercase mb-2">Cliente</p>
                            <p className="font-semibold text-base text-[#111111]">{order.customer_name}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-[#FFC300]">
                            <p className="text-xs font-medium text-[#C7C7C7] uppercase mb-2">Total</p>
                            <p className="font-bold text-xl text-[#111111]">
                              ${order.total?.toLocaleString('es-AR') || '0'}
                            </p>
                          </div>
                        </div>

                        {/* Dirección destacada */}
                        <div className="bg-white rounded-lg p-4 border border-[#C7C7C7] mb-5">
                          <p className="text-xs font-medium text-[#C7C7C7] uppercase mb-2 flex items-center">
                            <span className="mr-2">📍</span>
                            Dirección de entrega
                          </p>
                          <p className="font-medium text-sm text-[#111111] leading-relaxed">{order.customer_address}</p>
                        </div>

                        {/* ETA y Distancia si está activo */}
                        {isCurrentOrder && orderEta && orderDistance && (
                          <div className="grid grid-cols-2 gap-4 mb-5">
                            <div className="bg-white rounded-lg p-4 border border-[#C7C7C7]">
                              <p className="text-xs font-medium text-[#C7C7C7] uppercase mb-2">⏱️ Tiempo</p>
                              <p className="font-semibold text-base text-[#111111]">{orderEta}</p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-[#C7C7C7]">
                              <p className="text-xs font-medium text-[#C7C7C7] uppercase mb-2">📏 Distancia</p>
                              <p className="font-semibold text-base text-[#111111]">{orderDistance}</p>
                            </div>
                          </div>
                        )}

                        {/* Items del pedido minimalista */}
                        {order.items && order.items.length > 0 && (
                          <div className="mb-5 bg-white rounded-lg p-4 border border-[#C7C7C7]">
                            <p className="text-xs font-medium text-[#C7C7C7] mb-3 uppercase flex items-center">
                              <span className="mr-2">🛒</span>
                              Items del pedido ({order.items.length})
                            </p>
                            <div className="space-y-2">
                              {order.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-[#C7C7C7]">
                                  <div className="flex items-center space-x-3">
                                    <div className="bg-[#111111] text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold text-sm">
                                      {item.quantity}
                                    </div>
                                    <span className="font-medium text-[#111111] text-sm">{item.product_name}</span>
                                  </div>
                                  <span className="font-semibold text-[#111111] text-sm">
                                    ${item.subtotal?.toLocaleString('es-AR') || '0'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Botones de acción minimalistas - SIEMPRE VISIBLES */}
                        <div className="space-y-3 mt-5 pt-5 border-t border-[#C7C7C7]">
                          {/* Estado: Preparando o Pendiente */}
                          {(order.status === 'preparing' || order.status === 'pending' || order.status === 'confirmed') && (
                            <div className="bg-white border border-[#C7C7C7] rounded-lg p-4">
                              <div className="flex items-center space-x-3 mb-1">
                                <span className="text-xl">⏳</span>
                                <p className="font-medium text-[#111111] text-sm">El pedido se está preparando</p>
                              </div>
                              <p className="text-xs text-[#C7C7C7]">Esperá a que el pedido esté listo para salir</p>
                            </div>
                          )}

                          {/* Estado: Asignado - Listo para salir */}
                          {order.status === 'assigned' && (
                            <button
                              onClick={() => {
                                setCurrentOrder(order);
                                handleUpdateStatus('in_transit', order);
                              }}
                              disabled={loading}
                              className="w-full bg-[#111111] hover:bg-[#000000] text-white font-semibold py-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-[#FFC300] hover:border-[#FFC300] flex items-center justify-center space-x-3"
                            >
                              <span className="text-xl">🚚</span>
                              <span>Voy en camino</span>
                              {loading && (
                                <span className="ml-2">
                                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </span>
                              )}
                            </button>
                          )}
                          
                          {/* Estado: En camino */}
                          {order.status === 'in_transit' && (
                            <button
                              onClick={() => {
                                setCurrentOrder(order);
                                setShowDeliveryModal(true);
                              }}
                              className="w-full bg-[#111111] hover:bg-[#000000] text-white font-semibold py-4 rounded-lg transition-all duration-200 border-2 border-[#FFC300] hover:border-[#FFC300] flex items-center justify-center space-x-3"
                            >
                              <span className="text-xl">✅</span>
                              <span>Marcar como Entregado</span>
                            </button>
                          )}

                          {/* Estado: Ready - Listo para recoger */}
                          {order.status === 'ready' && (
                            <button
                              onClick={() => {
                                setCurrentOrder(order);
                                handleUpdateStatus('in_transit', order);
                              }}
                              disabled={loading}
                              className="w-full bg-[#111111] hover:bg-[#000000] text-white font-semibold py-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-[#FFC300] hover:border-[#FFC300] flex items-center justify-center space-x-3"
                            >
                              <span className="text-xl">📦</span>
                              <span>Pedido listo - Voy a recogerlo</span>
                              {loading && (
                                <span className="ml-2">
                                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mapa GPS minimalista */}
                      {isCurrentOrder && order.customer_lat && order.customer_lng && (
                        <div className="border-t border-[#C7C7C7]">
                          <div className="p-4 border-b border-[#C7C7C7] bg-white">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-xl">🗺️</span>
                                <h4 className="font-medium text-[#111111] text-sm">Ruta al destino</h4>
                              </div>
                              {orderEta && orderDistance && (
                                <div className="flex items-center space-x-2">
                                  <span className="bg-white border border-[#C7C7C7] text-[#111111] px-3 py-1.5 rounded text-xs font-medium">
                                    ⏱️ {orderEta}
                                  </span>
                                  <span className="bg-white border border-[#C7C7C7] text-[#111111] px-3 py-1.5 rounded text-xs font-medium">
                                    📏 {orderDistance}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div 
                            ref={mapContainerRef}
                            className="w-full h-[500px]"
                            style={{ minHeight: '500px' }}
                          />
                        </div>
                      )}
                      
                      {/* Botón para activar mapa */}
                      {!isCurrentOrder && order.customer_lat && order.customer_lng && (
                        <div className="border-t border-[#C7C7C7] p-4 bg-white">
                          <button
                            onClick={() => {
                              setCurrentOrder(order);
                              setTimeout(() => {
                                if (driverLocation) {
                                  updateRoute(
                                    driverLocation.lat,
                                    driverLocation.lng,
                                    order.customer_lat!,
                                    order.customer_lng!
                                  );
                                }
                              }, 100);
                            }}
                            className="w-full bg-[#111111] hover:bg-[#000000] text-white font-medium py-3 rounded-lg transition-all duration-200 border-2 border-[#FFC300] hover:border-[#FFC300] flex items-center justify-center space-x-2"
                          >
                            <span className="text-base">🗺️</span>
                            <span>Ver mapa y ruta GPS</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Pedidos Disponibles minimalista */}
        {activeTab === 'available' && (
          <div>
            <h2 className="text-2xl font-bold text-[#111111] mb-5">Pedidos Disponibles</h2>
            {availableOrders.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#C7C7C7] p-12 text-center">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-base text-[#111111] font-medium">No hay pedidos disponibles en este momento</p>
                <p className="text-sm text-[#C7C7C7] mt-2">Los nuevos pedidos aparecerán aquí automáticamente</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableOrders.map((order, index) => (
                  <div 
                    key={order.id} 
                    className="bg-white rounded-lg border border-[#C7C7C7] p-5 transform transition-all duration-200 hover:shadow-md"
                  >
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg text-[#111111]">
                          {order.order_number}
                        </h3>
                        <div className="bg-[#111111] text-white px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#FFC300]">
                          ${order.total.toLocaleString('es-AR')}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[#111111] font-medium text-sm flex items-center">
                          <span className="mr-2">👤</span>
                          {order.customer_name}
                        </p>
                        <p className="text-[#C7C7C7] text-xs flex items-start">
                          <span className="mr-2 mt-1">📍</span>
                          <span className="flex-1">{order.customer_address}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={loading || !!currentOrder}
                      className="w-full bg-[#111111] hover:bg-[#000000] text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-[#FFC300] hover:border-[#FFC300]"
                    >
                      {currentOrder ? 'Ya tenés un pedido activo' : 'Aceptar Pedido'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Movimientos (Transacciones) minimalista */}
        {activeTab === 'transactions' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold text-[#111111]">Movimientos</h2>
              <button
                onClick={() => driver && loadTransactions(driver.id, false)}
                className="bg-white hover:bg-gray-50 text-[#111111] px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-[#C7C7C7] hover:border-[#FFC300] flex items-center space-x-2"
              >
                <span>🔄</span>
                <span>Actualizar</span>
              </button>
            </div>
            
            {transactions.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#C7C7C7] p-12 text-center">
                <div className="text-5xl mb-4">💵</div>
                <p className="text-base text-[#111111] font-medium">No hay movimientos registrados</p>
                <p className="text-sm text-[#C7C7C7] mt-2">Los movimientos aparecerán aquí cuando entregues pedidos</p>
              </div>
            ) : (
              <div className="space-y-4">
                {transactions.map((transaction, index) => {
                  // Formatear fecha y hora según el formato solicitado (DD/MM - HH:MM)
                  const date = new Date(transaction.created_at || transaction.createdAt || Date.now());
                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const hours = String(date.getHours()).padStart(2, '0');
                  const minutes = String(date.getMinutes()).padStart(2, '0');
                  const formattedDate = `${day}/${month} - ${hours}:${minutes}`;
                  
                  // Determinar el tipo de transacción y el formato
                  const isCashCollection = transaction.type === 'cash_collection';
                  const isDelivery = transaction.type === 'delivery';
                  const isAdminPayment = transaction.type === 'pago_admin';
                  
                  // Formatear monto sin símbolo de moneda, solo números con formato argentino
                  const amount = transaction.amount || 0;
                  const formattedAmount = new Intl.NumberFormat('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }).format(Math.abs(amount));
                  
                  // Determinar color según el tipo - estilo minimalista
                  let bgColor = 'bg-white';
                  let borderColor = 'border-[#C7C7C7]';
                  let textColor = 'text-[#111111]';
                  
                  if (isCashCollection) {
                    bgColor = 'bg-white';
                    borderColor = 'border-[#FFC300]';
                    textColor = 'text-[#111111]';
                  } else if (isDelivery) {
                    bgColor = 'bg-white';
                    borderColor = 'border-[#C7C7C7]';
                    textColor = 'text-[#111111]';
                  } else if (isAdminPayment) {
                    bgColor = 'bg-white';
                    borderColor = 'border-[#C7C7C7]';
                    textColor = 'text-[#111111]';
                  }
                  
                  // Extraer dirección del reference para cobro en efectivo
                  let address = 'N/A';
                  if (isCashCollection && transaction.reference) {
                    address = transaction.reference.replace('Cobro en efectivo a cliente direccion: ', '').trim();
                  }
                  
                  return (
                    <div
                      key={transaction.id || index}
                      className={`${bgColor} rounded-lg border ${borderColor} p-5 transform transition-all duration-200 hover:shadow-sm`}
                    >
                      <div className="space-y-3">
                        {/* Fecha y hora en formato solicitado */}
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-[#C7C7C7]">{formattedDate}</span>
                        </div>
                        
                        {/* Descripción según el tipo - Formato exacto solicitado */}
                        {isCashCollection && (
                          <div className="space-y-2">
                            <p className={`font-medium text-sm ${textColor} leading-relaxed`}>
                              Cobro en efectivo a cliente direccion : {address}
                            </p>
                            <p className="font-bold text-xl text-[#111111] mt-2">
                              $ {formattedAmount}
                            </p>
                          </div>
                        )}
                        
                        {isDelivery && (
                          <div className="space-y-2">
                            <p className={`font-medium text-sm ${textColor} leading-relaxed`}>
                              PEDIDO ENTREGADO + 3000 $
                            </p>
                            <p className="font-bold text-xl text-[#111111] mt-2">
                              $ {formattedAmount}
                            </p>
                          </div>
                        )}
                        
                        {isAdminPayment && (
                          <div className="space-y-2">
                            <p className={`font-medium text-sm ${textColor}`}>
                              {transaction.reference || 'Pago realizado por admin'}
                            </p>
                            <p className="font-bold text-lg text-[#111111] mt-2">
                              {amount < 0 ? '-' : '+'} $ {formattedAmount}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de entrega minimalista */}
      {showDeliveryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-[#C7C7C7] shadow-lg p-6 w-full max-w-md">
            <div className="text-center mb-5">
              <div className="rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3 border-2 border-[#FFC300] bg-white">
                <span className="text-3xl">✅</span>
              </div>
              <h3 className="text-xl font-bold text-[#111111] mb-2">
                Confirmar Entrega
              </h3>
              <p className="text-sm text-[#C7C7C7]">
                Pedile al cliente el código de entrega e ingresalo aquí:
              </p>
            </div>
            <input
              type="text"
              value={deliveryCode}
              onChange={(e) => setDeliveryCode(e.target.value.toUpperCase())}
              placeholder="Código de entrega"
              className="w-full px-4 py-3 border border-[#C7C7C7] rounded-lg focus:ring-2 focus:ring-[#FFC300] focus:border-[#FFC300] mb-4 text-center text-lg font-semibold tracking-widest uppercase transition-all bg-white text-[#111111]"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter' && deliveryCode.trim()) {
                  handleDeliverOrder();
                }
              }}
            />
            {error && (
              <div className="bg-white border border-red-300 text-[#111111] px-4 py-3 rounded-lg text-sm font-medium mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-base">⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeliveryModal(false);
                  setDeliveryCode('');
                  setError('');
                }}
                className="flex-1 bg-white hover:bg-gray-50 text-[#111111] font-medium py-3 rounded-lg transition-all duration-200 border border-[#C7C7C7] hover:border-[#FFC300]"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeliverOrder}
                disabled={loading || !deliveryCode.trim()}
                className="flex-1 bg-[#111111] hover:bg-[#000000] text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-[#FFC300] hover:border-[#FFC300]"
              >
                {loading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Entregando...</span>
                  </span>
                ) : (
                  'Confirmar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
