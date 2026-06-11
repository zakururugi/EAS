/**
 * Firebase Cloud Messaging helper for sending push notifications.
 * Uses the firebase-admin SDK.
 */

import admin from 'firebase-admin';

let app = null;

/**
 * Initialize Firebase Admin SDK (singleton pattern for serverless).
 */
function getApp() {
  if (app) return app;

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing FCM environment variables. Required: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY'
    );
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      // Handle escaped newlines in environment variable
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  return app;
}

/**
 * Send push notification to multiple devices (FCM multicast).
 *
 * @param {string[]} tokens - Array of FCM registration tokens
 * @param {Object} data - Notification payload
 * @param {string} data.title - Notification title
 * @param {string} data.body - Notification body
 * @param {string} [data.icon] - Notification icon URL
 * @param {string} [data.click_action] - URL to open on click
 * @param {Object} [data.customData] - Additional data payload
 * @returns {Promise<Object>} - FCM send response
 */
export async function sendMulticastNotification(tokens, { title, body, icon, click_action, ...customData }) {
  const messaging = getApp().messaging();

  const message = {
    tokens,
    notification: {
      title,
      body,
      ...(icon && { imageUrl: icon }),
    },
    data: {
      title,
      body,
      ...(icon && { icon }),
      ...(click_action && { click_action }),
      ...Object.fromEntries(
        Object.entries(customData).map(([k, v]) => [k, String(v)])
      ),
    },
    // High priority for immediate delivery
    android: {
      priority: 'high',
      notification: {
        priority: 'max',
        defaultSound: true,
        channelId: 'earthquake_alerts',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          'content-available': 1,
        },
      },
    },
    webpush: {
      headers: {
        Urgency: 'high',
      },
      notification: {
        vibrate: [200, 100, 200],
        requireInteraction: true,
      },
      fcm_options: {
        link: click_action || '/',
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses.map((r) => ({
        success: r.success,
        error: r.error?.message || null,
      })),
    };
  } catch (err) {
    console.error('[FCM] Error sending multicast notification:', err.message);
    throw err;
  }
}

/**
 * Build notification payload for an earthquake event.
 *
 * @param {Object} event - USGS earthquake event properties
 * @param {string} zoneName - Name of the watch zone that triggered
 * @returns {Object} - Formatted notification payload
 */
export function buildEarthquakeNotification(event, zoneName = 'your watch zone') {
  const mag = event.mag?.toFixed(1) || '?';
  const place = event.place || 'Unknown location';
  const time = new Date(event.time).toLocaleString();

  return {
    title: `🔴 M${mag} Earthquake!`,
    body: `${place} — ${time}\nZone: ${zoneName}`,
    icon: '/icons/icon-192x192.png',
    click_action: `/`,
    event_id: event.id || event.code || '',
    magnitude: String(event.mag || ''),
    place,
    time: String(event.time || ''),
    zone: zoneName,
  };
}