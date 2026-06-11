/**
 * GET /api/cron/check-quakes
 *
 * CRON job endpoint (called every minute by Vercel Cron Jobs).
 * Protected by CRON_SECRET header check.
 *
 * Process:
 * 1. Fetch latest USGS feed (4.5_day)
 * 2. Compare with last_run_at from cron_state table
 * 3. For each new earthquake, query DB for matching subscriptions
 * 4. Send FCM multicast notifications
 *
 * To test manually:
 *   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/check-quakes
 */

import { fetchLatestEvents, simplifyEvent } from '../_lib/usgs.js';
import { query } from '../_lib/db.js';
import { sendMulticastNotification, buildEarthquakeNotification } from '../_lib/fcm.js';

// USGS feed to poll
const USGS_FEED = 'earthquakes/feed/v1.0/summary/4.5_day.geojson';

export default async function handler(req, res) {
  // Verify CRON_SECRET
  const authHeader = req.headers['authorization'] || '';
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    res.status(401).json({ error: 'Unauthorized. Invalid or missing CRON_SECRET.' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startTime = Date.now();

  try {
    console.log('[cron/check-quakes] Starting check...');

    // 1. Get last run timestamp from cron_state
    const cronState = await query(
      `SELECT last_run_at, last_event_id FROM cron_state WHERE id = 1`
    );

    let lastRunAt;
    let lastEventId;

    if (cronState.rows.length > 0) {
      lastRunAt = new Date(cronState.rows[0].last_run_at).getTime();
      lastEventId = cronState.rows[0].last_event_id;
    } else {
      // Initialize if not exists
      lastRunAt = Date.now() - 120000; // 2 minutes ago
      await query(
        `INSERT INTO cron_state (id, last_run_at) VALUES (1, NOW()) ON CONFLICT (id) DO NOTHING`
      );
    }

    console.log(`[cron/check-quakes] Last run at: ${new Date(lastRunAt).toISOString()}, last event: ${lastEventId}`);

    // 2. Fetch USGS feed
    const rawData = await fetchLatestEvents(USGS_FEED);

    if (!rawData.features || rawData.features.length === 0) {
      console.log('[cron/check-quakes] No events in USGS feed');
      await updateCronState(lastEventId);
      res.status(200).json({ checked: true, newEvents: 0, message: 'No events in feed' });
      return;
    }

    // 3. Parse and filter new events (since last run)
    const events = rawData.features.map(simplifyEvent);

    // Sort by time ascending so we process oldest new events first
    events.sort((a, b) => a.time - b.time);

    const newEvents = events.filter((e) => e.time > lastRunAt);

    console.log(`[cron/check-quakes] Found ${newEvents.length} new events (total in feed: ${events.length})`);

    if (newEvents.length === 0) {
      console.log('[cron/check-quakes] No new events since last run');
      await updateCronState(lastEventId);
      res.status(200).json({ checked: true, newEvents: 0 });
      return;
    }

    // 4. Process each new event
    let totalNotificationsSent = 0;
    let processedCount = 0;

    for (const event of newEvents) {
      try {
        const { latitude, longitude, magnitude, place, id: eventId } = event;

        console.log(`[cron/check-quakes] Processing event ${eventId}: M${magnitude} at ${place}`);

        // Skip events without valid coordinates or magnitude
        if (!latitude || !longitude || magnitude == null) {
          console.log(`[cron/check-quakes] Skipping event ${eventId}: missing lat/lon/mag`);
          continue;
        }

        // 5. Query DB for matching subscriptions using the PostGIS function
        const subsResult = await query(
          `SELECT user_id, fcm_token, zone_id, zone_name
           FROM find_subscriptions_for_epicenter($1, $2, $3)`,
          [longitude, latitude, magnitude]
        );

        if (subsResult.rows.length === 0) {
          console.log(`[cron/check-quakes] Event ${eventId}: no matching subscriptions`);
          continue;
        }

        // Group by zone for notification messages
        const zoneMap = {};
        for (const row of subsResult.rows) {
          if (!zoneMap[row.zone_id]) {
            zoneMap[row.zone_id] = {
              zoneName: row.zone_name,
              tokens: [],
            };
          }
          zoneMap[row.zone_id].tokens.push(row.fcm_token);
        }

        // 6. Send notifications per zone
        for (const [zoneId, zoneData] of Object.entries(zoneMap)) {
          const notification = buildEarthquakeNotification(event, zoneData.zoneName);

          // Deduplicate tokens
          const uniqueTokens = [...new Set(zoneData.tokens)];

          if (uniqueTokens.length === 0) continue;

          // FCM multicast has a limit of 500 tokens per call
          const batchSize = 500;
          for (let i = 0; i < uniqueTokens.length; i += batchSize) {
            const batch = uniqueTokens.slice(i, i + batchSize);

            const result = await sendMulticastNotification(batch, notification);
            totalNotificationsSent += result.successCount;

            console.log(
              `[cron/check-quakes] Event ${eventId}, Zone ${zoneId}: ` +
              `${result.successCount} sent, ${result.failureCount} failed`
            );

            // If some tokens failed, we could clean them up here
            if (result.failureCount > 0) {
              const failedTokens = batch.filter((_, idx) => !result.responses[idx]?.success);
              if (failedTokens.length > 0) {
                console.log(`[cron/check-quakes] Cleaning up ${failedTokens.length} invalid tokens...`);
                for (const token of failedTokens) {
                  try {
                    await query(`DELETE FROM push_subscriptions WHERE fcm_token = $1`, [token]);
                  } catch (cleanErr) {
                    console.error(`[cron/check-quakes] Error cleaning token:`, cleanErr.message);
                  }
                }
              }
            }
          }
        }

        processedCount++;
      } catch (eventErr) {
        console.error(`[cron/check-quakes] Error processing event ${event.id}:`, eventErr.message);
        // Continue with next event
      }
    }

    // 7. Update cron state
    const newestEvent = newEvents[newEvents.length - 1];
    await updateCronState(newestEvent?.id || lastEventId);

    const duration = Date.now() - startTime;

    console.log(
      `[cron/check-quakes] Done. Processed ${processedCount}/${newEvents.length} new events, ` +
      `${totalNotificationsSent} notifications sent in ${duration}ms`
    );

    res.status(200).json({
      checked: true,
      newEvents: newEvents.length,
      processedEvents: processedCount,
      notificationsSent: totalNotificationsSent,
      durationMs: duration,
    });
  } catch (err) {
    console.error('[cron/check-quakes] Fatal error:', err.message);

    // Update cron state even on error so we don't keep re-processing old events
    try {
      await updateCronState(null);
    } catch (_) {}

    res.status(500).json({
      error: 'Cron job failed',
      details: err.message,
    });
  }
}

/**
 * Update the cron_state singleton row.
 */
async function updateCronState(lastEventId) {
  await query(
    `UPDATE cron_state SET last_run_at = NOW(), last_event_id = $1 WHERE id = 1`,
    [lastEventId]
  );
}