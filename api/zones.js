/**
 * GET /api/zones?device_id=xxx  - Get all watch zones for a device
 * POST /api/zones               - Create or update a watch zone
 *
 * Body (POST JSON):
 *   { device_id: string, name?: string, polygon: [[lon,lat],...], min_magnitude?: number }
 */

import { query } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * GET - Fetch all watch zones for a device.
 */
async function handleGet(req, res) {
  try {
    const device_id = req.query.device_id;

    if (!device_id) {
      res.status(400).json({ error: 'device_id query parameter is required' });
      return;
    }

    const result = await query(
      `SELECT wz.id, wz.name, ST_AsGeoJSON(wz.zone_geom)::json->'coordinates' as coordinates,
              wz.min_magnitude, wz.enabled, wz.created_at, wz.updated_at
       FROM watch_zones wz
       JOIN users u ON u.id = wz.user_id
       WHERE u.device_id = $1
       ORDER BY wz.created_at DESC`,
      [device_id]
    );

    const zones = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      // Convert PostGIS polygon coordinates to GeoJSON ring format
      polygon: row.coordinates?.[0] || [],
      min_magnitude: row.min_magnitude,
      enabled: row.enabled,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.status(200).json({ zones });
  } catch (err) {
    console.error('[zones] GET Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch watch zones', details: err.message });
  }
}

/**
 * POST - Create a new watch zone.
 */
async function handlePost(req, res) {
  try {
    const { device_id, name, polygon, min_magnitude } = req.body || {};

    if (!device_id) {
      res.status(400).json({ error: 'device_id is required' });
      return;
    }

    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
      res.status(400).json({
        error: 'polygon is required and must be an array of [lon, lat] coordinates (min 3 points)',
      });
      return;
    }

    // Ensure the polygon is closed (first and last point must match)
    const closedPolygon = [...polygon];
    const first = closedPolygon[0];
    const last = closedPolygon[closedPolygon.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closedPolygon.push(first);
    }

    // Build GeoJSON polygon string for PostGIS
    const coordsStr = closedPolygon.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
    const geomText = `POLYGON((${coordsStr}))`;

    // Create user first
    const userResult = await query(
      `SELECT create_user_if_not_exists($1) as user_id`,
      [device_id]
    );
    const userId = userResult.rows[0]?.user_id;

    const zoneName = name || 'My Zone';
    const minMag = min_magnitude != null ? parseFloat(min_magnitude) : 4.5;

    const result = await query(
      `INSERT INTO watch_zones (user_id, name, zone_geom, min_magnitude)
       VALUES ($1, $2, ST_GeogFromText($3), $4)
       RETURNING id, name, min_magnitude, enabled`,
      [userId, zoneName, geomText, minMag]
    );

    const zone = result.rows[0];

    console.log(`[zones] Created zone ${zone.id} for device ${device_id}`);

    res.status(201).json({
      success: true,
      message: 'Watch zone created successfully',
      zone: {
        id: zone.id,
        name: zone.name,
        polygon: closedPolygon,
        min_magnitude: zone.min_magnitude,
        enabled: zone.enabled,
      },
    });
  } catch (err) {
    console.error('[zones] POST Error:', err.message);
    res.status(500).json({ error: 'Failed to create watch zone', details: err.message });
  }
}

/**
 * DELETE - Remove a watch zone by ID.
 */
async function handleDelete(req, res) {
  try {
    const zone_id = req.query.zone_id || req.body?.zone_id;

    if (!zone_id) {
      res.status(400).json({ error: 'zone_id is required' });
      return;
    }

    const result = await query(
      `DELETE FROM watch_zones WHERE id = $1 RETURNING id`,
      [zone_id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Zone not found' });
      return;
    }

    res.status(200).json({ success: true, message: 'Watch zone deleted' });
  } catch (err) {
    console.error('[zones] DELETE Error:', err.message);
    res.status(500).json({ error: 'Failed to delete watch zone', details: err.message });
  }
}