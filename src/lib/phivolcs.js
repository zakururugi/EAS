/**
 * PHIVOLCS earthquake data feed integration.
 * Uses a free community API that mirrors PHIVOLCS earthquake data.
 *
 * The API is open and does not require authentication.
 */

const PHIVOLCS_API = 'https://incident-ph-api.onrender.com/api/phivolcs/earthquakes';

/**
 * Fetch latest earthquakes from PHIVOLCS.
 *
 * @returns {Promise<Array>} - Array of simplified event objects matching USGS format
 */
export async function fetchPHIVOLCSEarthquakes() {
  const response = await fetch(PHIVOLCS_API, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'EarthquakeAlertSystem/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`PHIVOLCS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // PHIVOLCS API may return different structures. Handle common patterns:
  // Case 1: { earthquakes: [...], ... }
  // Case 2: { data: [...], ... }
  // Case 3: raw array
  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data.earthquakes && Array.isArray(data.earthquakes)) {
    items = data.earthquakes;
  } else if (data.data && Array.isArray(data.data)) {
    items = data.data;
  } else if (data.features && Array.isArray(data.features)) {
    // GeoJSON FeatureCollection
    items = data.features;
  } else {
    console.warn('[PHIVOLCS] Unknown response format, attempting to use as-is');
    return [];
  }

  // Parse each event into the standard USGS-compatible format
  return items.map((item) => {
    // Handle both GeoJSON features and plain objects
    const props = item.properties || item;
    const coords = item.geometry?.coordinates || [];

    let latitude, longitude, depth;

    if (coords.length >= 2) {
      longitude = coords[0];
      latitude = coords[1];
      depth = coords[2] || 0;
    } else {
      // Try direct latitude/longitude fields
      latitude = parseFloat(props.latitude || props.lat || 0);
      longitude = parseFloat(props.longitude || props.lng || 0);
      depth = parseFloat(props.depth || 0);
    }

    return {
      id: String(props.id || props.event_id || props.code || `phivolcs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
      eventId: String(props.id || props.event_id || props.code || ''),
      magnitude: parseFloat(props.magnitude || props.mag || 0),
      place: props.place || props.location || props.region || 'Philippines',
      time: parseInt(props.time || props.timestamp || props.event_time || props.date || Date.now(), 10),
      updated: parseInt(props.updated || Date.now(), 10),
      depth,
      latitude,
      longitude,
      url: props.url || '',
      felt: parseInt(props.felt || 0, 10),
      mmi: props.mmi || null,
      alert: null,
      tsunami: 0,
      sig: 0,
      source: 'PHIVOLCS',
    };
  });
}