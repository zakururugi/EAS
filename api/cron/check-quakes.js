/**
 * GET /api/cron/check-quakes
 *
 * Protected cron endpoint. Polls PHIVOLCS and sends FCM alerts for events
 * inside enabled watch zones. The event ID cursor is preferred over a wall
 * clock cutoff so multiple earthquakes reported in the same minute are not
 * silently skipped.
 */

import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    res.status(500).json({ error: 'CRON_SECRET missing or too short' });
    return;
  }

  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    console.log('[cron/check-quakes] Starting check...');

    let events;
    try {
      events = await fetchPhivolcsEvents();
    } catch (fetchError) {
      console.error('[cron/check-quakes] PHIVOLCS fetch failed:', fetchError.message);
      res.status(502).json({ checked: false, message: 'PHIVOLCS fetch failed' });
      return;
    }

    if (!Array.isArray(events)) {
      res.status(502).json({ checked: false, message: 'PHIVOLCS returned an invalid event list' });
      return;
    }

    events.sort((a, b) => a.time - b.time);

    const { query } = await import('../_lib/db.js');
    const { sendMulticastNotification, buildEarthquakeNotification } =
      await import('../_lib/fcm.js');

    const stateResult = await query(
      'SELECT last_run_at, last_event_id FROM cron_state WHERE id = 1'
    );
    const state = stateResult.rows[0] || {};
    const lastRunAt = state.last_run_at
      ? new Date(state.last_run_at).getTime()
      : Date.now() - 180000;
    const lastEventId = state.last_event_id || null;

    // Prefer the persisted event cursor. This handles events sharing the same
    // minute-level PHIVOLCS timestamp. If the cursor has aged out of the
    // published table, use a short overlap window (at-least-once fallback).
    const cursorIndex = lastEventId
      ? events.findIndex((event) => event.id === lastEventId || event.eventId === lastEventId)
      : -1;
    const newEvents = cursorIndex >= 0
      ? events.slice(cursorIndex + 1)
      : events.filter((event) => Number(event.time) > lastRunAt - 180000);

    let totalNotifications = 0;
    let processedCount = 0;

    for (const event of newEvents) {
      if (
        event.latitude == null || event.longitude == null ||
        !Number.isFinite(Number(event.latitude)) ||
        !Number.isFinite(Number(event.longitude)) ||
        !Number.isFinite(Number(event.magnitude))
      ) {
        console.error('[cron/check-quakes] Invalid event data; checkpoint held:', event.id);
        res.status(502).json({
          checked: false,
          newEvents: newEvents.length,
          processedEvents: processedCount,
          notificationsSent: totalNotifications,
          message: 'Invalid earthquake event; checkpoint not advanced',
        });
        return;
      }

      try {
        const subscriptions = await query(
          `SELECT user_id, fcm_token, zone_id, zone_name
           FROM find_subscriptions_for_epicenter($1, $2, $3)`,
          [Number(event.longitude), Number(event.latitude), Number(event.magnitude)]
        );

        const zoneMap = new Map();
        for (const row of subscriptions.rows) {
          if (!zoneMap.has(row.zone_id)) {
            zoneMap.set(row.zone_id, { zoneName: row.zone_name, tokens: new Set() });
          }
          zoneMap.get(row.zone_id).tokens.add(row.fcm_token);
        }

        for (const zoneData of zoneMap.values()) {
          const tokens = [...zoneData.tokens];
          for (let start = 0; start < tokens.length; start += 500) {
            const result = await sendMulticastNotification(
              tokens.slice(start, start + 500),
              buildEarthquakeNotification(event, zoneData.zoneName)
            );
            totalNotifications += result.successCount;
            if (result.failureCount > 0) {
              console.warn('[cron/check-quakes] Some push tokens failed:', result.failureCount);
            }
          }
        }

        processedCount++;
      } catch (eventError) {
        console.error(
          '[cron/check-quakes] Event processing failed; checkpoint held:',
          event.id,
          eventError.message
        );
        res.status(502).json({
          checked: false,
          newEvents: newEvents.length,
          processedEvents: processedCount,
          notificationsSent: totalNotifications,
          message: 'Event processing failed; checkpoint not advanced',
        });
        return;
      }
    }

    if (newEvents.length > 0) {
      const newest = newEvents[newEvents.length - 1];
      await query(
        'UPDATE cron_state SET last_run_at = NOW(), last_event_id = $1 WHERE id = 1',
        [newest.id || newest.eventId || null]
      );
    }

    res.status(200).json({
      checked: true,
      newEvents: newEvents.length,
      processedEvents: processedCount,
      notificationsSent: totalNotifications,
    });
  } catch (error) {
    console.error('[cron/check-quakes] Fatal:', error.message);
    res.status(500).json({ checked: false, message: 'Earthquake check failed' });
  }
}
