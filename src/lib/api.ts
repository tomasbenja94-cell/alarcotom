// API Client para reemplazar Supabase
// Normalizar API_URL para asegurar que siempre termine en /api
let rawApiUrl = import.meta.env.VITE_API_URL || 'https://api.elbuenmenu.site/api';
// Remover trailing slash si existe
rawApiUrl = rawApiUrl.replace(/\/$/, '');
// Asegurar que termine en /api
const API_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

async function request(endpoint: string, options: RequestInit = {}) {
  // Obtener token de autenticación si existe (admin o driver)
  // Leer directamente de localStorage en cada llamada para evitar problemas de sincronización
  let adminToken = localStorage.getItem('adminToken');
  let driverToken = localStorage.getItem('driverToken');
  let token = adminToken || driverToken;
  
  // Debug: verificar token solo para endpoints de delivery (reducir logs)
  if (endpoint.includes('/delivery/') && !token) {
    console.warn(`⚠️ [API] No hay token para endpoint de delivery: ${endpoint}`);
    // Verificar localStorage directamente (puede haber un problema de timing)
    const directCheck = localStorage.getItem('driverToken');
    if (directCheck) {
      token = directCheck;
      driverToken = directCheck;
    }
  }
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };
  
  // Si hay headers personalizados, pueden sobrescribir Authorization
  if (options.headers && 'Authorization' in options.headers) {
    headers['Authorization'] = (options.headers as any)['Authorization'];
  }

  // Construir URL completa
  const fullUrl = `${API_URL}${endpoint}`;
  
  // Debug: solo para productos para no saturar logs
  if (endpoint.includes('/products')) {
    console.log(`🔗 [API] Llamando a: ${fullUrl}`);
  }
  
  const response = await fetch(fullUrl, {
    headers,
    ...options,
  });

  // Obtener el texto de la respuesta primero para verificar si es HTML
  const responseText = await response.text();
  
  // Verificar si la respuesta es HTML (error común cuando la URL está mal)
  if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
    console.error(`❌ [API] El servidor devolvió HTML en lugar de JSON para ${endpoint}`);
    console.error(`❌ [API] URL intentada: ${API_URL}${endpoint}`);
    throw new Error(`El servidor devolvió HTML. Verifica que la URL del API sea correcta: ${API_URL}`);
  }

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { error: responseText.substring(0, 200) || 'Error desconocido' };
    }
    
    // Manejar errores 401 (Unauthorized)
    if (response.status === 401) {
      if (!token) {
        throw new Error('Token no proporcionado');
      }
      // Si hay token pero el backend lo rechaza, puede estar expirado o ser inválido
      console.warn(`⚠️ [API] Token rechazado por el backend para ${endpoint}`);
      console.warn(`⚠️ [API] Token usado: ${token.substring(0, 20)}...`);
      // Limpiar token inválido y forzar re-login
      if (endpoint.includes('/delivery/')) {
        localStorage.removeItem('driverToken');
        localStorage.removeItem('delivery_driver_session');
      }
      throw new Error('Token inválido o expirado. Por favor, inicia sesión nuevamente.');
    }
    
    // Construir mensaje de error con detalles si están disponibles
    let errorMessage = errorData.error || `HTTP ${response.status}`;
    if (errorData.details) {
      errorMessage += `: ${errorData.details.message || JSON.stringify(errorData.details)}`;
    }
    
    const error = new Error(errorMessage);
    // Agregar detalles al error para debugging
    (error as any).details = errorData.details;
    (error as any).status = response.status;
    throw error;
  }

  // Parsear JSON de forma segura
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error(`❌ [API] Error al parsear JSON de ${endpoint}:`, parseError);
    console.error(`❌ [API] Respuesta recibida:`, responseText.substring(0, 500));
    throw new Error(`Respuesta inválida del servidor: ${responseText.substring(0, 100)}`);
  }
}

// Categorías
export const categoriesApi = {
  getAll: () => request('/categories'),
  create: (data: any) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/categories/${id}`, { method: 'DELETE' }),
};

// Insumos (Ingredients)
export const ingredientsApi = {
  getAll: () => request('/ingredients'),
  create: (data: any) => request('/ingredients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/ingredients/${id}`, { method: 'DELETE' }),
};

// Recetas
export const recipesApi = {
  getAll: () => request('/recipes'),
  getByProductId: (productId: string) => request(`/recipes/product/${productId}`),
  create: (data: any) => request('/recipes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/recipes/${id}`, { method: 'DELETE' }),
};

// Productos
export const productsApi = {
  getAll: () => request('/products'),
  create: (data: any) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
};

// Opciones de Producto
export const productOptionsApi = {
  getCategories: (productId: string) => request(`/product-option-categories?productId=${productId}`),
  createCategory: (data: any) => request('/product-option-categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => request(`/product-option-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request(`/product-option-categories/${id}`, { method: 'DELETE' }),
  getOptions: (categoryId: string) => request(`/product-options?categoryId=${categoryId}`),
  createOption: (data: any) => request('/product-options', { method: 'POST', body: JSON.stringify(data) }),
  updateOption: (id: string, data: any) => request(`/product-options/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOption: (id: string) => request(`/product-options/${id}`, { method: 'DELETE' }),
};

// Pedidos
export const ordersApi = {
  getAll: () => request('/orders'),
  getById: (id: string) => request(`/orders/${id}`),
  create: (data: any) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/orders/${id}`, { method: 'DELETE' }),
  approve: (id: string) => request(`/orders/${id}/approve`, { method: 'POST' }),
  reject: (id: string, reason?: string) => request(`/orders/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cancel: (id: string) => request(`/orders/${id}/cancel`, { method: 'POST' }),
};

// Mensajes del Bot
export const botMessagesApi = {
  getAll: () => request('/bot-messages'),
  create: (data: any) => request('/bot-messages', { method: 'POST', body: JSON.stringify(data) }),
  createMany: (data: any[]) => request('/bot-messages/bulk', { method: 'POST', body: JSON.stringify({ messages: data }) }),
  update: (id: string, data: any) => request(`/bot-messages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAll: () => request('/bot-messages/all', { method: 'DELETE' }),
};

// Mensajes de WhatsApp
export const whatsappMessagesApi = {
  getByOrder: (orderId: string) => request(`/whatsapp-messages?orderId=${orderId}`),
};

// Transferencias Pendientes
export const transfersApi = {
  getPending: () => request('/pending-transfers'),
  update: (id: string, data: any) => request(`/pending-transfers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// Repartidores
export const deliveryPersonsApi = {
  getAll: () => request('/delivery-persons'),
  create: (data: any) => request('/delivery-persons', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/delivery-persons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  acceptOrder: (id: string, orderId: string) => request(`/delivery-persons/${id}/accept-order`, { method: 'POST', body: JSON.stringify({ order_id: orderId }) }),
  deliverOrder: (id: string, orderId: string, deliveryCode: string) => request(`/delivery-persons/${id}/deliver-order`, { method: 'POST', body: JSON.stringify({ order_id: orderId, delivery_code: deliveryCode }) }),
};

// Delivery App (Repartidor)
export const deliveryApi = {
  login: (username: string, password: string) => request('/delivery/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  updateLocation: (driverId: string, lat: number, lng: number) => request('/delivery/location', { method: 'POST', body: JSON.stringify({ driver_id: driverId, lat, lng }) }),
  getAvailableOrders: () => request('/delivery/available-orders'),
  acceptOrder: (driverId: string, orderId: string) => request('/delivery/accept-order', { method: 'POST', body: JSON.stringify({ driver_id: driverId, order_id: orderId }) }),
  updateOrderStatus: (driverId: string, orderId: string, status: string) => request('/delivery/update-order-status', { method: 'POST', body: JSON.stringify({ driver_id: driverId, order_id: orderId, status }) }),
  deliverOrder: (driverId: string, orderId: string, deliveryCode: string) => request('/delivery/deliver-order', { method: 'POST', body: JSON.stringify({ driver_id: driverId, order_id: orderId, delivery_code: deliveryCode }) }),
  cancelDelivery: (driverId: string, orderId: string, reason: string, notes?: string) => request('/delivery/cancel-delivery', { method: 'POST', body: JSON.stringify({ driver_id: driverId, order_id: orderId, reason, notes }) }),
  getBalance: (driverId: string) => request(`/delivery/balance/${driverId}`),
  getDriversLocation: () => request('/delivery/drivers-location'),
  registerPayment: (driverId: string, amount: number, reference?: string) => request('/delivery/register-payment', { method: 'POST', body: JSON.stringify({ driver_id: driverId, amount, reference }) }),
};

// Tracking
export const trackingApi = {
  getByToken: (token: string) => request(`/track/${token}`),
};

// Clientes
export const customersApi = {
  getAll: () => request('/customers'),
  create: (data: any) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// Admin
export const adminApi = {
  clearAll: () => request('/admin/clear-all', { method: 'POST' }),
  clearRateLimit: () => request('/admin/clear-rate-limit', { method: 'POST' }),
};

// Extras globales
export const extrasApi = {
  getAll: () => request('/extras'),
  create: (data: any) => request('/extras', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/extras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/extras/${id}`, { method: 'DELETE' }),
};

// Compatibilidad con código existente (simula Supabase)
export const supabase = {
  from: (table: string) => ({
    select: (columns?: string) => ({
      eq: (column: string, value: any) => ({
        in: (inColumn: string, inValues: any[]) => ({
          order: (orderBy: string) => ({
            then: async (callback: (result: { data: any; error: any }) => void) => {
              try {
                let data;
                if (table === 'categories') data = await categoriesApi.getAll();
                else if (table === 'products') data = await productsApi.getAll();
                else if (table === 'orders') data = await ordersApi.getAll();
                else if (table === 'bot_messages') data = await botMessagesApi.getAll();
                else if (table === 'pending_transfers') data = await transfersApi.getPending();
                else data = [];
                
                // Filtrar por eq y in
                let filtered = value ? data.filter((item: any) => item[column] === value) : data;
                if (inValues && inValues.length > 0) {
                  filtered = filtered.filter((item: any) => inValues.includes(item[inColumn]));
                }
                callback({ data: filtered, error: null });
              } catch (error: any) {
                callback({ data: null, error: { message: error.message } });
              }
            }
          }),
          then: async (callback: (result: { data: any; error: any }) => void) => {
            try {
              let data;
              if (table === 'categories') data = await categoriesApi.getAll();
              else if (table === 'products') data = await productsApi.getAll();
              else if (table === 'orders') data = await ordersApi.getAll();
              else data = [];
              
              // Filtrar por in
              const filtered = inValues && inValues.length > 0 
                ? data.filter((item: any) => inValues.includes(item[inColumn]))
                : data;
              callback({ data: filtered, error: null });
            } catch (error: any) {
              callback({ data: null, error: { message: error.message } });
            }
          }
        }),
        order: (orderBy: string) => ({
          then: async (callback: (result: { data: any; error: any }) => void) => {
            try {
              let data;
              if (table === 'categories') data = await categoriesApi.getAll();
              else if (table === 'products') data = await productsApi.getAll();
              else if (table === 'orders') data = await ordersApi.getAll();
              else if (table === 'bot_messages') data = await botMessagesApi.getAll();
              else if (table === 'pending_transfers') data = await transfersApi.getPending();
              else data = [];
              
              // Filtrar por eq si es necesario
              const filtered = value ? data.filter((item: any) => item[column] === value) : data;
              callback({ data: filtered, error: null });
            } catch (error: any) {
              callback({ data: null, error: { message: error.message } });
            }
          }
        }),
        then: async (callback: (result: { data: any; error: any }) => void) => {
          try {
            let data;
            if (table === 'categories') data = await categoriesApi.getAll();
            else if (table === 'products') data = await productsApi.getAll();
            else if (table === 'orders') data = await ordersApi.getAll();
            else data = [];
            
            // Filtrar por eq
            const filtered = value ? data.filter((item: any) => item[column] === value) : data;
            callback({ data: filtered, error: null });
          } catch (error: any) {
            callback({ data: null, error: { message: error.message } });
          }
        }
      }),
      in: (column: string, values: any[]) => ({
        order: (orderBy: string) => ({
          then: async (callback: (result: { data: any; error: any }) => void) => {
            try {
              let data;
              if (table === 'categories') data = await categoriesApi.getAll();
              else if (table === 'products') data = await productsApi.getAll();
              else if (table === 'orders') data = await ordersApi.getAll();
              else data = [];
              
              // Filtrar por in
              const filtered = values && values.length > 0 
                ? data.filter((item: any) => values.includes(item[column]))
                : data;
              callback({ data: filtered, error: null });
            } catch (error: any) {
              callback({ data: null, error: { message: error.message } });
            }
          }
        }),
        then: async (callback: (result: { data: any; error: any }) => void) => {
          try {
            let data;
            if (table === 'categories') data = await categoriesApi.getAll();
            else if (table === 'products') data = await productsApi.getAll();
            else if (table === 'orders') data = await ordersApi.getAll();
            else data = [];
            
            // Filtrar por in
            const filtered = values && values.length > 0 
              ? data.filter((item: any) => values.includes(item[column]))
              : data;
            callback({ data: filtered, error: null });
          } catch (error: any) {
            callback({ data: null, error: { message: error.message } });
          }
        }
      }),
      order: (orderBy: string) => ({
        then: async (callback: (result: { data: any; error: any }) => void) => {
          try {
            let data;
            if (table === 'categories') data = await categoriesApi.getAll();
            else if (table === 'products') data = await productsApi.getAll();
            else if (table === 'orders') data = await ordersApi.getAll();
            else data = [];
            callback({ data, error: null });
          } catch (error: any) {
            callback({ data: null, error: { message: error.message } });
          }
        }
      }),
      then: async (callback: (result: { data: any; error: any }) => void) => {
        try {
          let data;
          if (table === 'categories') data = await categoriesApi.getAll();
          else if (table === 'products') data = await productsApi.getAll();
          else if (table === 'orders') data = await ordersApi.getAll();
          else data = [];
          callback({ data, error: null });
        } catch (error: any) {
          callback({ data: null, error: { message: error.message } });
        }
      }
    }),
    insert: (data: any) => ({
      then: async (callback: (result: { data: any; error: any }) => void) => {
        try {
          let result;
          if (table === 'categories') result = await categoriesApi.create(data);
          else if (table === 'products') result = await productsApi.create(data);
          else if (table === 'orders') result = await ordersApi.create(data);
          else result = data;
          callback({ data: result, error: null });
        } catch (error: any) {
          callback({ data: null, error: { message: error.message } });
        }
      }
    }),
    update: (data: any) => ({
      eq: (column: string, value: any) => ({
        then: async (callback: (result: { data: any; error: any }) => void) => {
          try {
            let result;
            if (table === 'categories') result = await categoriesApi.update(value, data);
            else if (table === 'products') result = await productsApi.update(value, data);
            else if (table === 'orders') result = await ordersApi.update(value, data);
            else result = data;
            callback({ data: result, error: null });
          } catch (error: any) {
            callback({ data: null, error: { message: error.message } });
          }
        }
      })
    }),
    delete: () => ({
      eq: (column: string, value: any) => ({
        then: async (callback: (result: { data: any; error: any }) => void) => {
          try {
            if (table === 'categories') await categoriesApi.delete(value);
            else if (table === 'products') await productsApi.delete(value);
            callback({ data: null, error: null });
          } catch (error: any) {
            callback({ data: null, error: { message: error.message } });
          }
        }
      })
    })
  })
};

// System API
export const systemApi = {
  getStatus: () => request('/system/status'),
  getLogs: (service: string, lines: number = 50) => request(`/system/logs/${service}?lines=${lines}`),
  disconnectWhatsApp: () => request('/system/whatsapp/disconnect', { method: 'POST' }),
  restartService: (service: 'backend' | 'whatsapp-bot' | 'all') => request(`/system/restart/${service}`, { method: 'POST' })
};

