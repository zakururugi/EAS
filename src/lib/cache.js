/**
 * Offline cache for earthquake data.
 * Uses IndexedDB via a simple wrapper for storing and retrieving
 * recent events and ShakeMap data when the network is unavailable.
 */

const DB_NAME = 'quake-alert-cache';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const SHAKEMAP_STORE = 'shakemaps';
const MAX_EVENTS = 100;
const MAX_SHAKEMAPS = 5;

let db = null;

/**
 * Open the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        const store = database.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
        store.createIndex('time', 'time', { unique: false });
      }

      if (!database.objectStoreNames.contains(SHAKEMAP_STORE)) {
        database.createObjectStore(SHAKEMAP_STORE, { keyPath: 'eventId' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.warn('[Cache] IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Save earthquake events to the cache.
 * @param {Array} events - Array of event objects
 */
export async function cacheEvents(events) {
  try {
    const database = await openDB();
    const tx = database.transaction(EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(EVENTS_STORE);

    // Clear old events beyond the limit
    const count = await new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
    });

    if (count + events.length > MAX_EVENTS) {
      // Get oldest entries and delete them
      const index = store.index('time');
      const range = IDBKeyRange.upperBound(Date.now());
      const cursorReq = index.openCursor(range);
      let deleted = 0;
      const toDelete = count + events.length - MAX_EVENTS;

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && deleted < toDelete) {
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        }
      };
    }

    // Save events
    for (const event of events) {
      store.put(event);
    }

    await new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Silently fail
    });
  } catch (err) {
    console.warn('[Cache] Failed to cache events:', err.message);
  }
}

/**
 * Load cached earthquake events.
 * @returns {Promise<Array>} - Cached events, newest first
 */
export async function loadCachedEvents() {
  try {
    const database = await openDB();
    const tx = database.transaction(EVENTS_STORE, 'readonly');
    const store = tx.objectStore(EVENTS_STORE);
    const index = store.index('time');

    const events = await new Promise((resolve) => {
      const results = [];
      const req = index.openCursor(null, 'prev'); // Newest first
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve(results);
    });

    return events;
  } catch (err) {
    console.warn('[Cache] Failed to load cached events:', err.message);
    return [];
  }
}

/**
 * Cache ShakeMap contour data for an event.
 * @param {string} eventId
 * @param {Object} contours - ShakeMap GeoJSON
 */
export async function cacheShakeMap(eventId, contours) {
  try {
    const database = await openDB();
    const tx = database.transaction(SHAKEMAP_STORE, 'readwrite');
    const store = tx.objectStore(SHAKEMAP_STORE);

    // Check current count
    const count = await new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
    });

    if (count >= MAX_SHAKEMAPS) {
      // Delete oldest entry (first key)
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.key);
        }
      };
    }

    store.put({ eventId, data: contours, cachedAt: Date.now() });

    await new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[Cache] Failed to cache ShakeMap:', err.message);
  }
}

/**
 * Load cached ShakeMap contours for an event.
 * @param {string} eventId
 * @returns {Promise<Object|null>}
 */
export async function loadCachedShakeMap(eventId) {
  try {
    const database = await openDB();
    const tx = database.transaction(SHAKEMAP_STORE, 'readonly');
    const store = tx.objectStore(SHAKEMAP_STORE);

    const result = await new Promise((resolve) => {
      const req = store.get(eventId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    return result?.data || null;
  } catch (err) {
    return null;
  }
}

/**
 * Check if the browser is currently online.
 * @returns {boolean}
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Register an event listener for online/offline status changes.
 * @param {Function} onOnline - Called when connection restored
 * @param {Function} onOffline - Called when connection lost
 * @returns {Function} - Cleanup function
 */
export function onNetworkChange(onOnline, onOffline) {
  const handleOnline = () => onOnline?.();
  const handleOffline = () => onOffline?.();

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}