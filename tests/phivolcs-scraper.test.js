import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDepth,
  parsePhivolcsDatetime,
} from '../api/_lib/phivolcs-scraper.js';

test('parses PHIVOLCS morning time as Philippine local time', () => {
  assert.equal(
    parsePhivolcsDatetime('13 June 2026 - 02:32 AM'),
    Date.UTC(2026, 5, 12, 18, 32)
  );
});

test('parses PHIVOLCS afternoon time as Philippine local time', () => {
  assert.equal(
    parsePhivolcsDatetime('13 June 2026 - 02:32 PM'),
    Date.UTC(2026, 5, 13, 6, 32)
  );
});

test('rejects invalid or missing PHIVOLCS timestamps instead of using current time', () => {
  assert.ok(Number.isNaN(parsePhivolcsDatetime('')));
  assert.ok(Number.isNaN(parsePhivolcsDatetime('31 February 2026 - 02:32 PM')));
  assert.ok(Number.isNaN(parsePhivolcsDatetime('unknown')));
});

test('accepts explicit timezone timestamps', () => {
  assert.equal(
    parsePhivolcsDatetime('2026-06-13T02:32:00+08:00'),
    Date.UTC(2026, 5, 12, 18, 32)
  );
});

test('parses valid depth values', () => {
  assert.equal(parseDepth('008'), 8);
  assert.equal(parseDepth('15.5 km'), 15.5);
});

test('rejects missing, invalid, and negative depth values', () => {
  assert.ok(Number.isNaN(parseDepth('')));
  assert.ok(Number.isNaN(parseDepth('unknown')));
  assert.ok(Number.isNaN(parseDepth('-4 km')));
});
