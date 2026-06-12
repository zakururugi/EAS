/**
 * GET /api/events/latest
 *
 * Returns earthquakes from PHIVOLCS (scraped from website).
 * USGS has been removed - PHIVOLCS is now the only source.
 */

import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';

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

  const minMagnitude = req.query.min_magnitude ? parseFloat(req.query.min_magnitude) : 0;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;

  try {
    console.log(`[events/latest] Fetching PHIVOLCS events...`);

    // PHIVOLCS data via web scraping
    let phivolcsEvents = [];
    try {
      phivolcsEvents = await fetchPhivolcsEvents();
      console.log(`[events/latest] Scraped ${phivolcsEvents.length} PHIVOLCS events`);
    } catch (err) {
      console.error('[events/latest] PHIVOLCS scrape failed:', err.message);
    }

    // Filter by min magnitude
    if (minMagnitude > 0) {
      phivolcsEvents = phivolcsEvents.filter(e => e.magnitude >= minMagnitude);
    }

    // Sort by time descending (newest first)
    phivolcsEvents.sort((a, b) => b.time - a.time);

    if (limit > 0 && phivolcsEvents.length > limit) {
      phivolcsEvents = phivolcsEvents.slice(0, limit);
    }

    console.log(`[events/latest] Returning ${phivolcsEvents.length} PHIVOLCS events`);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: phivolcsEvents.length,
        source: 'PHIVOLCS',
        region: 'Philippines'
      },
      events: phivolcsEvents
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    // Return empty list instead of crashing
    res.status(200).json({
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 0, source: 'PHIVOLCS', region: 'Philippines', error: err.message },
      events: []
    });
  }
}