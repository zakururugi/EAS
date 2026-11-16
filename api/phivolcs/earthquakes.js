/**
 * Legacy compatibility endpoint.
 *
 * This route previously returned the complete PHIVOLCS feed (hundreds of
 * rows), which made scheduled invocations exceed Vercel's output limit. Live
 * ingestion belongs to /api/cron/check-quakes; bounded history queries belong
 * to /api/events/history. Keep this response small for any stale external
 * schedule until it is removed from the Vercel Cron Jobs screen.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  res.status(200).json({
    source: 'PHIVOLCS',
    status: 'deprecated',
    fetchedAt: new Date().toISOString(),
    count: 0,
    message: 'This legacy full-feed export is disabled. Scheduled ingestion uses /api/cron/check-quakes. Recent and historical browsing uses /api/events/history.',
    removeSchedule: true,
  });
}
