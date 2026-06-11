/**
 * GET /api/events/latest
 *
 * Proxies USGS earthquake feed, filters to Philippines only,
 * and optionally merges PHIVOLCS data if available.
 *
 * Query params:
 *   ?min_magnitude=5  - Filter by minimum magnitude (optional)
 *   ?limit=50         - Limit number of results (optional)
 *   ?include_phivolcs=true - Also include PHIVOLCS data (default: true)
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';

// Philippines bounding box
const PH_MIN_LAT = 4.5;
const PH_MAX_LAT = 21.5;
const PH_MIN_LON = 116.5;
const PH_MAX_LON = 126.5;

/**
 * Check if coordinates fall within the Philippines bounding box.
 */
function isWithinPhilippines(lat, lon) {
  if (lat == null || lon == null) return false;
  return lat >= PH_MIN_LAT && lat <= PH_MAX_LAT &&
         lon >= PH_MIN_LON && lon <= PH_MAX_LON;
}

/**
 * Fetch PHIVOLCS data from the internal scraper endpoint.
 * Falls back gracefully if the scraper is unavailable.
 */
async function fetchPHIVOLCSData() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : null;

  if (!baseUrl) {
    console.warn('[events/latest] No VERCEL_URL available, skipping PHIVOLCS');
    return [];
  }

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    const response = await fetch(
      `${baseUrl}/api/scrape-phivolcs`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
          'Accept': 'application/json',
        },
        signal: abortController.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[events/latest] PHIVOLCS scraper returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.earthquakes || [];
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[events/latest] PHIVOLCS scraper timed out');
    } else {
      console.warn('[events/latest] PHIVOLCS fetch failed (non-fatal):', err.message);
    }
    return [];
  }
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
    const includePHIVOLCS = req.query.include_phivolcs !== 'false';

    console.log(`[events/latest] Fetching USGS feed: ${feed}`);

    const rawData = await fetchLatestEvents(feed);

    // Simplify and filter USGS events
    let events = rawData.features.map(simplifyEvent);

    // Filter to Philippines only
    events = events.filter((e) => isWithinPhilippines(e.latitude, e.longitude));

    // Mark source
    events.forEach((e) => { e.source = e.source || 'USGS'; });

    // Optionally merge PHIVOLCS data
    if (includePHIVOLCS) {
      let phivolcsEvents = await fetchPHIVOLCSData();

      // Deduplicate by location proximity (same 0.1° lat/lon = same event)
      const existingKeys = new Set(
        events.map((e) => `${e.latitude?.toFixed(1)},${e.longitude?.toFixed(1)}`)
      );

      for (const phEvent of phivolcsEvents) {
        const mag = parseFloat(phEvent.magnitude || 0);
        const key = `${parseFloat(phEvent.latitude || 0).toFixed(1)},${parseFloat(phEvent.longitude || 0).toFixed(1)}`;
        if (!existingKeys.has(key) && mag >= minMagnitude) {
          events.push({
            id: phEvent.id || `ph-${Date.now()}-${Math.random()}`,
            eventId: phEvent.id || '',
            magnitude: mag,
            place: phEvent.place || 'Philippines',
            time: parseInt(phEvent.time || Date.now(), 10),
            depth: parseFloat(phEvent.depth || 0),
            latitude: parseFloat(phEvent.latitude || 0),
            longitude: parseFloat(phEvent.longitude || 0),
            source: 'PHIVOLCS',
            url: '',
            felt: 0,
            mmi: null,
            alert: null,
            tsunami: 0,
            sig: 0,
          });
          existingKeys.add(key);
        }
      }

      console.log(`[events/latest] Merged ${phivolcsEvents.length} PHIVOLCS events`);
    }

    if (minMagnitude > 0) {
      events = events.filter((e) => e.magnitude >= minMagnitude);
    }

    // Sort by time descending
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