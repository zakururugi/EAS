/**
 * PHIVOLCS Earthquake Scraper
 *
 * Scrapes earthquake data from the PHIVOLCS website HTML table
 * and returns events in a format compatible with USGS event objects.
 *
 * Actual PHIVOLCS table columns (from saved HTML):
 *   Date-Time | Latitude (ºN) | Longitude (ºE) | Depth (km) | Mag | Location
 *
 * This replaces the old RSS feed approach (which no longer exists).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const PHIVOLCS_URL = 'https://earthquake.phivolcs.dost.gov.ph/';

// PHIVOLCS SSL certificate is self-signed; this agent skips verification.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Parse a PHIVOLCS datetime string like "13 June 2026 - 02:32 AM"
 * into a Unix timestamp (milliseconds).
 */
function parsePhivolcsDatetime(datetimeStr) {
  if (!datetimeStr) return Date.now();
  // Normalize: remove extra whitespace
  const cleaned = datetimeStr.replace(/\s+/g, ' ').trim();
  // Try format: "13 June 2026 - 02:32 AM" or "13 June 2026 02:32 AM"
  const match = cleaned.match(
    /(\d{1,2})\s+(\w+)\s+(\d{4})\s*[-–]?\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (match) {
    const [, day, month, year, hour, minute, ampm] = match;
    let h = parseInt(hour, 10);
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const m = months[month.toLowerCase().substring(0, 3)];
    if (m !== undefined) {
      return new Date(parseInt(year, 10), m, parseInt(day, 10), h, parseInt(minute, 10)).getTime();
    }
  }
  // Fallback: try parsing as ISO-like
  const d = new Date(datetimeStr);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

/**
 * Parse depth string like "008" or "015 km" to a number (km).
 */
function parseDepth(depthStr) {
  if (!depthStr) return 0;
  const m = depthStr.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Scrape earthquake events from the PHIVOLCS website.
 *
 * The page has multiple <table class="MsoNormalTable">:
 *   [0] = header banner
 *   [1] = month label ("JUNE 2026")
 *   [2+] = actual earthquake data tables
 *
 * @returns {Promise<Array>} Array of event objects (same shape as USGS simplifyEvent).
 */
export async function scrapePhivolcsEvents() {
  const { data: html } = await axios.get(PHIVOLCS_URL, {
    httpsAgent,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EarthquakeAlertSystem/1.0)',
    },
  });

  const $ = cheerio.load(html);

  // Select all MsoNormalTable tables, skip the first 2 (header & month label)
  const tables = $('table.MsoNormalTable');
  if (tables.length < 3) {
    throw new Error('PHIVOLCS earthquake table not found. Site structure may have changed.');
  }

  const events = [];

  // The data tables start at index 2+
  for (let t = 2; t < tables.length; t++) {
    const table = $(tables[t]);

    // Skip header rows (<th>) and only process data rows (<tr> with <td>)
    table.find('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 6) return;

      // Column mapping (from saved HTML analysis):
      //   0 = Date-Time    (inside <a><span class="auto-style99">...</span></a>)
      //   1 = Latitude     (ºN)
      //   2 = Longitude    (ºE)
      //   3 = Depth        (km)
      //   4 = Magnitude    (Mag)
      //   5 = Location
      const datetime = $(cells[0]).text().trim();
      const latStr = $(cells[1]).text().trim();
      const lonStr = $(cells[2]).text().trim();
      const depthStr = $(cells[3]).text().trim();
      const magStr = $(cells[4]).text().trim();
      const location = $(cells[5]).text().trim();

      const magnitude = parseFloat(magStr);
      if (isNaN(magnitude) || magnitude <= 0) return;

      const depth = parseDepth(depthStr);
      const time = parsePhivolcsDatetime(datetime);

      const latNum = parseFloat(latStr);
      const lonNum = parseFloat(lonStr);
      const lat = isNaN(latNum) ? null : latNum;
      const lon = isNaN(lonNum) ? null : lonNum;

      const id = `ph-${time}-${magnitude}`;

      events.push({
        id,
        eventId: id,
        magnitude,
        place: location,
        time,
        updated: time,
        depth,
        latitude: lat,
        longitude: lon,
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
 * Convenience: scrape and return PHIVOLCS events.
 * Returns empty array on failure (errors are logged).
 *
 * @returns {Promise<Array>}
 */
export async function fetchPhivolcsEvents() {
  try {
    const events = await scrapePhivolcsEvents();
    console.log(`[phivolcs-scraper] Scraped ${events.length} events`);
    return events;
  } catch (err) {
    console.error('[phivolcs-scraper] Error:', err.message);
    return [];
  }
}