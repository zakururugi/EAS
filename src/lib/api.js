/**
 * API client for communicating with the backend serverless functions.
 * All API paths are relative (same origin) since we use Vercel rewrites.
 */

const BASE = '/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.details || `HTTP ${response.status}`);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error('Network error: unable to reach the server');
    }
    throw err;
  }
}

// ============================================================
// Earthquake Events
// ============================================================

/**
 * Fetch latest earthquakes from the proxy API.
 *
 * @param {Object} [params]
 * @param {number} [params.minMagnitude] - Filter by minimum magnitude
 * @param {number} [params.limit] - Max results
 * @returns {Promise<Object>} - { type, metadata, events }
 */
export async function fetchLatestEvents({ minMagnitude, limit } = {}) {
  const params = new URLSearchParams();
  if (minMagnitude) params.set('min_magnitude', String(minMagnitude));
  if (limit) params.set('limit', String(limit));

  const query = params.toString();
  return request(`/events/latest${query ? `?${query}` : ''}`);
}

/**
 * Fetch event details including ShakeMap URL.
 *
 * @param {string} eventId - USGS event ID
 * @returns {Promise<Object>} - Enhanced event object
 */
export async function fetchEventDetails(eventId) {
  return request(`/events/${encodeURIComponent(eventId)}`);
}

/**
 * Fetch ShakeMap intensity contours for an event.
 *
 * @param {string} eventId - USGS event ID
 * @returns {Promise<Object>} - ShakeMap cont_mi.json GeoJSON
 */
export async function fetchEventContours(eventId) {
  return request(`/events/${encodeURIComponent(eventId)}/contours`);
}

// ============================================================
// Push Notifications
// ============================================================

/**
 * Subscribe a device to push notifications.
 *
 * @param {string} deviceId - Device identifier
 * @param {string} fcmToken - FCM registration token
 * @param {string} [deviceInfo] - Browser/device info string
 */
export async function subscribePush(deviceId, fcmToken, deviceInfo) {
  return request('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      fcm_token: fcmToken,
      device_info: deviceInfo,
    }),
  });
}

/**
 * Unsubscribe a device from push notifications.
 *
 * @param {string} fcmToken - FCM registration token
 */
export async function unsubscribePush(fcmToken) {
  // Use POST with body since DELETE with body isn't well supported
  return request('/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ fcm_token: fcmToken }),
  });
}

// ============================================================
// Watch Zones
// ============================================================

/**
 * Get all watch zones for a device.
 *
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object>} - { zones: [...] }
 */
export async function fetchZones(deviceId) {
  return request(`/zones?device_id=${encodeURIComponent(deviceId)}`);
}

/**
 * Create or update a watch zone.
 *
 * @param {Object} zone
 * @param {string} zone.deviceId
 * @param {string} [zone.name] - Zone name
 * @param {Array<[number, number]>} zone.polygon - Array of [lon, lat] coordinates
 * @param {number} [zone.minMagnitude] - Minimum magnitude for alerts
 * @returns {Promise<Object>}
 */
export async function createZone({ deviceId, name, polygon, minMagnitude }) {
  return request('/zones', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      name,
      polygon,
      min_magnitude: minMagnitude,
    }),
  });
}

/**
 * Delete a watch zone.
 *
 * @param {string} zoneId
 */
export async function deleteZone(zoneId) {
  return request(`/zones?zone_id=${encodeURIComponent(zoneId)}`, {
    method: 'DELETE',
  });
}