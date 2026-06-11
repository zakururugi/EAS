/**
 * GET /api/events/latest
 *
 * Returns earthquakes from USGS (filtered to Philippines) and PHIVOLCS (community API).
 * Merges both sources, deduplicates by location (within ~0.5° lat/lon).
 * Falls back gracefully if PHIVOLCS API fails.
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';

// Philippines bounding box
const PH_MIN_LAT = 4.5;
const PH_MAX_LAT = 21.5;
const PH_MIN_LON = 116.5;
const PH_MAX_LON = 126.5;

function isWithinPhilippines(lat, lon) {
  if (lat == null || lon == null) return false;
  return lat >= PH_MIN_LAT && lat <= PH_MAX_LAT &&
         lon >= PH_MIN_LON && lon <= PH_MAX_LON;
}

/**
 * Fetch PHIVOLCS earthquakes from the community API.
 * Returns an array of events in the same format as USGS, or empty array on error.
 */
async function fetchPHIVOLCSEvents() {
  const PHIVOLCS_API = 'https://incident-ph-api.onrender.com/api/phivolcs/earthquakes';
  try {
    const response = await fetch(PHIVOLCS_API, {
      headers: { 'User-Agent': 'EarthquakeAlertSystem/1.0' },
      timeout: 5000,
    });
    if (!response.ok) return [];

    const data = await response.json();
    let items = [];

    // Handle different response structures
    if (Array.isArray(data)) items = data;
    else if (data.earthquakes && Array.isArray(data.earthquakes)) items = data.earthquakes;
    else if (data.data && Array.isArray(data.data)) items = data.data;
    else return [];

    // Convert to USGS-like format
    return items.map(item => {
      const props = item.properties || item;
      const coords = item.geometry?.coordinates || [];
      let lat, lon, depth;

      if (coords.length >= 2) {
        lon = coords[0];
        lat = coords[1];
        depth = coords[2] || 0;
      } else {
        lat = parseFloat(props.latitude || props.lat || 0);
        lon = parseFloat(props.longitude || props.lng || 0);
        depth = parseFloat(props.depth || 0);
      }

      return {
        id: String(props.id || props.event_id || `ph-${Date.now()}-${Math.random()}`),
        eventId: String(props.id || props.event_id || ''),
        magnitude: parseFloat(props.magnitude || props.mag || 0),
        place: props.place || props.location || props.region || 'Philippines',
        time: parseInt(props.time || props.timestamp || props.date_time || Date.now(), 10),
        updated: parseInt(props.updated || Date.now(), 10),
        depth,
        latitude: lat,
        longitude: lon,
        url: props.url || '',
        felt: parseInt(props.felt || 0, 10),
        mmi: props.mmi || null,
        source: 'PHIVOLCS',
      };
    }).filter(e => e.magnitude > 0 && isWithinPhilippines(e.latitude, e.longitude));
  } catch (err) {
    console.error('[events/latest] PHIVOLCS fetch failed:', err.message);
    return [];
  }
}

/**
 * Deduplicate events from USGS and PHIVOLCS by proximity (within ~0.5° lat/lon).
 * Prefers USGS if both exist for the same location (USGS usually has more data).
 */
function mergeEvents(usgsEvents, phivolcsEvents) {
  const combined = [...usgsEvents];
  const used = new Set(usgsEvents.map(e => `${e.latitude?.toFixed(1)},${e.longitude?.toFixed(1)}`));

  for (const ph of phivolcsEvents) {
    const key = `${ph.latitude?.toFixed(1)},${ph.longitude?.toFixed(1)}`;
    if (!used.has(key)) {
      combined.push(ph);
      used.add(key);
    }
  }
  return combined;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const feed = req.query.feed || 'earthquakes/feed/v1.0/summary/4.5_day.geojson';
    const minMagnitude = req.query.min_magnitude ? parseFloat(req.query.min_magnitude) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;

    console.log(`[events/latest] Fetching USGS feed: ${feed}`);

    // Fetch USGS data
    const rawData = await fetchLatestEvents(feed);
    let usgsEvents = rawData.features.map(simplifyEvent);
    usgsEvents = usgsEvents.filter(e => isWithinPhilippines(e.latitude, e.longitude));
    usgsEvents.forEach(e => { e.source = 'USGS'; });

    // Fetch PHIVOLCS data (non‑critical, failures are logged but don't break the response)
    let phivolcsEvents = [];
    try {
      phivolcsEvents = await fetchPHIVOLCSEvents();
      console.log(`[events/latest] Fetched ${phivolcsEvents.length} PHIVOLCS events`);
    } catch (err) {
      // Already handled inside fetchPHIVOLCSEvents
    }

    // Merge and sort
    let allEvents = mergeEvents(usgsEvents, phivolcsEvents);

    if (minMagnitude > 0) {
      allEvents = allEvents.filter(e => e.magnitude >= minMagnitude);
    }

    allEvents.sort((a, b) => b.time - a.time);

    if (limit > 0 && allEvents.length > limit) {
      allEvents = allEvents.slice(0, limit);
    }

    console.log(`[events/latest] Returning ${allEvents.length} events (USGS: ${usgsEvents.length}, PHIVOLCS: ${phivolcsEvents.length})`);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: allEvents.length,
        feed,
        region: 'Philippines',
      },
      events: allEvents,
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    // Return empty list instead of crashing
    res.status(200).json({
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 0, feed, region: 'Philippines', error: err.message },
      events: [],
    });
  }
}