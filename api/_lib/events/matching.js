/**
 * Cross-provider candidate matching in shadow mode.
 * Scores are heuristic and must never trigger automatic event merges.
 */

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scoreShadowMatch(usgsEvent, phivolcsEvent) {
  const timeDeltaSeconds = Math.abs(
    Number(usgsEvent.time) - new Date(phivolcsEvent.origin_time).getTime()
  ) / 1000;
  const distanceKm = haversineKm(
    Number(usgsEvent.latitude),
    Number(usgsEvent.longitude),
    Number(phivolcsEvent.latitude),
    Number(phivolcsEvent.longitude)
  );

  const usgsMagnitude = usgsEvent.magnitude == null ? null : Number(usgsEvent.magnitude);
  const phivolcsMagnitude = phivolcsEvent.preferred_magnitude == null
    ? null
    : Number(phivolcsEvent.preferred_magnitude);
  const magnitudeDelta = usgsMagnitude == null || phivolcsMagnitude == null
    ? null
    : Math.abs(usgsMagnitude - phivolcsMagnitude);

  const usgsDepth = usgsEvent.depth == null ? null : Number(usgsEvent.depth);
  const phivolcsDepth = phivolcsEvent.depth_km == null ? null : Number(phivolcsEvent.depth_km);
  const depthDelta = usgsDepth == null || phivolcsDepth == null
    ? null
    : Math.abs(usgsDepth - phivolcsDepth);

  if (
    !Number.isFinite(timeDeltaSeconds) || timeDeltaSeconds > 300 ||
    !Number.isFinite(distanceKm) || distanceKm > 50 ||
    (magnitudeDelta !== null && magnitudeDelta > 1.5)
  ) return null;

  const timeScore = Math.max(0, 1 - timeDeltaSeconds / 300);
  const distanceScore = Math.max(0, 1 - distanceKm / 50);
  const depthScore = depthDelta === null ? 0.5 : Math.max(0, 1 - depthDelta / 100);
  const magnitudeScore = magnitudeDelta === null ? 0.5 : Math.max(0, 1 - magnitudeDelta / 1.5);
  const placeScore = 0.5; // No source-independent place equivalence is assumed.

  const confidence =
    timeScore * 0.30 +
    distanceScore * 0.30 +
    depthScore * 0.15 +
    magnitudeScore * 0.15 +
    placeScore * 0.10;

  return {
    confidence: Number(confidence.toFixed(4)),
    evidence: {
      mode: 'shadow_only',
      timeDeltaSeconds: Number(timeDeltaSeconds.toFixed(2)),
      distanceKm: Number(distanceKm.toFixed(3)),
      depthDeltaKm: depthDelta === null ? null : Number(depthDelta.toFixed(2)),
      magnitudeDelta: magnitudeDelta === null ? null : Number(magnitudeDelta.toFixed(2)),
      components: { timeScore, distanceScore, depthScore, magnitudeScore, placeScore },
    },
  };
}

export async function recordUsgsShadowMatch(usgsEvent, eventSourceId, query) {
  const time = Number(usgsEvent.time);
  const latitude = Number(usgsEvent.latitude);
  const longitude = Number(usgsEvent.longitude);
  const candidates = await query(
    `SELECT id, origin_time, latitude, longitude, depth_km, preferred_magnitude, place
     FROM earthquake_events
     WHERE preferred_source = 'PHIVOLCS'
       AND origin_time BETWEEN
         TO_TIMESTAMP($1 / 1000.0) - INTERVAL '5 minutes'
         AND TO_TIMESTAMP($1 / 1000.0) + INTERVAL '5 minutes'
       AND latitude BETWEEN $2 - 0.5 AND $2 + 0.5
       AND longitude BETWEEN $3 - 0.5 AND $3 + 0.5
     ORDER BY ABS(EXTRACT(EPOCH FROM (origin_time - TO_TIMESTAMP($1 / 1000.0))))
     LIMIT 20`,
    [time, latitude, longitude]
  );

  const scored = candidates.rows
    .map((candidate) => ({
      candidate,
      score: scoreShadowMatch(usgsEvent, candidate),
    }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score.confidence - a.score.confidence);

  const best = scored[0];
  if (!best || best.score.confidence < 0.45) return null;

  await query(
    `INSERT INTO event_matches (
       event_source_id, earthquake_event_id, confidence, decision,
       evidence, algorithm_version
     ) VALUES ($1, $2, $3, 'unreviewed', $4::jsonb, 'shadow-v1')
     ON CONFLICT (event_source_id) DO UPDATE SET
       earthquake_event_id = EXCLUDED.earthquake_event_id,
       confidence = EXCLUDED.confidence,
       evidence = EXCLUDED.evidence,
       algorithm_version = EXCLUDED.algorithm_version
     WHERE event_matches.decision = 'unreviewed'`,
    [
      eventSourceId,
      best.candidate.id,
      best.score.confidence,
      JSON.stringify({
        ...best.score.evidence,
        candidateCount: scored.length,
        candidateEventId: best.candidate.id,
      }),
    ]
  );

  return {
    candidateEventId: best.candidate.id,
    confidence: best.score.confidence,
    candidateCount: scored.length,
    decision: 'unreviewed',
  };
}
