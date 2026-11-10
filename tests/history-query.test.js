import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  parseHistoryQuery,
} from '../api/_lib/history-query.js';

const id = '6b4f9d28-1c0d-4f2d-8e5b-7a2f0d9c1234';

test('parses inclusive date filters and turns the end date into an exclusive boundary', () => {
  const result = parseHistoryQuery({ from: '2026-01-01', to: '2026-01-31', limit: '100' });
  assert.equal(result.from, '2026-01-01T00:00:00.000Z');
  assert.equal(result.to, '2026-02-01T00:00:00.000Z');
  assert.equal(result.limit, 100);
});

test('encodes and decodes stable keyset pagination cursors', () => {
  const token = encodeHistoryCursor('2026-01-02T03:04:05.000Z', id);
  assert.deepEqual(decodeHistoryCursor(token), {
    timestamp: '2026-01-02T03:04:05.000Z',
    id,
  });
});

test('rejects invalid dates, reversed ranges, magnitude, page size and cursors', () => {
  assert.throws(() => parseHistoryQuery({ from: '2026-02-30' }), /calendar date/);
  assert.throws(() => parseHistoryQuery({ from: '2026-02-01', to: '2026-01-01' }), /on or before/);
  assert.throws(() => parseHistoryQuery({ min_magnitude: '11' }), /between 0 and 10/);
  assert.throws(() => parseHistoryQuery({ limit: '501' }), /from 1 to 500/);
  assert.throws(() => decodeHistoryCursor('not-a-cursor'), /Invalid history cursor/);
});
