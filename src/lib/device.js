/**
 * Device ID generation and management.
 * Generates a unique device identifier stored in localStorage.
 */

const DEVICE_ID_KEY = 'quake_alert_device_id';

/**
 * Get or create a persistent device ID.
 * Uses crypto.randomUUID() for v4 UUIDs, with fallback.
 *
 * @returns {string} - Stable device identifier
 */
export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate UUID v4
    try {
      deviceId = crypto.randomUUID();
    } catch {
      // Fallback for older browsers
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}