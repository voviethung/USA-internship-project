// Pharma Voice Assistant — service worker
// Keep only background sync/message support. Do not intercept page requests.

const CACHE_PREFIX = 'pharma-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Clear old PWA caches from earlier versions that intercepted page navigations.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

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
