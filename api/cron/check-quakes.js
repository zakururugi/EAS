/**
 * Protected PHIVOLCS ingestion and notification dispatcher.
 *
 * PHIVOLCS-backed records are the only events eligible for EAS push alerts.
 * Event persistence and recipient-level delivery records are committed before
 * the source cursor advances. Individual FCM failures remain retryable in the
 * delivery ledger and do not cause other recipients to be sent duplicate pushes.
 */

import { randomUUID } from 'node:crypto';
import { fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';
import { persistPhivolcsEvent } from '../_lib/ingestion/persist-phivolcs-event.js';
import {
  aggregateWatchZoneMatches,
  buildDeliveryIdempotencyKey,
  classifyDeliveryFailure,
} from '../_lib/notifications/delivery.js';
import { query } from '../_lib/db.js';
import { sendMulticastNotification, buildEarthquakeNotification } from '../_lib/fcm.js';

const RETRY_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 8;
const OVERLAP_MS = 15 * 60 * 1000;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function acquireCronLease(owner) {
  const result = await query(
    `UPDATE cron_state
     SET lease_owner = $1, lease_expires_at = NOW() + INTERVAL '60 seconds'
     WHERE id = 1
       AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
     RETURNING id`,
    [owner]
  );
  return result.rows.length === 1;
}

async function releaseCronLease(owner) {
  await query(
    `UPDATE cron_state
     SET lease_owner = NULL, lease_expires_at = NULL
     WHERE id = 1 AND lease_owner = $1`,
    [owner]
  );
}

async function markSourceAttempt(status, error = null, cursor = null) {
  await query(
    `INSERT INTO source_sync_state (
       provider, cursor_value, last_attempt_at, last_success_at, status, last_error, updated_at
     ) VALUES ('PHIVOLCS', $1, NOW(), CASE WHEN $2 = 'healthy' THEN NOW() ELSE NULL END, $2, $3, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       cursor_value = COALESCE(EXCLUDED.cursor_value, source_sync_state.cursor_value),
       last_attempt_at = NOW(),
       last_success_at = CASE WHEN EXCLUDED.status = 'healthy'
         THEN NOW() ELSE source_sync_state.last_success_at END,
       status = EXCLUDED.status,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()`,
    [cursor, status, error]
  );
}

async function stageRecipientDeliveries(event, canonicalEventId) {
  const matches = await query(
    `SELECT u.id AS user_id, ps.id AS subscription_id, ps.fcm_token,
            wz.id AS zone_id, wz.name AS zone_name
     FROM watch_zones wz
     JOIN users u ON u.id = wz.user_id
     JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE wz.enabled = TRUE
       AND wz.min_magnitude <= $3
       AND wz.zone_geom && ST_SetSRID(
         ST_MakePoint($1::double precision, $2::double precision), 4326
       )::geography
       AND ST_Covers(
         wz.zone_geom::geometry,
         ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)
       )`,
    [Number(event.longitude), Number(event.latitude), Number(event.magnitude)]
  );

  const recipients = aggregateWatchZoneMatches(matches.rows);
  for (const recipient of recipients) {
    const idempotencyKey = buildDeliveryIdempotencyKey({
      provider: 'PHIVOLCS',
      providerEventId: event.id || event.eventId,
      userId: recipient.userId,
      subscriptionId: recipient.subscriptionId,
      notificationType: 'initial',
      qualifyingRevision: 1,
    });

    await query(
      `INSERT INTO notification_deliveries (
         earthquake_event_id, user_id, subscription_id, notification_type,
         qualifying_revision, idempotency_key, matched_zone_ids, status
       ) VALUES ($1, $2, $3, 'initial', 1, $4, $5::uuid[], 'pending')
       ON CONFLICT (idempotency_key) DO UPDATE SET
         matched_zone_ids = EXCLUDED.matched_zone_ids,
         updated_at = NOW()
       WHERE notification_deliveries.status IN ('pending', 'retryable_failure')`,
      [
        canonicalEventId, recipient.userId, recipient.subscriptionId,
        idempotencyKey, recipient.zoneIds,
      ]
    );
  }

  return recipients.length;
}

async function dispatchPendingDeliveries() {
  // Recover claims left behind by a timed-out serverless invocation.
  await query(
    `UPDATE notification_deliveries
     SET status = 'retryable_failure', next_attempt_at = NOW(),
         last_error = COALESCE(last_error, 'Previous delivery attempt timed out'),
         updated_at = NOW()
     WHERE status = 'sending'
       AND last_attempt_at < NOW() - INTERVAL '2 minutes'`
  );
  const pending = await query(
    `SELECT id
     FROM notification_deliveries
     WHERE status IN ('pending', 'retryable_failure')
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
       AND attempts < $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [MAX_ATTEMPTS, RETRY_BATCH_SIZE]
  );

  let delivered = 0;
  let failed = 0;

  for (const item of pending.rows) {
    const claim = await query(
      `UPDATE notification_deliveries
       SET status = 'sending', attempts = attempts + 1, last_attempt_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('pending', 'retryable_failure')
         AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
         AND attempts < $2
       RETURNING id, attempts, subscription_id`,
      [item.id, MAX_ATTEMPTS]
    );
    const claimed = claim.rows[0];
    if (!claimed) continue;

    try {
      const detail = await query(
        `SELECT ps.fcm_token, e.id AS canonical_event_id,
                e.preferred_magnitude, e.place, e.origin_time,
                cardinality(nd.matched_zone_ids) AS zone_count
         FROM notification_deliveries nd
         LEFT JOIN push_subscriptions ps ON ps.id = nd.subscription_id
         JOIN earthquake_events e ON e.id = nd.earthquake_event_id
         WHERE nd.id = $1`,
        [claimed.id]
      );
      const delivery = detail.rows[0];

      if (!delivery?.fcm_token) {
        await query(
          `UPDATE notification_deliveries
           SET status = 'permanent_failure', last_error = 'Push subscription is missing',
               updated_at = NOW()
           WHERE id = $1`,
          [claimed.id]
        );
        failed++;
        continue;
      }

      const event = {
        magnitude: Number(delivery.preferred_magnitude),
        place: delivery.place,
        time: new Date(delivery.origin_time).getTime(),
        id: delivery.canonical_event_id,
      };
      const zoneCount = Number(delivery.zone_count) || 1;
      const result = await sendMulticastNotification(
        [delivery.fcm_token],
        buildEarthquakeNotification(event, `${zoneCount} matching watch zone${zoneCount === 1 ? '' : 's'}`)
      );
      const outcome = result.responses?.[0];

      if (outcome?.success) {
        await query(
          `UPDATE notification_deliveries
           SET status = 'delivered', delivered_at = NOW(), next_attempt_at = NULL,
               fcm_message_id = $2, last_error = NULL, updated_at = NOW()
           WHERE id = $1`,
          [claimed.id, outcome.messageId || null]
        );
        delivered++;
      } else {
        const failureStatus = classifyDeliveryFailure(outcome?.code);
        const retryMinutes = Math.min(360, 5 * (2 ** Math.min(claimed.attempts - 1, 6)));
        await query(
          `UPDATE notification_deliveries
           SET status = $2,
               next_attempt_at = CASE WHEN $2 = 'retryable_failure'
                 THEN NOW() + ($3 * INTERVAL '1 minute') ELSE NULL END,
               last_error = $4, updated_at = NOW()
           WHERE id = $1`,
          [
            claimed.id, failureStatus, retryMinutes,
            outcome?.error || outcome?.code || 'FCM delivery failed',
          ]
        );
        failed++;
      }
    } catch (error) {
      const retryMinutes = Math.min(360, 5 * (2 ** Math.min(claimed.attempts - 1, 6)));
      await query(
        `UPDATE notification_deliveries
         SET status = 'retryable_failure',
             next_attempt_at = NOW() + ($2 * INTERVAL '1 minute'),
             last_error = $3, updated_at = NOW()
         WHERE id = $1`,
        [claimed.id, retryMinutes, error.message]
      );
      failed++;
    }
  }

  // Exhausted retries are made terminal instead of remaining invisible in the
  // pending queue forever.
  await query(
    `UPDATE notification_deliveries
     SET status = 'permanent_failure', updated_at = NOW(),
         last_error = COALESCE(last_error, 'Retry limit reached')
     WHERE status IN ('pending', 'retryable_failure') AND attempts >= $1`,
    [MAX_ATTEMPTS]
  );

  return { delivered, failed };
}

export default async function handler(req, res) {
  setCors(res);

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
    res.status(500).json({ error: 'CRON_SECRET missing or too short. Use a random secret of at least 32 characters.' });
    return;
  }
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leaseOwner = randomUUID();
  let leaseAcquired = false;

  try {
    leaseAcquired = await acquireCronLease(leaseOwner);
    if (!leaseAcquired) {
      res.status(409).json({ checked: false, message: 'Another earthquake check is already running.' });
      return;
    }

    await markSourceAttempt('running');
    let events;
    try {
      events = await fetchPhivolcsEvents();
    } catch (error) {
      await markSourceAttempt('failed', error.message);
      res.status(502).json({ checked: false, message: 'PHIVOLCS fetch failed.' });
      return;
    }
    if (!Array.isArray(events)) {
      await markSourceAttempt('failed', 'Invalid PHIVOLCS event payload.');
      res.status(502).json({ checked: false, message: 'PHIVOLCS returned an invalid event list.' });
      return;
    }

    const stateResult = await query(
      `SELECT last_run_at, last_event_id FROM cron_state WHERE id = 1`
    );
    const state = stateResult.rows[0] || {};
    const syncResult = await query(
      `SELECT cursor_value FROM source_sync_state WHERE provider = 'PHIVOLCS'`
    );
    const lastEventId = syncResult.rows[0]?.cursor_value || state.last_event_id || null;
    const lastRunAt = state.last_run_at
      ? new Date(state.last_run_at).getTime()
      : Date.now() - OVERLAP_MS;

    events.sort((a, b) => Number(a.time) - Number(b.time));
    const cursorIndex = lastEventId
      ? events.findIndex((event) => event.id === lastEventId || event.eventId === lastEventId)
      : -1;
    const newEvents = cursorIndex >= 0
      ? events.slice(cursorIndex + 1)
      : events.filter((event) => Number(event.time) > lastRunAt - OVERLAP_MS);

    let processedEvents = 0;
    let stagedDeliveries = 0;
    let newestEventId = lastEventId;

    for (const event of newEvents) {
      const persisted = await persistPhivolcsEvent(event, query);
      stagedDeliveries += await stageRecipientDeliveries(event, persisted.canonicalEventId);
      newestEventId = event.id || event.eventId;
      processedEvents++;
    }

    if (newEvents.length > 0) {
      await query(
        `UPDATE cron_state
         SET last_run_at = NOW(), last_event_id = $1
         WHERE id = 1`,
        [newestEventId]
      );
    }

    await markSourceAttempt('healthy', null, newestEventId);
    const deliveryResults = await dispatchPendingDeliveries();

    res.status(200).json({
      checked: true,
      source: 'PHIVOLCS',
      newEvents: newEvents.length,
      processedEvents,
      stagedRecipientDeliveries: stagedDeliveries,
      notificationsSent: deliveryResults.delivered,
      deliveryFailures: deliveryResults.failed,
    });
  } catch (error) {
    console.error('[cron/check-quakes] Failed:', error.message);
    try {
      await markSourceAttempt('failed', error.message);
    } catch (stateError) {
      console.error('[cron/check-quakes] Could not update source health:', stateError.message);
    }
    res.status(500).json({ checked: false, message: 'Earthquake check failed.' });
  } finally {
    if (leaseAcquired) {
      try {
        await releaseCronLease(leaseOwner);
      } catch (error) {
        console.error('[cron/check-quakes] Failed to release lease:', error.message);
      }
    }
  }
}
