import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  parseHistoryQuery,
} from '../api/_lib/history-query.js';

const id = '6b4f9d28-1c0d-4f2d-8e5b-7a2f0d9c1234';

test('converts inclusive Philippine calendar dates into UTC+08 boundaries', () => {
  const result = parseHistoryQuery({ from: '2026-01-01', to: '2026-01-31', limit: '100' });
  assert.equal(result.from, '2025-12-31T16:00:00.000Z');
  assert.equal(result.to, '2026-01-31T16:00:00.000Z');
  assert.equal(result.fromDate, '2026-01-01');
  assert.equal(result.toDate, '2026-01-31');
  assert.equal(result.rangeDays, 31);
  assert.equal(result.limit, 100);
});

test('handles Philippine date boundaries across month and leap-day transitions', () => {
  const leapDay = parseHistoryQuery({ from: '2024-02-29', to: '2024-02-29' });
  assert.equal(leapDay.from, '2024-02-28T16:00:00.000Z');
  assert.equal(leapDay.to, '2024-02-29T16:00:00.000Z');
  assert.equal(leapDay.rangeDays, 1);
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
