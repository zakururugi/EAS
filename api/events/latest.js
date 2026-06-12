/**
 * GET /api/events/latest
 *
 * Returns earthquakes from USGS (filtered to Philippines) and PHIVOLCS (official RSS feed).
 * Merges both sources, deduplicates by location (within ~0.5° lat/lon).
 * Falls back gracefully if PHIVOLCS feed fails.
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';
import Parser from 'rss-parser';
import axios from 'axios';
import https from 'https';

// Philippines bounding box
const PH_MIN_LAT = 4.5;
const PH_MAX_LAT = 21.5;
const PH_MIN_LON = 116.5;
const PH_MAX_LON = 126.5;

const PHIVOLCS_RSS_URL = 'https://earthquake.phivolcs.dost.gov.ph/feed_rss.xml';
const RSS_PARSER = new Parser();

// Custom HTTPS agent that ignores SSL certificate errors for PHIVOLCS
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function isWithinPhilippines(lat, lon) {
  if (lat == null || lon == null) return false;
  return lat >= PH_MIN_LAT && lat <= PH_MAX_LAT &&
         lon >= PH_MIN_LON && lon <= PH_MAX_LON;
}

/**
 * Fetch PHIVOLCS earthquakes from the official RSS feed.
 * Returns an array of events in the same format as USGS.
 */
async function fetchPHIVOLCSEvents() {
  try {
    // Fetch RSS feed as plain text using axios (handles SSL gracefully)
    const response = await axios.get(PHIVOLCS_RSS_URL, {
      httpsAgent,
      timeout: 5000,
      headers: { 'User-Agent': 'EarthquakeAlertSystem/1.0' }
    });

    // Parse the XML string using rss-parser
    const feed = await RSS_PARSER.parseString(response.data);
    const items = feed.items || [];

    return items.map(item => {
      // Example title: "Magnitude 4.2, 018 km N 71° W of Nasugbu (Batangas)"
      const titleMatch = item.title?.match(/Magnitude ([\d.]+), (.+)/i);
      const magnitude = titleMatch ? parseFloat(titleMatch[1]) : 0;
      const location = titleMatch ? titleMatch[2].trim() : item.title || 'Philippines';

      // Extract coordinates from description if available
      let lat = null, lon = null;
      const desc = item.description || '';
      const latMatch = desc.match(/Latitude:\s*([\d.]+)/i);
      const lonMatch = desc.match(/Longitude:\s*([\d.]+)/i);
      if (latMatch && lonMatch) {
        lat = parseFloat(latMatch[1]);
        lon = parseFloat(lonMatch[1]);
      }

      // Parse publication date
      let timestamp = Date.now();
      if (item.pubDate) {
        try {
          timestamp = new Date(item.pubDate).getTime();
        } catch { /* keep default */ }
      }

      return {
        id: `ph-${item.guid || item.link || timestamp}-${magnitude}`,
        eventId: item.guid || item.link || '',
        magnitude,
        place: location,
        time: timestamp,
        updated: timestamp,
        depth: 0,
        latitude: lat,
        longitude: lon,
        url: item.link || '',
        felt: 0,
        mmi: null,
        source: 'PHIVOLCS'
      };
    }).filter(e => e.magnitude > 0 && isWithinPhilippines(e.latitude, e.longitude));
  } catch (err) {
    console.error('[events/latest] PHIVOLCS RSS fetch failed:', err.message);
    return [];
  }
}

/**
 * Deduplicate events from USGS and PHIVOLCS by proximity (within ~0.5° lat/lon).
 * Prefers USGS if both exist for the same location.
 */
function mergeEvents(usgsEvents, phivolcsEvents) {
  const combined = [...usgsEvents];
  const used = new Set(usgsEvents.map(e => `${e.latitude?.toFixed(1)},${e.longitude?.toFixed(1)}`));

  for (const ph of phivolcsEvents) {
    const key = `${ph.latitude?.toFixed(1)},${ph.longitude?.toFixed(1)}`;
    if (!used.has(key)) {
      combined.push(ph);
      used.add(key);
    }
  }
  return combined;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const feed = req.query.feed || 'earthquakes/feed/v1.0/summary/4.5_day.geojson';
    const minMagnitude = req.query.min_magnitude ? parseFloat(req.query.min_magnitude) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;

    console.log(`[events/latest] Fetching USGS feed: ${feed}`);

    // USGS data
    const rawData = await fetchLatestEvents(feed);
    let usgsEvents = rawData.features.map(simplifyEvent);
    usgsEvents = usgsEvents.filter(e => isWithinPhilippines(e.latitude, e.longitude));
    usgsEvents.forEach(e => { e.source = 'USGS'; });

    // PHIVOLCS data via RSS (non‑critical, failures are logged)
    let phivolcsEvents = [];
    try {
      phivolcsEvents = await fetchPHIVOLCSEvents();
      console.log(`[events/latest] Fetched ${phivolcsEvents.length} PHIVOLCS events`);
    } catch (err) {
      // Already logged inside fetchPHIVOLCSEvents
    }

    // Merge and sort
    let allEvents = mergeEvents(usgsEvents, phivolcsEvents);

    if (minMagnitude > 0) {
      allEvents = allEvents.filter(e => e.magnitude >= minMagnitude);
    }

    allEvents.sort((a, b) => b.time - a.time);

    if (limit > 0 && allEvents.length > limit) {
      allEvents = allEvents.slice(0, limit);
    }

    console.log(`[events/latest] Returning ${allEvents.length} events (USGS: ${usgsEvents.length}, PHIVOLCS: ${phivolcsEvents.length})`);

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: allEvents.length,
        feed,
        region: 'Philippines'
      },
      events: allEvents
    });
  } catch (err) {
    console.error('[events/latest] Error:', err.message);
    // Return empty list instead of crashing
    res.status(200).json({
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 0, feed, region: 'Philippines', error: err.message },
      events: []
    });
  }
}
