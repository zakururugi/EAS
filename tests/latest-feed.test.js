import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoundedNumber, prepareLatestEvents } from '../api/_lib/latest-feed.js';

test('accepts a valid empty PHIVOLCS catalogue as an empty result', () => {
  assert.deepEqual(prepareLatestEvents([]), []);
});

test('rejects a malformed provider payload instead of treating it as empty', () => {
  assert.throws(() => prepareLatestEvents(null), /non-array event payload/);
  assert.throws(() => prepareLatestEvents({ events: [] }), /non-array event payload/);
});

test('filters invalid rows, applies magnitude threshold, sorts newest first and caps results', () => {
  const events = [
    { id: 'old', time: 100, magnitude: 5, latitude: 10, longitude: 120, depth: 10 },
    { id: 'new', time: 300, magnitude: 6, latitude: 11, longitude: 121, depth: 20 },
    { id: 'below', time: 400, magnitude: 3, latitude: 12, longitude: 122, depth: 5 },
    { id: 'bad', time: 'invalid', magnitude: 8, latitude: 13, longitude: 123, depth: 5 },
  ];

  assert.deepEqual(
    prepareLatestEvents(events, { minMagnitude: 4, limit: 1 }).map((event) => event.id),
    ['new']
  );
});

test('bounded numeric query parsing rejects malformed and out-of-range values', () => {
  assert.equal(parseBoundedNumber(undefined, 200, 1, 500, 'limit'), 200);
  assert.equal(parseBoundedNumber('4.5', 0, 0, 10, 'min_magnitude'), 4.5);
  assert.throws(() => parseBoundedNumber('NaN', 0, 0, 10, 'min_magnitude'), { statusCode: 400 });
  assert.throws(() => parseBoundedNumber('501', 200, 1, 500, 'limit'), { statusCode: 400 });
});
