import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUsgsEvents, normalizeUsgsFeature } from '../api/_lib/sources/usgs.js';
import { haversineKm, scoreShadowMatch } from '../api/_lib/events/matching.js';

test('normalizes a USGS GeoJSON feature without changing its source values', () => {
  const event = normalizeUsgsFeature({
    id: 'us7000example',
    properties: {
      time: 1790000000000,
      updated: 1790000001000,
      mag: 5.4,
      magType: 'mb',
      place: 'Offshore Philippines',
      url: 'https://earthquake.usgs.gov/example',
      felt: 12,
      mmi: 4.2,
      status: 'reviewed',
    },
    geometry: { type: 'Point', coordinates: [124.5, 12.3, 20] },
  });

  assert.equal(event.id, 'us7000example');
  assert.equal(event.source, 'USGS');
  assert.equal(event.magnitude, 5.4);
  assert.equal(event.magnitudeType, 'mb');
  assert.equal(event.depth, 20);
  assert.equal(event.latitude, 12.3);
  assert.equal(event.longitude, 124.5);
  assert.equal(event.felt, 12);
  assert.equal(event.mmi, 4.2);
});

test('keeps valid USGS events with missing magnitude and depth', () => {
  const event = normalizeUsgsFeature({
    id: 'us-no-mag',
    properties: { time: 1790000000000, mag: null, place: 'Unknown' },
    geometry: { type: 'Point', coordinates: [120, 10, null] },
  });
  assert.equal(event.magnitude, null);
  assert.equal(event.depth, null);
});

test('rejects malformed USGS geometry and timestamps', () => {
  assert.equal(normalizeUsgsFeature({
    id: 'bad', properties: { time: 'bad', mag: 4 },
    geometry: { coordinates: [120, 10, 5] },
  }), null);
});

test('validates date windows before making a USGS network request', async () => {
  await assert.rejects(
    fetchUsgsEvents({ startTime: '2026-02-01', endTime: '2026-01-01' }),
    /startTime earlier than endTime/
  );
  await assert.rejects(
    fetchUsgsEvents({ startTime: '2026-01-01', endTime: '2026-02-01', limit: 20001 }),
    /page limit/
  );
});

test('calculates geographic distance and leaves candidate matches in shadow scoring only', () => {
  assert.ok(haversineKm(0, 0, 0, 1) > 110 && haversineKm(0, 0, 0, 1) < 112);

  const match = scoreShadowMatch(
    { time: Date.UTC(2026, 0, 1), latitude: 12, longitude: 124, magnitude: 5.2, depth: 20 },
    {
      origin_time: new Date(Date.UTC(2026, 0, 1)),
      latitude: 12.01,
      longitude: 124.01,
      preferred_magnitude: 5.1,
      depth_km: 22,
    }
  );
  assert.ok(match);
  assert.ok(match.confidence > 0.8);
  assert.equal(match.evidence.mode, 'shadow_only');
  assert.equal(scoreShadowMatch(
    { time: Date.UTC(2026, 0, 1), latitude: 12, longitude: 124, magnitude: 5, depth: 20 },
    { origin_time: new Date(Date.UTC(2026, 0, 1) + 3600_000), latitude: 12, longitude: 124 }
  ), null);
});
