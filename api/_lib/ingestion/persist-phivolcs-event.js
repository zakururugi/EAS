import { createHash } from 'node:crypto';

function normalizeEvent(event) {
  const time = Number(event?.time);
  const latitude = Number(event?.latitude);
  const longitude = Number(event?.longitude);
  const depth = Number(event?.depth);
  const magnitude = Number(event?.magnitude);
  const providerEventId = event?.id || event?.eventId;

  if (
    typeof providerEventId !== 'string' || !providerEventId ||
    !Number.isFinite(time) || time <= 0 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(depth) || depth < 0 ||
    !Number.isFinite(magnitude) || magnitude <= 0 || magnitude > 10 ||
    typeof event?.place !== 'string' || !event.place.trim()
  ) {
    throw new Error('Refusing to persist an invalid PHIVOLCS earthquake event.');
  }

  return {
    providerEventId,
    originTime: new Date(time).toISOString(),
    latitude,
    longitude,
    depth,
    magnitude,
    magnitudeType: event.magnitudeType || event.magType || null,
    place: event.place.trim(),
    sourceUrl: event.url || null,
    sourceRevision: String(event.updated ?? event.time),
    rawPayload: JSON.stringify(event),
  };
}

function comparableValues(row) {
  return {
    origin_time: new Date(row.origin_time).toISOString(),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    depth_km: row.depth_km == null ? null : Number(row.depth_km),
    preferred_magnitude: row.preferred_magnitude == null ? null : Number(row.preferred_magnitude),
    preferred_magnitude_type: row.preferred_magnitude_type || null,
    place: row.place || null,
    preferred_source: row.preferred_source,
  };
}

export async function persistPhivolcsEvent(event, query) {
  if (typeof query !== 'function') throw new TypeError('A database query function is required.');
  const value = normalizeEvent(event);
  const contentHash = createHash('sha256').update(value.rawPayload).digest('hex');

  const previousSourceResult = await query(
    `SELECT id, source_revision, content_hash, raw_payload
     FROM event_sources
     WHERE provider = 'PHIVOLCS' AND provider_event_id = $1`,
    [value.providerEventId]
  );
  const previousSource = previousSourceResult.rows[0];
  if (previousSource?.content_hash && previousSource.content_hash !== contentHash) {
    await query(
      `INSERT INTO event_source_revisions (
         event_source_id, source_revision, content_hash, raw_payload
       ) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (event_source_id, content_hash) DO NOTHING`,
      [
        previousSource.id,
        previousSource.source_revision,
        previousSource.content_hash,
        JSON.stringify(previousSource.raw_payload || {}),
      ]
    );
  }

  const sourceResult = await query(
    `INSERT INTO event_sources (
       provider, provider_event_id, source_origin_time, source_latitude,
       source_longitude, source_depth_km, source_magnitude,
       source_magnitude_type, source_place, source_status, source_url,
       source_revision, content_hash, raw_payload, retrieved_at
     ) VALUES (
       'PHIVOLCS', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW()
     )
     ON CONFLICT (provider, provider_event_id) DO UPDATE SET
       source_origin_time = EXCLUDED.source_origin_time,
       source_latitude = EXCLUDED.source_latitude,
       source_longitude = EXCLUDED.source_longitude,
       source_depth_km = EXCLUDED.source_depth_km,
       source_magnitude = EXCLUDED.source_magnitude,
       source_magnitude_type = EXCLUDED.source_magnitude_type,
       source_place = EXCLUDED.source_place,
       source_status = EXCLUDED.source_status,
       source_url = EXCLUDED.source_url,
       source_revision = EXCLUDED.source_revision,
       content_hash = EXCLUDED.content_hash,
       raw_payload = EXCLUDED.raw_payload,
       retrieved_at = NOW()
     RETURNING id, earthquake_event_id`,
    [
      value.providerEventId, value.originTime, value.latitude, value.longitude,
      value.depth, value.magnitude, value.magnitudeType, value.place,
      event.status || null, value.sourceUrl, value.sourceRevision,
      contentHash, value.rawPayload,
    ]
  );

  const source = sourceResult.rows[0];
  if (!source?.id) throw new Error('Failed to save PHIVOLCS source record.');

  let canonicalEventId = source.earthquake_event_id;
  let changedFields = [];

  if (canonicalEventId) {
    const currentResult = await query(
      `SELECT origin_time, latitude, longitude, depth_km,
              preferred_magnitude, preferred_magnitude_type, place, preferred_source
       FROM earthquake_events WHERE id = $1`,
      [canonicalEventId]
    );
    const current = currentResult.rows[0];
    if (!current) canonicalEventId = null;
    else {
      const before = comparableValues(current);
      const after = {
        origin_time: value.originTime,
        latitude: value.latitude,
        longitude: value.longitude,
        depth_km: value.depth,
        preferred_magnitude: value.magnitude,
        preferred_magnitude_type: value.magnitudeType,
        place: value.place,
        preferred_source: 'PHIVOLCS',
      };
      changedFields = Object.keys(after).filter((key) => before[key] !== after[key]);

      await query(
        `UPDATE earthquake_events
         SET origin_time = $1, latitude = $2, longitude = $3, depth_km = $4,
             preferred_magnitude = $5, preferred_magnitude_type = $6,
             place = $7, preferred_source = 'PHIVOLCS', last_updated_at = NOW()
         WHERE id = $8`,
        [
          value.originTime, value.latitude, value.longitude, value.depth,
          value.magnitude, value.magnitudeType, value.place, canonicalEventId,
        ]
      );

      if (changedFields.length > 0) {
        await query(
          `INSERT INTO event_revisions (
             earthquake_event_id, event_source_id, change_kind,
             changed_fields, previous_values, new_values
           ) VALUES ($1, $2, 'phivolcs_update', $3::jsonb, $4::jsonb, $5::jsonb)`,
          [
            canonicalEventId, source.id,
            JSON.stringify(changedFields),
            JSON.stringify(Object.fromEntries(changedFields.map((key) => [key, before[key]]))),
            JSON.stringify(Object.fromEntries(changedFields.map((key) => [key, after[key]]))),
          ]
        );
      }
    }
  }

  if (!canonicalEventId) {
    const eventResult = await query(
      `INSERT INTO earthquake_events (
         origin_time, latitude, longitude, depth_km,
         preferred_magnitude, preferred_magnitude_type, preferred_source, place
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PHIVOLCS', $7)
       RETURNING id`,
      [
        value.originTime, value.latitude, value.longitude, value.depth,
        value.magnitude, value.magnitudeType, value.place,
      ]
    );
    canonicalEventId = eventResult.rows[0]?.id;
    if (!canonicalEventId) throw new Error('Failed to create canonical PHIVOLCS event.');

    await query(
      'UPDATE event_sources SET earthquake_event_id = $1 WHERE id = $2',
      [canonicalEventId, source.id]
    );
  }

  return {
    canonicalEventId,
    sourceId: source.id,
    providerEventId: value.providerEventId,
    changedFields,
  };
}
