// Pharma Voice Assistant — Enhanced Service Worker v3
// Strategies: Cache-first for static, Stale-while-revalidate for pages

const STATIC_CACHE = 'pharma-static-v3';
const DYNAMIC_CACHE = 'pharma-dynamic-v3';

// Static assets to pre-cache
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// File extensions that should use cache-first strategy
const STATIC_EXTENSIONS = /\.(js|css|svg|png|jpg|jpeg|gif|webp|woff2?|ico)$/;

// ── Install: Pre-cache static assets ────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: Clean old caches ──────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Smart caching strategies ─────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API, and auth requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // Strategy 1: Cache-first for static assets
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 2: Stale-while-revalidate for pages
  event.respondWith(staleWhileRevalidate(request));
});

// ── Cache-first strategy ────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

// ── Stale-while-revalidate strategy ─────────────────────
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached version immediately if available
  if (cached) {
    fetchPromise; // background revalidation
    return cached;
  }

  // No cache — wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  // Absolute fallback
  const fallback = await caches.match('/');
  return fallback || new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/html' },
  });
}

// ── Handle background sync for offline queue ────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
    });
  } catch (err) {
    console.error('[SW] Failed to process offline queue:', err);
  }
}

// ── Handle messages from main thread ────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    );
  }
});
