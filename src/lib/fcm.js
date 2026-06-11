/**
 * Firebase Cloud Messaging client for the frontend.
 * Handles permission requests, token registration, and incoming messages.
 */

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let messaging = null;
let onMessageCallback = null;

/**
 * Parse the VITE_FIREBASE_CONFIG environment variable.
 * This is a JSON string set at build time via Vercel env vars.
 *
 * Example:
 *   VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"...",...}'
 */
function getFirebaseConfig() {
  const configStr = import.meta.env.VITE_FIREBASE_CONFIG;

  if (!configStr) {
    console.warn(
      '[FCM] VITE_FIREBASE_CONFIG not set. Push notifications will be unavailable.',
      'Set VITE_FIREBASE_CONFIG as a JSON string in your .env or Vercel env vars.'
    );
    return null;
  }

  try {
    return JSON.parse(configStr);
  } catch (err) {
    console.error('[FCM] Failed to parse VITE_FIREBASE_CONFIG:', err.message);
    return null;
  }
}

/**
 * Initialize Firebase app and messaging.
 * Must be called before any other FCM functions.
 *
 * @returns {boolean} - Whether initialization was successful
 */
export function initFirebase() {
  if (messaging) return true;

  const config = getFirebaseConfig();
  if (!config) return false;

  try {
    const app = initializeApp(config);
    messaging = getMessaging(app);

    // Listen for foreground messages
    onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);

      if (onMessageCallback) {
        onMessageCallback(payload);
      } else {
        // Default behavior: show notification
        const { title, body } = payload.notification || {};
        if (title && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/icons/icon-192x192.png',
            requireInteraction: true,
          });
        }
      }
    });

    console.log('[FCM] Firebase initialized successfully');
    return true;
  } catch (err) {
    console.error('[FCM] Firebase initialization failed:', err.message);
    return false;
  }
}

/**
 * Request notification permission and get FCM token.
 *
 * @param {string} vapidKey - VAPID public key from Firebase Console
 *        (Web Push certificates page)
 * @returns {Promise<{ token: string|null, permission: string }>}
 */
export async function requestFcmToken(vapidKey) {
  if (!messaging) {
    const initialized = initFirebase();
    if (!initialized) {
      return { token: null, permission: 'unavailable' };
    }
  }

  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.warn('[FCM] This browser does not support notifications');
    return { token: null, permission: 'unsupported' };
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied');
      return { token: null, permission };
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });

    if (!token) {
      console.warn('[FCM] No token returned (permission may be blocked)');
      return { token: null, permission };
    }

    console.log('[FCM] Token obtained successfully');
    return { token, permission };
  } catch (err) {
    console.error('[FCM] Error getting token:', err.message);
    return { token: null, permission: 'error' };
  }
}

/**
 * Register a callback for foreground messages.
 *
 * @param {Function} callback - Called with (payload) when message arrives
 */
export function onForegroundMessage(callback) {
  onMessageCallback = callback;
}

/**
 * Get the FCM messaging instance (for advanced usage).
 */
export function getMessagingInstance() {
  return messaging;
}