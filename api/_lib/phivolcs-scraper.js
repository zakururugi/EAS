/**
 * PHIVOLCS Earthquake Scraper
 *
 * Converts the official PHIVOLCS earthquake table into normalized events.
 * PHIVOLCS publishes local Philippine time (UTC+08:00) without an offset.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const PHIVOLCS_URL = 'https://earthquake.phivolcs.dost.gov.ph/';
const PHILIPPINE_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse PHIVOLCS local datetime text into a UTC Unix timestamp.
 * Invalid or missing timestamps return NaN; they are never replaced with now.
 */
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
    ) {
      return NaN;
    }

    return localAsUtc - PHILIPPINE_OFFSET_MS;
  }

  // Accept machine-readable timestamps only when they carry an explicit zone.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  if (!hasTimezone) return NaN;
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Parse a depth such as "008" or "015 km". */
export function parseDepth(depthStr) {
  if (typeof depthStr !== 'string' || !depthStr.trim()) return NaN;
  const match = depthStr.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const depth = Number(match[0]);
  return Number.isFinite(depth) && depth >= 0 ? depth : NaN;
}

/**
 * Scrape earthquake events from the official PHIVOLCS website.
 * The HTML structure is checked explicitly so a changed page cannot silently
 * masquerade as a successful empty feed.
 */
export async function scrapePhivolcsEvents() {
  const { data: html } = await axios.get(PHIVOLCS_URL, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EarthquakeAlertSystem/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  const $ = cheerio.load(html);
  const tables = $('table.MsoNormalTable');
  if (tables.length < 3) {
    throw new Error('PHIVOLCS earthquake table not found. Site structure may have changed.');
  }

  const events = [];

  for (let t = 2; t < tables.length; t++) {
    $(tables[t]).find('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 6) return;

      const datetime = $(cells[0]).text().trim();
      const latStr = $(cells[1]).text().trim();
      const lonStr = $(cells[2]).text().trim();
      const depthStr = $(cells[3]).text().trim();
      const magStr = $(cells[4]).text().trim();
      const place = $(cells[5]).text().trim();

      const magnitude = Number.parseFloat(magStr);
      const latitude = Number.parseFloat(latStr);
      const longitude = Number.parseFloat(lonStr);
      const depth = parseDepth(depthStr);
      const time = parsePhivolcsDatetime(datetime);

      if (
        !Number.isFinite(magnitude) || magnitude <= 0 || magnitude > 10 ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        !Number.isFinite(depth) || !Number.isFinite(time) || !place
      ) {
        return;
      }

      // Include coordinates in the deterministic ID to avoid collisions when
      // two events share a timestamp and magnitude.
      const id = `ph-${time}-${magnitude}-${latitude}-${longitude}`;

      events.push({
        id,
        eventId: id,
        magnitude,
        place,
        time,
        updated: time,
        depth,
        latitude,
        longitude,
        url: PHIVOLCS_URL,
        felt: 0,
        mmi: null,
        source: 'PHIVOLCS',
      });
    });
  }

  return events;
}

/**
 * Fetch events. Errors are allowed to propagate to callers so API routes and
 * cron jobs can distinguish a failed scrape from a genuinely empty feed.
 */
export async function fetchPhivolcsEvents() {
  const events = await scrapePhivolcsEvents();
  console.log(`[phivolcs-scraper] Scraped ${events.length} events`);
  return events;
}
