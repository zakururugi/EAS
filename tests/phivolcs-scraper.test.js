import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDepth,
  parsePhivolcsDatetime,
  parsePhivolcsEventRow,
  parsePhivolcsHtml,
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


test('parses PHIVOLCS rows from a table regardless of CSS class or table index', () => {
  const html = `
    <table><tr><td>Navigation</td></tr></table>
    <table>
      <tr><td>Date - Time</td><td>Latitude</td><td>Longitude</td><td>Depth</td><td>Magnitude</td><td>Location</td></tr>
      <tr><td>13 June 2026 - 02:32 AM</td><td>14.5</td><td>121.0</td><td>008 km</td><td>4.8</td><td>Batangas</td></tr>
    </table>`;
  const events = parsePhivolcsHtml(html);
  assert.equal(events.length, 1);
  assert.equal(events[0].place, 'Batangas');
  assert.equal(events[0].source, 'PHIVOLCS');
  assert.equal(events[0].latitude, 14.5);
});

test('recognizes a valid empty earthquake table but rejects a malformed data table', () => {
  const emptyHtml = `
    <table>
      <tr><th>Date - Time</th><th>Latitude</th><th>Longitude</th><th>Depth</th><th>Magnitude</th><th>Location</th></tr>
    </table>`;
  assert.deepEqual(parsePhivolcsHtml(emptyHtml), []);

  const malformedHtml = `
    <table>
      <tr><td>Date - Time</td><td>Latitude</td><td>Longitude</td><td>Depth</td><td>Magnitude</td><td>Location</td></tr>
      <tr><td>broken row</td><td>x</td><td>x</td><td>x</td><td>x</td><td>Unknown</td></tr>
    </table>`;
  assert.throws(() => parsePhivolcsHtml(malformedHtml), /no valid earthquake rows/);
});

test('rejects PHIVOLCS rows with missing or out-of-range fields', () => {
  assert.equal(parsePhivolcsEventRow(['13 June 2026 - 02:32 AM', '999', '121', '8', '4.8', 'Place']), null);
  assert.equal(parsePhivolcsEventRow(['13 June 2026 - 02:32 AM', '14', '121', '8', '4.8', '']), null);
  assert.equal(parsePhivolcsEventRow(['bad date', '14', '121', '8', '4.8', 'Place']), null);
});
