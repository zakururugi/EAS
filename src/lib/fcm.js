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
 */
function getFirebaseConfig() {
  const configStr = import.meta.env.VITE_FIREBASE_CONFIG;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  // Debug logging
  console.log('[FCM] Checking env vars:');
  console.log('[FCM]   VITE_FIREBASE_CONFIG exists:', !!configStr);
  console.log('[FCM]   VITE_FIREBASE_CONFIG length:', configStr?.length || 0);
  console.log('[FCM]   VITE_FIREBASE_VAPID_KEY exists:', !!vapidKey);
  console.log('[FCM]   VITE_FIREBASE_VAPID_KEY length:', vapidKey?.length || 0);

  if (!configStr) {
    console.warn(
      '[FCM] VITE_FIREBASE_CONFIG not set. Trying fallback config...',
      'Set VITE_FIREBASE_CONFIG as a JSON string in your .env or Vercel env vars.'
    );
    // Fallback: try to build config from individual env vars
    const fallback = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
    if (fallback.apiKey && fallback.projectId) {
      console.log('[FCM] Using fallback config. Project:', fallback.projectId);
      return fallback;
    }
    console.error('[FCM] No Firebase config available. Push notifications will not work.');
    return null;
  }

  try {
    const parsed = JSON.parse(configStr);
    console.log('[FCM] Firebase config parsed successfully. Project:', parsed.projectId);
    return parsed;
  } catch (err) {
    console.error('[FCM] Failed to parse VITE_FIREBASE_CONFIG:', err.message);
    return null;
  }
}

/**
 * Initialize Firebase app and messaging.
 */
export function initFirebase() {
  if (messaging) return true;

  const config = getFirebaseConfig();
  if (!config) return false;

  try {
    const app = initializeApp(config);
    messaging = getMessaging(app);
    console.log('[FCM] Firebase initialized successfully. Project:', config.projectId);

    onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      if (onMessageCallback) {
        onMessageCallback(payload);
      } else {
        const { title, body } = payload.notification || {};
        if (title && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, {
            body, icon: '/icons/icon-192x192.png', requireInteraction: true,
          });
        }
      }
    });

    return true;
  } catch (err) {
    console.error('[FCM] Firebase initialization failed:', err.message);
    return false;
  }
}

/**
 * Request notification permission and get FCM token.
 */
export async function requestFcmToken(vapidKey) {
  if (!messaging) {
    const initialized = initFirebase();
    if (!initialized) {
      console.error('[FCM] Cannot get token: Firebase not initialized. Check VITE_FIREBASE_CONFIG');
      return { token: null, permission: 'unavailable' };
    }
  }

  if (!('Notification' in window)) {
    console.warn('[FCM] This browser does not support notifications');
    return { token: null, permission: 'unsupported' };
  }

  if (!vapidKey) {
    console.error('[FCM] VAPID key is empty! Cannot get FCM token.');
    console.error('[FCM] Set VITE_FIREBASE_VAPID_KEY in your environment variables.');
    return { token: null, permission: 'no_vapid' };
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[FCM] Notification permission result:', permission);

    if (permission !== 'granted') {
      return { token: null, permission };
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });

    if (!token) {
      console.warn('[FCM] No token returned (permission may be blocked)');
      return { token: null, permission };
    }

    console.log('[FCM] Token obtained successfully, length:', token.length);
    return { token, permission };
  } catch (err) {
    console.error('[FCM] Error getting token:', err.message);
    return { token: null, permission: 'error' };
  }
}

export function onForegroundMessage(callback) {
  onMessageCallback = callback;
}

export function getMessagingInstance() {
  return messaging;
}