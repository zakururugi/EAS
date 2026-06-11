/**
 * GET /api/phivolcs/rss
 * Fetches PHIVOLCS earthquake RSS feed and returns JSON.
 */
import Parser from 'rss-parser';

const RSS_URL = 'https://earthquake.phivolcs.dost.gov.ph/feed_rss.xml';
const parser = new Parser();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const feed = await parser.parseURL(RSS_URL);
    const events = feed.items.map(item => {
      // Parse title: e.g. "Magnitude 4.2, 018 km N 71° W of Nasugbu (Batangas)"
      const titleMatch = item.title.match(/Magnitude ([\d.]+), (.+)/i);
      const magnitude = titleMatch ? parseFloat(titleMatch[1]) : 0;
      const location = titleMatch ? titleMatch[2] : item.title;

      // Extract coordinates from description (if available) – optional
      let lat = null, lon = null;
      const coordMatch = item.description?.match(/Latitude:\s*([\d.]+).*Longitude:\s*([\d.]+)/i);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
      }

      return {
        id: `ph-${item.guid || item.link}`,
        eventId: item.guid || item.link,
        magnitude,
        place: location,
        time: new Date(item.pubDate).getTime(),
        depth: 0, // RSS feed doesn't provide depth reliably
        latitude: lat,
        longitude: lon,
        source: 'PHIVOLCS',
        url: item.link,
        title: item.title,
        description: item.description,
      };
    });

    // Keep only events with valid magnitude
    const filtered = events.filter(e => e.magnitude > 0);

    res.status(200).json({
      lastUpdated: new Date().toISOString(),
      count: filtered.length,
      earthquakes: filtered,
    });
  } catch (error) {
    console.error('[PHIVOLCS RSS] Error:', error.message);
    res.status(502).json({ error: 'Failed to fetch PHIVOLCS RSS feed' });
  }
}