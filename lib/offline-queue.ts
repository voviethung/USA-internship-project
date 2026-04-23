/**
 * Offline queue using IndexedDB.
 * Queues failed API requests when offline and replays them when back online.
 */

const DB_NAME = 'pharma-offline-queue';
const STORE_NAME = 'pending-requests';
const DB_VERSION = 1;

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  body: string; // JSON-serialized
  headers: Record<string, string>;
  timestamp: number;
}

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: {
    register(tag: string): Promise<void>;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Add a failed request to the offline queue */
export async function enqueueRequest(
  url: string,
  method: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const item: QueuedRequest = {
      url,
      method,
      body,
      headers,
      timestamp: Date.now(),
    };

    store.add(item);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();

    // Register background sync if available
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = (await navigator.serviceWorker.ready) as SyncRegistration;
      if (reg.sync) {
        await reg.sync.register('sync-offline-queue');
      }
    }
  } catch (err) {
    console.warn('[offline-queue] Failed to enqueue:', err);
  }
}

/** Get all pending requests */
export async function getPendingRequests(): Promise<QueuedRequest[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return [];
  }
}

/** Remove a request from the queue after successful replay */
async function removeRequest(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Process all queued requests — call when back online */
export async function processQueue(): Promise<{
  success: number;
  failed: number;
}> {
  const pending = await getPendingRequests();
  let success = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        body: item.body,
        headers: item.headers,
      });

      if (response.ok && item.id) {
        await removeRequest(item.id);
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

/** Clear the entire offline queue */
export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  } catch {
    // Ignore errors
  }
}

/** Get the count of pending requests */
export async function getQueueCount(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.count();
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        resolve(0);
      };
    });
  } catch {
    return 0;
  }
}
