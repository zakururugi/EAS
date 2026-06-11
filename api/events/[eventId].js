/**
 * GET /api/events/:eventId
 *
 * Returns full event details from USGS and optionally finds the ShakeMap contour URL.
 */

import { fetchEventDetails, findShakeMapContourUrl, simplifyEvent } from '../_lib/usgs.js';

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
    console.log(`[events/${eventId}] Fetching event details...`);

    const event = await fetchEventDetails(eventId);

    if (!event || !event.properties) {
      res.status(404).json({ error: `Event ${eventId} not found` });
      return;
    }

    const simplified = simplifyEvent(event);

    // Find ShakeMap contour URL if available
    const shakemapUrl = findShakeMapContourUrl(event);

    res.status(200).json({
      ...simplified,
      shakemapUrl,
      hasShakeMap: shakemapUrl !== null,
    });
  } catch (err) {
    console.error(`[events/${eventId}] Error:`, err.message);

    if (err.message?.includes('404') || err.message?.includes('not found')) {
      res.status(404).json({ error: `Event ${eventId} not found` });
    } else {
      res.status(502).json({
        error: 'Failed to fetch event details from USGS',
        details: err.message,
      });
    }
  }
}