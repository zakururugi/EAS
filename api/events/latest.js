/**
 * GET /api/events/latest
 *
 * Proxies the USGS earthquake feed (4.5_day.geojson) and returns it as-is.
 * This avoids CORS issues from the browser and allows us to cache/filter as needed.
 *
 * Query params:
 *   ?feed=...         - Override the default USGS feed path (optional)
 *   ?min_magnitude=5  - Filter by minimum magnitude (optional)
 *   ?limit=50         - Limit number of results (optional)
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';

export default async function handler(req, res) {
  // Enable CORS for frontend requests
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

    // Simplify and optionally filter events
    let events = rawData.features.map(simplifyEvent);

    if (minMagnitude > 0) {
      events = events.filter((e) => e.magnitude >= minMagnitude);
    }

    // Sort by time descending (most recent first)
    events.sort((a, b) => b.time - a.time);

    if (limit > 0 && events.length > limit) {
      events = events.slice(0, limit);
    }

    console.log(`[events/latest] Returning ${events.length} events`);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: events.length,
        feed,
      },
      events,
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    res.status(502).json({
      error: 'Failed to fetch earthquake data from USGS',
      details: err.message,
    });
  }
}