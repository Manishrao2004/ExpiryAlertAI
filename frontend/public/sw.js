/* ExpiryAlert AI – Service Worker */
const CACHE_NAME = 'expiry-alert-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/badge-96.png'];

// 
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail on dev – assets may not exist yet
      });
    }).then(() => self.skipWaiting())
  );
});

// 
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API calls (let them fail naturally)
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for HTML navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp.ok && !url.pathname.startsWith('/uploads/')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// 
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = {
    title: 'ExpiryAlert AI',
    body: 'You have an expiry alert!',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: 'expiry-default',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch (_) {}
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-96.png',
    tag: data.tag || 'expiry-alert',
    data: data.data || { url: '/' },
    requireInteraction: data.urgency === 'high',
    silent: false,
    vibrate: data.urgency === 'high' ? [200, 100, 200, 100, 200] : [200, 100, 200],
    actions: data.actions || [
      { action: 'view', title: '👀 View Items', icon: '/icon-96.png' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// 
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});
