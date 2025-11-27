/**
 * Service Worker para PWA
 * Maneja cache, offline y push notifications
 */

const CACHE_NAME = 'pedidos-app-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo-negocios-app.svg',
];

// Instalar service worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Cacheando assets estáticos');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  // Activar inmediatamente
  self.skipWaiting();
});

// Activar service worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activado');
  
  // Limpiar caches antiguos
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('🗑️ Eliminando cache antiguo:', name);
            return caches.delete(name);
          })
      );
    })
  );
  
  // Tomar control de todas las páginas
  self.clients.claim();
});

// Interceptar requests
self.addEventListener('fetch', (event) => {
  // Solo cachear GET requests
  if (event.request.method !== 'GET') return;
  
  // No cachear API calls
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Network first, fallback to cache
      return fetch(event.request)
        .then((networkResponse) => {
          // Guardar en cache si es válido
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falla la red, usar cache
          return cachedResponse || new Response('Offline', { status: 503 });
        });
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('📬 Push recibido');
  
  let data = {
    title: 'Nueva notificación',
    body: 'Tienes una nueva actualización',
    icon: '/logo-negocios-app.svg',
    badge: '/logo-negocios-app.svg',
    tag: 'default',
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Click en notificación');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Buscar ventana existente
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Abrir nueva ventana
        return clients.openWindow(urlToOpen);
      })
  );
});

// Background sync (para pedidos offline)
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  // Obtener pedidos pendientes del IndexedDB
  // y enviarlos al servidor
  console.log('Sincronizando pedidos pendientes...');
}

