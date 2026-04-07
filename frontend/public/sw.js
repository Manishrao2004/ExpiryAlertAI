/* ExpiryAlert AI – Service Worker */
const CACHE_NAME = 'expiry-alert-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/badge-96.png'];

// ─── Install: cache static assets ────────────────────────────────────────────
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

// ─── Activate: cleanup old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first for API, cache-first for assets ────────────────────
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

// ─── Push: receive and display notification ───────────────────────────────────
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

// ─── Notification Click ───────────────────────────────────────────────────────
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

// ─── Notification Close ───────────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

// ─── Periodic Sync (if supported) ─────────────────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'expiry-check') {
    event.waitUntil(checkExpiries());
  }
});

async function checkExpiries() {
  try {
    const response = await fetch('/api/items');
    const { items } = await response.json();
    if (!items) return;

    const now = new Date(); now.setHours(0, 0, 0, 0);

    for (const item of items) {
      const exp = new Date(item.expiryDate); exp.setHours(0, 0, 0, 0);
      const diff = Math.floor((exp - now) / 86400000);

      if (diff === 2 || diff === 1 || diff === 0 || diff === -1) {
        const messages = {
          2: { title: `📅 2 Days Left: ${item.name}`, body: `Expires on ${exp.toLocaleDateString()}` },
          1: { title: `⏰ Expires Tomorrow: ${item.name}`, body: 'Plan to use it today!' },
          0: { title: `⚠️ Expires TODAY: ${item.name}`, body: 'Use it now or discard!' },
          [-1]: { title: `🚨 EXPIRED: ${item.name}`, body: 'This item has expired. Please discard.' }
        };
        const msg = messages[diff] || messages[-1];

        await self.registration.showNotification(msg.title, {
          body: msg.body,
          icon: '/icon-192.png',
          badge: '/badge-96.png',
          tag: `local-${item._id}-${diff}`,
          data: { url: '/' },
          vibrate: [200, 100, 200]
        });
      }
    }
  } catch (_) {}
}
