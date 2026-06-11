/**
 * Firebase Messaging Service Worker
 * 
 * This service worker handles:
 * - Background push messages from Firebase Cloud Messaging
 * - Caching of static assets for offline use (via workbox in vite.config.js)
 *
 * IMPORTANT: Replace the Firebase config placeholders below with your actual
 * Firebase project configuration from the Firebase Console.
 *
 * @see https://firebase.google.com/docs/cloud-messaging/js/receive
 */

// ============================================================
// Firebase Configuration
// Replace these placeholders with your actual Firebase config.
// In production, you can also inject these via Vite build or
// Vercel environment variables.
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Import Firebase scripts using importScripts (standard SW approach)
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp(FIREBASE_CONFIG);

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// ============================================================
// Background Message Handler
// Called when a push message arrives while the app is in the
// background or closed.
// ============================================================
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  // Extract notification data
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Earthquake Alert';
  const notificationBody =
    payload.notification?.body || payload.data?.body || 'An earthquake has been detected.';
  const notificationIcon = payload.notification?.icon || payload.data?.icon || '/icons/icon-192x192.png';
  const clickAction = payload.data?.click_action || '/';

  // Show notification
  const notificationOptions = {
    body: notificationBody,
    icon: notificationIcon,
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200, 100, 400],
    tag: 'earthquake-alert', // Replaces previous notification with same tag
    renotify: true,
    requireInteraction: true,
    data: {
      click_action: clickAction,
      ...payload.data,
    },
    actions: [
      {
        action: 'open',
        title: 'View Details',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================================
// Notification Click Handler
// ============================================================
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);

  const notification = event.notification;
  const action = event.action;

  notification.close();

  // Determine URL to open
  const clickAction = notification.data?.click_action || '/';
  const urlToOpen = new URL(clickAction, self.location.origin).href;

  if (action === 'dismiss') {
    return;
  }

  // Open or focus the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the app
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================================
// Install & Activate (for caching)
// The actual caching is handled by vite-plugin-pwa / workbox.
// Here we just claim clients immediately.
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Installing Service Worker...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Activating Service Worker...');
  event.waitUntil(clients.claim());
});

// ============================================================
// Push Event (fallback for browsers that don't use FCM SW)
// ============================================================
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received:', event);

  // If FCM handled it, this won't be called.
  // If it does get called (e.g., non-FCM push), try to show data.
  if (event.data) {
    try {
      const data = event.data.json();
      const notificationTitle = data.notification?.title || data.title || 'Earthquake Alert';
      const notificationOptions = {
        body: data.notification?.body || data.body || 'An earthquake has been detected.',
        icon: data.notification?.icon || '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        data: data,
      };
      event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
      );
    } catch (err) {
      console.error('[firebase-messaging-sw.js] Error parsing push data:', err);
    }
  }
});