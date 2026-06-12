/**
 * GET /api/events/:eventId
 *
 * Returns PHIVOLCS event details.
 * Since PHIVOLCS doesn't provide ShakeMap contour URLs like USGS,
 * we return the event data and a hasShakeMap=false flag.
 * The frontend generates approximate intensity contours locally.
 */

import { scrapePhivolcsEvents } from '../_lib/phivolcs-scraper.js';

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

  const { eventId } = req.query;
  if (!eventId) {
    res.status(400).json({ error: 'Missing eventId parameter' });
    return;
  }

  try {
    console.log(`[events/${eventId}] Looking up event...`);

    // Fetch all PHIVOLCS events and find the one matching eventId
    const allEvents = await scrapePhivolcsEvents();
    const event = allEvents.find(e => e.eventId === eventId);

    if (!event) {
      res.status(404).json({ error: `Event ${eventId} not found in PHIVOLCS data` });
      return;
    }

    res.status(200).json({
      ...event,
      shakemapUrl: null,
      hasShakeMap: false,
      source: 'PHIVOLCS'
    });
  } catch (err) {
    console.error(`[events/${eventId}] Error:`, err.message);
    res.status(502).json({
      error: 'Failed to fetch event details from PHIVOLCS',
      details: err.message,
    });
  }
}