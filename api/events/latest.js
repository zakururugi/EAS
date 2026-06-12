/**
 * GET /api/events/latest
 *
 * Returns earthquakes from USGS (filtered to Philippines) and PHIVOLCS (scraped from website).
 * Merges both sources, deduplicates by location (within ~0.5° lat/lon).
 * Falls back gracefully if PHIVOLCS scraping fails.
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';
import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';

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
 * Deduplicate events from USGS and PHIVOLCS by proximity (within ~0.5° lat/lon).
 * Prefers USGS if both exist for the same location.
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

  // Define feed outside try block so it's accessible in catch
  const feed = req.query.feed || 'earthquakes/feed/v1.0/summary/4.5_day.geojson';

  try {
    const minMagnitude = req.query.min_magnitude ? parseFloat(req.query.min_magnitude) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;

    console.log(`[events/latest] Fetching USGS feed: ${feed}`);

    // USGS data
    const rawData = await fetchLatestEvents(feed);
    let usgsEvents = rawData.features.map(simplifyEvent);
    usgsEvents = usgsEvents.filter(e => isWithinPhilippines(e.latitude, e.longitude));
    usgsEvents.forEach(e => { e.source = 'USGS'; });

    // PHIVOLCS data via web scraping (non-critical, failures are logged)
    let phivolcsEvents = [];
    try {
      phivolcsEvents = await fetchPhivolcsEvents();
      console.log(`[events/latest] Scraped ${phivolcsEvents.length} PHIVOLCS events`);
    } catch (err) {
      // Already logged inside fetchPhivolcsEvents
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
        region: 'Philippines'
      },
      events: allEvents
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    // Return empty list instead of crashing
    res.status(200).json({
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 0, feed, region: 'Philippines', error: err.message },
      events: []
    });
  }
}