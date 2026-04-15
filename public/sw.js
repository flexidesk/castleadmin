const CACHE_NAME = 'castle-driver-portal-v4';
const OFFLINE_URL = '/driver-portal';

const PRECACHE_URLS = [
  '/driver-portal',
  '/driver-portal/login',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon.svg',
];

// ── Background Sync Queue ─────────────────────────────────────────────────────
const GPS_SYNC_TAG = 'gps-location-sync';
const gpsQueue = [];

// Install: pre-cache key shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Silently fail for resources that may not exist yet
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API/Supabase, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Supabase, external APIs)
  if (url.origin !== self.location.origin) return;

  // Only handle /driver-portal requests — never intercept admin panel or other routes
  if (!url.pathname.startsWith('/driver-portal')) return;

  // Never cache Next.js build artifacts — they change every build and serving
  // stale chunks triggers ChunkLoadError
  if (url.pathname.startsWith('/_next/')) return;

  // For driver-portal pages: network-first with offline fallback
  if (url.pathname.startsWith('/driver-portal')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(
            (cached) =>
              cached ||
              caches.match(OFFLINE_URL) ||
              new Response(
                `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offline — Castle Driver Portal</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; }
  </style>
</head>
<body>
  <div>
    <h1>You're offline</h1>
    <p>Check your connection and try again.</p>
    <button onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>`,
                { headers: { 'Content-Type': 'text/html' } }
              )
          );
        })
    );
    return;
  }

  // Default: stale-while-revalidate for other static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
// Fires when connectivity is restored — flushes queued GPS updates
self.addEventListener('sync', (event) => {
  if (event.tag === GPS_SYNC_TAG) {
    event.waitUntil(flushGpsQueue());
  }
});

async function flushGpsQueue() {
  try {
    const cache = await caches.open('gps-queue-v1');
    const keys = await cache.keys();
    for (const key of keys) {
      const response = await cache.match(key);
      if (!response) continue;
      const payload = await response.json();
      try {
        await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await cache.delete(key);
      } catch {
        // Keep in queue for next sync
      }
    }
  } catch {
    // Silent
  }
}

// ── Message Handler ───────────────────────────────────────────────────────────
// Receives GPS data from the page to queue for background sync
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'QUEUE_GPS_UPDATE') {
    const payload = event.data.payload;
    // Store in cache for background sync
    caches.open('gps-queue-v1').then((cache) => {
      const key = `/gps-queue/${Date.now()}`;
      cache.put(key, new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    // Register background sync if supported
    if (self.registration.sync) {
      self.registration.sync.register(GPS_SYNC_TAG).catch(() => {});
    }
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Castle Driver Portal',
      body: event.data.text(),
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: 'castle-driver',
      data: {},
    };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon.svg',
    badge: payload.badge || '/icons/icon.svg',
    tag: payload.tag || 'castle-driver',
    data: payload.data || {},
    requireInteraction: payload.requireInteraction !== undefined ? payload.requireInteraction : true,
    actions: payload.actions || [],
    vibrate: [200, 100, 200, 100, 200],
    renotify: true,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Castle Driver Portal', options)
  );
});

// ── Notification Click ────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/driver-portal';

  if (data.orderId) {
    url = `/driver-portal?order=${data.orderId}`;
  } else if (data.url) {
    url = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ── Notification Close ────────────────────────────────────────────────────────

self.addEventListener('notificationclose', (event) => {
  // Track dismissed notifications if needed
  const data = event.notification.data || {};
  if (data.trackDismiss) {
    // Could send analytics here
  }
});

// ── Periodic Background Sync (Android Chrome) ─────────────────────────────────
// Allows background GPS updates even when app is not in foreground
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'gps-periodic-sync') {
    event.waitUntil(flushGpsQueue());
  }
});
