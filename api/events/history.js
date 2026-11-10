/**
 * GET /api/events/history
 *
 * Keyset-paginated canonical archive. No arbitrary historical cutoff is
 * applied; callers can page through every event currently stored in EAS.
 */

import { query } from '../_lib/db.js';
import { encodeHistoryCursor, parseHistoryQuery } from '../_lib/history-query.js';

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

  let filters;
  try {
    filters = parseHistoryQuery(req.query || {});
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
    return;
  }

  try {
    const result = await query(
      `SELECT
         e.id,
         e.origin_time,
         e.latitude,
         e.longitude,
         e.depth_km,
         e.preferred_magnitude,
         e.preferred_magnitude_type,
         e.preferred_source,
         e.place,
         e.last_updated_at,
         primary_source.provider_event_id,
         primary_source.source_url,
         primary_source.raw_payload,
         COALESCE(all_sources.source_records, '[]'::jsonb) AS sources
       FROM earthquake_events e
       LEFT JOIN LATERAL (
         SELECT es.provider_event_id, es.source_url, es.raw_payload
         FROM event_sources es
         WHERE es.earthquake_event_id = e.id
         ORDER BY (es.provider = e.preferred_source) DESC, es.retrieved_at DESC
         LIMIT 1
       ) primary_source ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'provider', es.provider,
             'providerEventId', es.provider_event_id,
             'magnitude', es.source_magnitude,
             'magnitudeType', es.source_magnitude_type,
             'depth', es.source_depth_km,
             'place', es.source_place,
             'sourceUrl', es.source_url,
             'retrievedAt', es.retrieved_at
           ) ORDER BY es.provider, es.retrieved_at DESC
         ) AS source_records
         FROM event_sources es
         WHERE es.earthquake_event_id = e.id
       ) all_sources ON TRUE
       WHERE ($1::timestamptz IS NULL OR e.origin_time >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR e.origin_time < $2::timestamptz)
         AND ($3::numeric IS NULL OR e.preferred_magnitude >= $3::numeric)
         AND (
           $4::timestamptz IS NULL OR
           (e.origin_time, e.id) < ($4::timestamptz, $5::uuid)
         )
       ORDER BY e.origin_time DESC, e.id DESC
       LIMIT $6`,
      [
        filters.from,
        filters.to,
        filters.minMagnitude,
        filters.cursor?.timestamp || null,
        filters.cursor?.id || null,
        filters.limit + 1,
      ]
    );

    const hasMore = result.rows.length > filters.limit;
    const pageRows = hasMore ? result.rows.slice(0, filters.limit) : result.rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeHistoryCursor(lastRow.origin_time, lastRow.id)
      : null;

    const events = pageRows.map((row) => {
      const payload = row.raw_payload || {};
      return {
        id: row.id,
        eventId: row.id,
        sourceEventId: row.provider_event_id,
        source: row.preferred_source,
        magnitude: row.preferred_magnitude == null ? null : Number(row.preferred_magnitude),
        magnitudeType: row.preferred_magnitude_type || null,
        place: row.place || 'Location unavailable',
        time: new Date(row.origin_time).getTime(),
        updated: new Date(row.last_updated_at).getTime(),
        depth: row.depth_km == null ? null : Number(row.depth_km),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        url: row.source_url || null,
        felt: Number.isFinite(Number(payload.felt)) ? Number(payload.felt) : 0,
        mmi: payload.mmi == null ? null : Number(payload.mmi),
        alert: payload.alert || null,
        tsunami: payload.tsunami ?? null,
        sources: row.sources || [],
      };
    });

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: events.length,
        source: 'EAS_ARCHIVE',
        status: 'ok',
        hasMore,
        nextCursor,
        filters: {
          from: filters.from,
          toExclusive: filters.to,
          minMagnitude: filters.minMagnitude,
        },
      },
      events,
    });
  } catch (error) {
    console.error('[events/history] Archive query failed:', error.message);
    res.status(503).json({
      error: 'Earthquake history is temporarily unavailable.',
      metadata: { source: 'EAS_ARCHIVE', status: 'unavailable' },
    });
  }
}
