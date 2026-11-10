/**
 * GET /api/events/usgs-products?eventId=<USGS ComCat ID>
 *
 * Fetches official USGS event detail, preferred ShakeMap contours, and DYFI
 * GeoJSON. The event ID is validated and product URLs are restricted to the
 * official USGS earthquake host by the adapter.
 */

import { fetchUsgsEventProducts } from '../_lib/sources/usgs.js';
import { persistUsgsProducts } from '../_lib/intensity/persist-usgs-products.js';
import { query } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const eventId = req.query?.eventId;
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(eventId)) {
    res.status(400).json({ error: 'A valid USGS eventId is required.' });
    return;
  }

  try {
    const products = await fetchUsgsEventProducts(eventId);
    let persistence = { storedProducts: 0, storedObservations: 0 };
    if (process.env.DATABASE_URL) {
      try {
        persistence = await persistUsgsProducts(eventId, products, query);
      } catch (error) {
        console.error('[events/usgs-products] Product persistence skipped:', error.message);
      }
    }
    res.status(200).json({
      source: 'USGS',
      notificationEligible: false,
      persistence,
      ...products,
    });
  } catch (error) {
    console.error('[events/usgs-products] Failed:', error.message);
    res.status(502).json({ error: 'USGS event products are temporarily unavailable.' });
  }
}
