/**
 * PHIVOLCS earthquake feed adapter.
 *
 * PHIVOLCS publishes Philippine local time (UTC+08:00) without an offset.
 * Table discovery is content-based: no fixed table index or CSS class is
 * assumed. A changed/unrecognizable page fails explicitly instead of
 * returning a false empty catalogue.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const PHIVOLCS_URLS = [
  // Current official PHIVOLCS earthquake table endpoint.
  'https://earthquake.phivolcs.dost.gov.ph/Tsunami_Latest.html',
  // Legacy official host retained as a secondary fallback.
  'https://tsunami.phivolcs.dost.gov.ph/Tsunami_Latest.html',
];
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parsePhivolcsDatetime(datetimeStr) {
  if (typeof datetimeStr !== 'string' || !datetimeStr.trim()) return NaN;

  const cleaned = datetimeStr.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(
    /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*[-–]?\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );

  if (match) {
    const [, dayText, monthText, yearText, hourText, minuteText, ampm] = match;
    const month = MONTHS[monthText.toLowerCase().slice(0, 3)];
    const day = Number(dayText);
    const year = Number(yearText);
    let hour = Number(hourText);
    const minute = Number(minuteText);

    if (month === undefined || day < 1 || day > 31 || hour < 1 || hour > 12 || minute > 59) {
      return NaN;
    }

    if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;

    const localAsUtc = Date.UTC(year, month, day, hour, minute);
    const check = new Date(localAsUtc);
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month ||
      check.getUTCDate() !== day ||
      check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute
    ) return NaN;

    return localAsUtc - PHILIPPINE_OFFSET_MS;
  }

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  if (!hasTimezone) return NaN;
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseDepth(depthStr) {
  if (typeof depthStr !== 'string' || !depthStr.trim()) return NaN;
  const match = depthStr.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const depth = Number(match[0]);
  return Number.isFinite(depth) && depth >= 0 ? depth : NaN;
}

/**
 * Parse a coordinate while honoring PHIVOLCS hemisphere suffixes.
 * Number.parseFloat alone loses S/W signs (e.g. 13.8°S becomes +13.8).
 */
export function parsePhivolcsCoordinate(value, positiveHemisphere, negativeHemisphere) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  const text = String(value).trim().replace(/,/g, '');
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
  if (!match) return NaN;
  let coordinate = Number(match[1]);
  const hemisphere = (match[2] || '').toUpperCase();
  if (hemisphere) {
    if (hemisphere === positiveHemisphere) coordinate = Math.abs(coordinate);
    else if (hemisphere === negativeHemisphere) coordinate = -Math.abs(coordinate);
    else return NaN;
  }
  return Number.isFinite(coordinate) ? coordinate : NaN;
}

/**
 * Parse one PHIVOLCS data row in the documented column order:
 * date/time, latitude, longitude, depth, magnitude, location.
 */
export function parsePhivolcsEventRow(values, sourceUrl = PHIVOLCS_URLS[0]) {
  if (!Array.isArray(values) || values.length < 6) return null;

  const [datetime, latText, lonText, depthText, magnitudeText, placeText] =
    values.map((value) => String(value ?? '').trim());

  const magnitude = Number.parseFloat(magnitudeText);
  const latitude = parsePhivolcsCoordinate(latText, 'N', 'S');
  const longitude = parsePhivolcsCoordinate(lonText, 'E', 'W');
  const depth = parseDepth(depthText);
  const time = parsePhivolcsDatetime(datetime);
  const place = placeText.replace(/\s+/g, ' ').trim();

  if (
    !Number.isFinite(magnitude) || magnitude <= 0 || magnitude > 10 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(depth) || !Number.isFinite(time) || !place
  ) return null;

  const id = `ph-${time}-${magnitude}-${latitude}-${longitude}`;
  return {
    id,
    eventId: id,
    magnitude,
    place,
    time,
    updated: time,
    depth,
    latitude,
    longitude,
    url: sourceUrl,
    felt: 0,
    mmi: null,
    source: 'PHIVOLCS',
  };
}

function looksLikeEarthquakeHeader($, table) {
  const text = $(table).find('tr').slice(0, 3).text().toLowerCase().replace(/\s+/g, ' ');
  const groups = [
    /date|time/,
    /latitude|\blat\b/,
    /longitude|\blongitude|\blon\b/,
    /depth/,
    /magnitude|\bmag\b/,
    /location|\bplace\b/,
  ];
  return groups.filter((pattern) => pattern.test(text)).length >= 4;
}

function readTableRows($, table, sourceUrl) {
  return $(table).find('tr').toArray().map((row) => {
    const cells = $(row).find('td').toArray();
    if (cells.length < 6) return { isDataRow: false, event: null };

    const values = cells.slice(0, 6).map((cell) => $(cell).text().trim());
    const headerText = values.join(' ').toLowerCase();
    const isHeaderRow =
      /date|time/.test(headerText) &&
      /latitude|\blat\b/.test(headerText) &&
      /longitude|\blon\b/.test(headerText) &&
      /depth/.test(headerText);

    if (isHeaderRow) return { isDataRow: false, event: null };
    return { isDataRow: true, event: parsePhivolcsEventRow(values, sourceUrl) };
  });
}

export function parsePhivolcsHtml(html, sourceUrl = PHIVOLCS_URLS[0]) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('PHIVOLCS returned an empty HTML document.');
  }

  const $ = cheerio.load(html);
  const tables = $('table').toArray();
  if (tables.length === 0) {
    throw new Error('PHIVOLCS earthquake table not found. Site structure may have changed.');
  }

  const discoveredEvents = [];
  let recognizedEmptyTable = false;
  let malformedDataTable = false;

  for (const table of tables) {
    const rows = readTableRows($, table, sourceUrl);
    const validRows = rows.map((row) => row.event).filter(Boolean);
    const dataRowCount = rows.filter((row) => row.isDataRow).length;
    const recognizedHeader = looksLikeEarthquakeHeader($, table);

    if (validRows.length > 0) {
      discoveredEvents.push(...validRows);
    } else if (recognizedHeader && dataRowCount === 0) {
      recognizedEmptyTable = true;
    } else if (recognizedHeader && dataRowCount > 0) {
      malformedDataTable = true;
    }
  }

  if (discoveredEvents.length === 0) {
    if (recognizedEmptyTable && !malformedDataTable) return [];
    throw new Error('PHIVOLCS page was reachable but no valid earthquake rows could be parsed.');
  }

  const uniqueEvents = new Map();
  for (const event of discoveredEvents) uniqueEvents.set(event.id, event);
  return [...uniqueEvents.values()].sort((a, b) => b.time - a.time);
}

const MONTH_NUMBERS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function discoverPhivolcsArchiveMonths(html, baseUrl = PHIVOLCS_URLS[0]) {
  const $ = cheerio.load(html);
  const discovered = new Map();

  $('a[href]').each((_, anchor) => {
    const link = $(anchor);
    const label = link.text().trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 3);
    const month = MONTH_NUMBERS[label];
    if (!month) return;

    const href = link.attr('href');
    if (!href || /^(?:javascript:|mailto:|#)/i.test(href)) return;

    const context = `${link.closest('tr').text()} ${link.parent().parent().text()} ${href}`;
    const yearMatch = context.match(/\b(19|20)\d{2}\b/);
    if (!yearMatch) return;

    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (
      url.protocol !== 'https:' ||
      !url.hostname.toLowerCase().endsWith('phivolcs.dost.gov.ph')
    ) return;

    const year = Number(yearMatch[0]);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    discovered.set(key, { year, month, key, url: url.toString() });
  });

  return [...discovered.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchPhivolcsArchiveMonths() {
  const failures = [];
  const all = new Map();

  for (const sourceUrl of PHIVOLCS_URLS) {
    try {
      const { data: html } = await axios.get(sourceUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EarthquakeAlertSystem/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      for (const archive of discoverPhivolcsArchiveMonths(html, sourceUrl)) {
        all.set(archive.key, archive);
      }
    } catch (error) {
      failures.push(`${sourceUrl}: ${error.message}`);
    }
  }

  if (all.size === 0 && failures.length > 0) {
    throw new Error(`Unable to discover PHIVOLCS archive months: ${failures.join(' | ')}`);
  }
  return [...all.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchPhivolcsArchiveMonth(year, month) {
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getUTCFullYear()) {
    throw new TypeError('Invalid PHIVOLCS archive year.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new TypeError('Invalid PHIVOLCS archive month.');
  }

  const key = `${year}-${String(month).padStart(2, '0')}`;
  const archives = await fetchPhivolcsArchiveMonths();
  const archive = archives.find((item) => item.key === key);
  if (!archive) throw new Error(`PHIVOLCS archive month ${key} is not currently linked by the official archive index.`);

  const { data: html } = await axios.get(archive.url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EarthquakeAlertSystem/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  return parsePhivolcsHtml(html, archive.url);
}

export async function scrapePhivolcsEvents() {
  const failures = [];
  let recognizedEmptyFeed = false;

  for (const sourceUrl of PHIVOLCS_URLS) {
    try {
      const { data: html } = await axios.get(sourceUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EarthquakeAlertSystem/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const events = parsePhivolcsHtml(html, sourceUrl);
      if (events.length > 0) return events;
      recognizedEmptyFeed = true;
    } catch (error) {
      failures.push(`${sourceUrl}: ${error.message}`);
    }
  }

  if (recognizedEmptyFeed) return [];
  throw new Error(`All official PHIVOLCS feed endpoints failed: ${failures.join(' | ')}`);
}

/**
 * Fetch events. Errors propagate so API routes and cron jobs can distinguish
 * a failed scrape from a genuinely empty, recognized feed.
 */
export async function fetchPhivolcsEvents() {
  const events = await scrapePhivolcsEvents();
  console.log(`[phivolcs-scraper] Parsed ${events.length} events`);
  return events;
}
