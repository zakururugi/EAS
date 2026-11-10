import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUsgsEvents, normalizeUsgsFeature } from '../api/_lib/sources/usgs.js';
import { haversineKm, scoreShadowMatch } from '../api/_lib/events/matching.js';
import { extractUsgsProducts } from '../api/_lib/sources/usgs.js';
import { persistUsgsProducts } from '../api/_lib/intensity/persist-usgs-products.js';

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


test('extracts preferred official ShakeMap and DYFI product URLs only from USGS host', () => {
  const products = extractUsgsProducts({
    products: {
      shakemap: [{
        code: 'shakemap-1',
        preferredWeight: 1,
        status: 'UPDATE',
        updateTime: 123,
        contents: {
          'download/cont_mi.json': { url: 'https://earthquake.usgs.gov/product/shakemap/test/cont_mi.json' },
          'download/private.json': { url: 'https://example.com/private.json' },
        },
      }],
      dyfi: [{
        code: 'dyfi-1',
        contents: {
          'download/dyfi_geo.geojson': { url: 'https://earthquake.usgs.gov/product/dyfi/test/dyfi_geo.geojson' },
        },
      }],
    },
  });

  assert.equal(products.shakemap.contourUrl, 'https://earthquake.usgs.gov/product/shakemap/test/cont_mi.json');
  assert.equal(products.dyfi.geoJsonUrl, 'https://earthquake.usgs.gov/product/dyfi/test/dyfi_geo.geojson');
  assert.equal(Object.keys(products.shakemap.files).length, 1);
});

test('persists USGS product metadata and DYFI reports as reported MMI observations', async () => {
  const calls = [];
  const fakeQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id, earthquake_event_id')) {
      return { rows: [{ id: 'source-1', earthquake_event_id: 'event-1' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };

  const result = await persistUsgsProducts('us7000test', {
    shakemap: {
      code: 'sm-1', updateTime: 100, status: 'UPDATE',
      contourUrl: 'https://earthquake.usgs.gov/cont_mi.json',
      files: { 'download/cont_mi.json': 'https://earthquake.usgs.gov/cont_mi.json' },
      rawProperties: {},
    },
    dyfi: {
      code: 'dyfi-1', updateTime: 101,
      geoJsonUrl: 'https://earthquake.usgs.gov/dyfi_geo.geojson',
      files: {},
      geojson: {
        type: 'FeatureCollection',
        features: [{
          id: 'report-1',
          properties: { name: 'Town A', cdi: 4.2, nresp: 12, dist: 30 },
          geometry: { type: 'Point', coordinates: [124.2, 12.4] },
        }],
      },
    },
  }, fakeQuery);

  assert.equal(result.storedProducts, 2);
  assert.equal(result.storedObservations, 1);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO intensity_products')));
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO intensity_observations')));
  const observation = calls.find((call) => call.sql.includes('INSERT INTO intensity_observations'));
  assert.equal(observation.params[2], 'Town A');
  assert.equal(observation.params[6], 'report-1');
});
