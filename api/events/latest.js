/**
 * GET /api/events/latest
 *
 * PHIVOLCS is the authoritative source for Philippine push-alert eligibility.
 * A provider/parser failure is never represented as a successful empty feed.
 */

import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';

function parseBoundedNumber(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const error = new Error(`Invalid ${name}; expected a value from ${min} to ${max}.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  let minMagnitude;
  let limit;
  try {
    minMagnitude = parseBoundedNumber(req.query?.min_magnitude, 0, 0, 10, 'min_magnitude');
    limit = parseBoundedNumber(req.query?.limit, 200, 1, 500, 'limit');
    if (!Number.isInteger(limit)) {
      const error = new Error('Invalid limit; expected a whole number from 1 to 500.');
      error.statusCode = 400;
      throw error;
    }
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
    return;
  }

  try {
    const events = await fetchPhivolcsEvents();
    if (!Array.isArray(events)) {
      throw new Error('PHIVOLCS adapter returned a non-array event payload.');
    }

    const filtered = events
      .filter((event) => (
        event &&
        Number.isFinite(Number(event.time)) &&
        Number.isFinite(Number(event.magnitude)) &&
        Number.isFinite(Number(event.latitude)) &&
        Number.isFinite(Number(event.longitude)) &&
        Number.isFinite(Number(event.depth)) &&
        Number(event.magnitude) >= minMagnitude
      ))
      .sort((a, b) => Number(b.time) - Number(a.time))
      .slice(0, limit);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: filtered.length,
        source: 'PHIVOLCS',
        region: 'Philippines',
        status: 'ok',
      },
      events: filtered,
    });
  } catch (error) {
    console.error('[events/latest] PHIVOLCS feed failed:', error.message);
    res.status(502).json({
      error: 'PHIVOLCS earthquake data is temporarily unavailable.',
      metadata: {
        generated: Date.now(),
        source: 'PHIVOLCS',
        region: 'Philippines',
        status: 'unavailable',
      },
    });
  }
}
