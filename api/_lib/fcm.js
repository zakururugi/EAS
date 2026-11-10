/**
 * Firebase Cloud Messaging helper for sending push notifications.
 * Uses the firebase-admin SDK.
 */

import admin from 'firebase-admin';

let app = null;

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
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  return app;
}

export async function sendMulticastNotification(
  tokens,
  { title, body, icon, click_action, ...customData }
) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, responses: [] };
  }

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
        Object.entries(customData).map(([key, value]) => [key, String(value ?? '')])
      ),
    },
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
      headers: { Urgency: 'high' },
      notification: {
        vibrate: [200, 100, 200],
        requireInteraction: true,
      },
      fcm_options: { link: click_action || '/' },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses.map((result) => ({
        success: result.success,
        messageId: result.messageId || null,
        code: result.error?.code || null,
        error: result.error?.message || null,
      })),
    };
  } catch (err) {
    console.error('[FCM] Error sending multicast notification:', err.message);
    throw err;
  }
}

/**
 * Build a notification from either the normalized PHIVOLCS shape
 * (magnitude) or a USGS-compatible shape (mag).
 */
export function buildEarthquakeNotification(event, zoneName = 'your watch zone') {
  const rawMagnitude = event?.magnitude ?? event?.mag;
  const magnitude = Number(rawMagnitude);
  const magLabel = Number.isFinite(magnitude) ? magnitude.toFixed(1) : '?';
  const place = event?.place || 'Unknown location';
  const timestamp = Number(event?.time);
  const time = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
    : 'Time unavailable';

  return {
    title: `🔴 M${magLabel} Earthquake!`,
    body: `${place} — ${time}\nZone: ${zoneName}`,
    icon: '/icons/icon-192x192.png',
    click_action: '/',
    event_id: event?.id || event?.eventId || event?.code || '',
    magnitude: Number.isFinite(magnitude) ? magnitude.toFixed(1) : '',
    place,
    time: String(timestamp || ''),
    zone: zoneName,
  };
}
