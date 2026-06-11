/**
 * USGS Earthquake API helpers.
 * Fetches and processes earthquake data from the USGS GeoJSON feeds.
 */

const USGS_BASE = 'https://earthquake.usgs.gov';

/**
 * Fetch latest earthquakes from USGS.
 * Default: M4.5+ earthquakes in the last 30 days (all week is also common).
 *
 * @param {Object} [options]
 * @param {string} [options.feed] - USGS feed path (default: 'earthquakes/feed/v1.0/summary/4.5_day.geojson')
 * @returns {Promise<Object>} - Parsed GeoJSON FeatureCollection
 */
export async function fetchLatestEvents(feed = 'earthquakes/feed/v1.0/summary/4.5_day.geojson') {
  const url = `${USGS_BASE}/${feed}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'EarthquakeAlertSystem/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`USGS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Validate expected structure
  if (!data || !data.features || !Array.isArray(data.features)) {
    throw new Error('Invalid USGS response: missing features array');
  }

  return data;
}

/**
 * Fetch event details from USGS by event ID.
 * This returns the full event JSON which includes product data for ShakeMap.
 *
 * @param {string} eventId - USGS event ID (e.g. 'us7000abcdef')
 * @returns {Promise<Object>} - Full event details
 */
export async function fetchEventDetails(eventId) {
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('eventId is required and must be a string');
  }

  const url = `${USGS_BASE}/fdsnws/event/1/query?eventid=${encodeURIComponent(eventId)}&format=geojson`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'EarthquakeAlertSystem/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`USGS event detail error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Extract the ShakeMap cont_mi.json URL from an event's products.
 * ShakeMap contour files are typically found under the 'shakemap' product type.
 *
 * @param {Object} event - Full USGS event object (from fetchEventDetails).
 * @returns {string|null} - URL to cont_mi.json, or null if not available.
 */
export function findShakeMapContourUrl(event) {
  if (!event || !event.properties || !event.properties.products) {
    return null;
  }

  const shakemapProducts = event.properties.products.shakemap;

  if (!shakemapProducts || shakemapProducts.length === 0) {
    return null;
  }

  // Get the most recent ShakeMap product (first in array is typically latest)
  const latestShakeMap = shakemapProducts[0];

  if (!latestShakeMap.contents) {
    return null;
  }

  // Look for cont_mi.json (intensity contours in miles)
  const contourKey = Object.keys(latestShakeMap.contents).find(
    (key) => key.includes('cont_mi.json') || key.includes('cont_mi.geojson')
  );

  if (contourKey) {
    return latestShakeMap.contents[contourKey].url;
  }

  // Fallback: look for any contour JSON file
  const fallbackKey = Object.keys(latestShakeMap.contents).find(
    (key) => key.includes('cont') && key.endsWith('.json')
  );

  return fallbackKey ? latestShakeMap.contents[fallbackKey].url : null;
}

/**
 * Extract properties from a USGS feature for simplified representation.
 *
 * @param {Object} feature - USGS GeoJSON feature
 * @returns {Object} - Simplified event object
 */
export function simplifyEvent(feature) {
  const props = feature.properties;
  const coords = feature.geometry?.coordinates || [];

  return {
    id: props.code || props.net + props.code,
    eventId: props.code || props.net + props.code,
    magnitude: props.mag,
    place: props.place,
    time: props.time,
    updated: props.updated,
    depth: coords[2] || 0,
    latitude: coords[1] || 0,
    longitude: coords[0] || 0,
    url: props.url,
    detail: props.detail,
    felt: props.felt || 0,
    cdi: props.cdi || null,
    mmi: props.mmi || null,
    alert: props.alert || null,
    tsunami: props.tsunami || 0,
    sig: props.sig || 0,  // significance
    sources: props.sources || '',
    status: props.status || '',
  };
}