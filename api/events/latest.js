/**
 * GET /api/events/latest
 * Proxies USGS earthquake feed, filtered to Philippines only.
 */
import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';

const PH_MIN_LAT = 4.5;
const PH_MAX_LAT = 21.5;
const PH_MIN_LON = 116.5;
const PH_MAX_LON = 126.5;

function isWithinPhilippines(lat, lon) {
  if (lat == null || lon == null) return false;
  return lat >= PH_MIN_LAT && lat <= PH_MAX_LAT &&
         lon >= PH_MIN_LON && lon <= PH_MAX_LON;
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

    const rawData = await fetchLatestEvents(feed);
    let events = rawData.features.map(simplifyEvent);

    // Filter to Philippines only
    events = events.filter((e) => isWithinPhilippines(e.latitude, e.longitude));
    events.forEach((e) => { e.source = e.source || 'USGS'; });

    if (minMagnitude > 0) {
      events = events.filter((e) => e.magnitude >= minMagnitude);
    }

    events.sort((a, b) => b.time - a.time);

    if (limit > 0 && events.length > limit) {
      events = events.slice(0, limit);
    }

    console.log(`[events/latest] Returning ${events.length} Philippines events`);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: events.length,
        feed,
        region: 'Philippines',
      },
      events,
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    res.status(502).json({
      error: 'Failed to fetch earthquake data',
      details: err.message,
    });
  }
}
