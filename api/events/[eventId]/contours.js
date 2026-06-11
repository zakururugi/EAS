/**
 * GET /api/events/:eventId/contours
 *
 * Proxies the ShakeMap cont_mi.json file from USGS to avoid CORS issues.
 * First fetches the event details to find the contour URL, then proxies it.
 */

import { fetchEventDetails, findShakeMapContourUrl } from '../../_lib/usgs.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

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
    console.log(`[contours/${eventId}] Fetching event details to find ShakeMap URL...`);

    const event = await fetchEventDetails(eventId);

    if (!event || !event.properties) {
      res.status(404).json({ error: `Event ${eventId} not found` });
      return;
    }

    const contourUrl = findShakeMapContourUrl(event);

    if (!contourUrl) {
      res.status(404).json({
        error: 'No ShakeMap contour data available for this event',
        eventId,
      });
      return;
    }

    console.log(`[contours/${eventId}] Proxying ShakeMap contours from: ${contourUrl}`);

    const response = await fetch(contourUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'EarthquakeAlertSystem/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`ShakeMap server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    res.status(200).json(data);
  } catch (err) {
    console.error(`[contours/${eventId}] Error:`, err.message);

    if (err.message?.includes('404')) {
      res.status(404).json({ error: `Event ${eventId} not found` });
    } else {
      res.status(502).json({
        error: 'Failed to fetch ShakeMap contour data',
        details: err.message,
      });
    }
  }
}