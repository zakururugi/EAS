/**
 * GET /api/phivolcs/earthquakes
 *
 * Returns earthquake data scraped from the PHIVOLCS website as JSON.
 * Uses the shared phivolcs-scraper module.
 */

import { scrapePhivolcsEvents } from '../_lib/phivolcs-scraper.js';

export default async function handler(req, res) {
  // Allow GET requests only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const earthquakes = await scrapePhivolcsEvents();

    res.status(200).json({
      source: 'PHIVOLCS',
      fetchedAt: new Date().toISOString(),
      count: earthquakes.length,
      earthquakes: earthquakes.map(e => ({
        datetime: new Date(e.time).toISOString(),
        depth: e.depth,
        magnitude: e.magnitude,
        location: e.place,
        latitude: e.latitude,
        longitude: e.longitude,
        eventId: e.eventId,
      })),
    });

  } catch (error) {
    console.error('[PHIVOLCS Scraper]', error.message);
    res.status(502).json({ error: 'Failed to fetch or parse PHIVOLCS data', details: error.message });
  }
}