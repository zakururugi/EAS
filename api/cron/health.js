/**
 * GET /api/cron/health
 *
 * Simple health check endpoint for external cron services (e.g. cron-job.org).
 * Returns a lightweight status response so the cron provider can verify
 * the endpoint is alive before scheduling the actual check-quakes cron.
 *
 * This endpoint does NOT require CRON_SECRET authorization — it is
 * intentionally open so health monitors can ping it freely.
 *
 * Response: { status: "ok", timestamp: 1234567890, version: "1.0.0" }
 */

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

  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  });
}