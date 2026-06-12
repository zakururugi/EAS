/**
 * GET /api/events/:eventId/contours
 *
 * Returns ShakeMap intensity contours for an event.
 * PHIVOLCS doesn't provide USGS-style ShakeMap data, so this endpoint
 * generates approximate intensity contours based on magnitude/depth.
 * The frontend also does its own approximation as a fallback.
 */

import { scrapePhivolcsEvents } from '../../_lib/phivolcs-scraper.js';

/**
 * Generate approximate ShakeMap intensity contours.
 */
function generateApproximateContours(event) {
  const mag = event.magnitude || 0;
  const depth = event.depth || 10;
  const lat = event.latitude;
  const lng = event.longitude;

  if (!lat || !lng || mag < 4) return null;

  // Improved MMI estimation based on real-world earthquake intensity data
  // At epicenter: MMI ≈ 1.5 * mag - 1.0 (roughly)
  const epicenterMmi = Math.min(10, Math.max(1, Math.round(1.5 * mag - 1.0)));

  // Radius (km) for each MMI level, accounting for depth
  // Deeper quakes have wider but weaker shaking
  const depthFactor = Math.max(1, depth / 5);

  const mmiRadii = [
    { mmi: 1, radius: Math.max(epicenterMmi * 40, 200) },
    { mmi: 2, radius: Math.max(epicenterMmi * 30, 140) },
    { mmi: 3, radius: Math.max(epicenterMmi * 20, 90) },
    { mmi: 4, radius: Math.max(epicenterMmi * 12, 50) },
    { mmi: 5, radius: Math.max(epicenterMmi * 6, 20) },
    { mmi: 6, radius: Math.max(epicenterMmi * 3, 8) },
    { mmi: 7, radius: Math.max(epicenterMmi * 1.5, 3) },
    { mmi: 8, radius: Math.max(epicenterMmi * 0.8, 1) },
  ];

  const features = [];

  for (const level of mmiRadii) {
    if (level.mmi > epicenterMmi) continue;

    // Adjust radius for depth (deeper = wider, but same MMI at wider radius)
    const adjustedRadius = level.radius * depthFactor;

    if (adjustedRadius < 1) continue;

    const radiusM = adjustedRadius * 1000;
    const points = [];
    const segments = 32;

    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * 2 * Math.PI;
      const dLat = (radiusM / 111320) * Math.cos(angle);
      const dLng = (radiusM / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
      points.push([lng + dLng, lat + dLat]);
    }

    const mmiDesc = ['', 'Not felt', 'Weak', 'Weak', 'Light', 'Moderate', 'Strong', 'Very strong', 'Severe', 'Violent', 'Extreme'][level.mmi] || '';

    features.push({
      type: 'Feature',
      properties: { MMI: level.mmi, label: `${level.mmi} – ${mmiDesc}` },
      geometry: {
        type: 'Polygon',
        coordinates: [points],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    metadata: { generated: true, source: 'PHIVOLCS', eventName: event.place },
    features,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600');

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
    console.log(`[contours/${eventId}] Generating approximate contours...`);

    // Fetch all PHIVOLCS events and find the matching one
    const allEvents = await scrapePhivolcsEvents();
    const event = allEvents.find(e => e.eventId === eventId || e.id === eventId);

    if (!event) {
      res.status(404).json({ error: `Event ${eventId} not found` });
      return;
    }

    const contours = generateApproximateContours(event);

    if (!contours || contours.features.length === 0) {
      res.status(404).json({
        error: 'Cannot generate intensity contours for this event (magnitude too low)',
        eventId,
      });
      return;
    }

    res.status(200).json(contours);
  } catch (err) {
    console.error(`[contours/${eventId}] Error:`, err.message);
    res.status(502).json({
      error: 'Failed to generate contour data',
      details: err.message,
    });
  }
}