/**
 * GET /api/cron/check-quakes
 *
 * CRON job endpoint. Protected by CRON_SECRET.
 * Checks for new PHIVOLCS earthquakes and sends push notifications.
 * Returns a compact response (small payload to avoid "output too large").
 */

import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    res.status(500).json({ error: 'CRON_SECRET missing' });
    return;
  }
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    console.log('[cron/check-quakes] Starting check...');

    // Fetch PHIVOLCS events
    let events;
    try {
      events = await fetchPhivolcsEvents();
    } catch (fetchErr) {
      console.warn('[cron/check-quakes] PHIVOLCS fetch failed:', fetchErr.message);
      res.status(200).json({ checked: true, newEvents: 0, message: 'PHIVOLCS fetch failed' });
      return;
    }

    if (!events || events.length === 0) {
      res.status(200).json({ checked: true, newEvents: 0, message: 'No events' });
      return;
    }

    events.sort((a, b) => a.time - b.time);
    let totalNotifications = 0;
    let processedCount = 0;

    // Try DB operations - gracefully skip if unavailable
    try {
      const { query } = await import('../_lib/db.js');
      let { sendMulticastNotification, buildEarthquakeNotification } = await import('../_lib/fcm.js');

      const cronState = await query(`SELECT last_run_at FROM cron_state WHERE id = 1`);
      const lastRunAt = cronState.rows.length > 0 ? new Date(cronState.rows[0].last_run_at).getTime() : Date.now() - 180000;
      const newEvents = events.filter((e) => e.time > lastRunAt);

      if (newEvents.length > 0) {
        for (const event of newEvents) {
          try {
            if (!event.latitude || !event.longitude || event.magnitude == null) continue;
            const subsResult = await query(
              `SELECT user_id, fcm_token, zone_id, zone_name FROM find_subscriptions_for_epicenter($1, $2, $3)`,
              [event.longitude, event.latitude, event.magnitude]
            );
            if (subsResult.rows.length === 0) continue;

            const zoneMap = {};
            for (const row of subsResult.rows) {
              if (!zoneMap[row.zone_id]) zoneMap[row.zone_id] = { zoneName: row.zone_name, tokens: [] };
              zoneMap[row.zone_id].tokens.push(row.fcm_token);
            }
            for (const [zoneId, zoneData] of Object.entries(zoneMap)) {
              const notification = buildEarthquakeNotification(event, zoneData.zoneName);
              const uniqueTokens = [...new Set(zoneData.tokens)];
              if (uniqueTokens.length === 0) continue;
              const result = await sendMulticastNotification(uniqueTokens.slice(0, 500), notification);
              totalNotifications += result.successCount;
            }
            processedCount++;
          } catch (evErr) { console.error('[cron/check-quakes] Event error:', evErr.message); }
        }
      }

      const newest = newEvents[newEvents.length - 1];
      await query(`UPDATE cron_state SET last_run_at = NOW(), last_event_id = $1 WHERE id = 1`, [newest?.id]);
    } catch (dbErr) {
      console.warn('[cron/check-quakes] DB unavailable:', dbErr.message);
    }

    // Compact response — avoid "output too large"
    res.status(200).json({
      checked: true,
      newEvents: events.length,
      processedEvents: processedCount,
      notificationsSent: totalNotifications,
    });
  } catch (err) {
    console.error('[cron/check-quakes] Fatal:', err.message);
    // Return 200 with minimal payload even on fatal errors
    res.status(200).json({ checked: false, newEvents: 0, message: err.message });
  }
}