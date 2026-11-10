/**
 * Protected, resumable USGS historical backfill.
 *
 * Processes one bounded Philippines-region time window per request. USGS
 * records are supplemental and are never passed to the push-alert dispatcher.
 */

import { randomUUID } from 'node:crypto';
import { fetchUsgsEvents } from '../_lib/sources/usgs.js';
import { persistUsgsEvent } from '../_lib/ingestion/persist-usgs-event.js';
import { recordUsgsShadowMatch } from '../_lib/events/matching.js';
import { query } from '../_lib/db.js';

const BACKFILL_START = '1900-01-01T00:00:00.000Z';
const BATCH_DAYS = 7;
const EVENTS_PER_BATCH = 100;
const PHILIPPINES_BOUNDS = {
  minLatitude: 0,
  maxLatitude: 25,
  minLongitude: 115,
  maxLongitude: 135,
};

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    res.status(500).json({ error: 'CRON_SECRET is not configured or is too short.' });
    return;
  }
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leaseOwner = randomUUID();
  let leaseAcquired = false;

  try {
    const now = new Date();
    await query(
      `INSERT INTO source_sync_state (provider, status, updated_at)
       VALUES ('USGS', 'never_run', NOW())
       ON CONFLICT (provider) DO NOTHING`
    );

    const lease = await query(
      `UPDATE source_sync_state
       SET lease_owner = $1, lease_expires_at = NOW() + INTERVAL '60 seconds',
           backfill_last_attempt_at = NOW(), backfill_status = 'running', updated_at = NOW()
       WHERE provider = 'USGS'
         AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
       RETURNING provider`,
      [leaseOwner]
    );
    leaseAcquired = lease.rows.length === 1;
    if (!leaseAcquired) {
      res.status(409).json({ checked: false, message: 'A USGS backfill batch is already running.' });
      return;
    }

    await query(
      `UPDATE source_sync_state
       SET backfill_from = COALESCE(backfill_from, $1),
           backfill_to = COALESCE(backfill_to, $2),
           backfill_completed_through = COALESCE(backfill_completed_through, $1),
           backfill_last_error = NULL, updated_at = NOW()
       WHERE provider = 'USGS' AND lease_owner = $3`,
      [BACKFILL_START, now.toISOString(), leaseOwner]
    );

    const stateResult = await query(
      `SELECT backfill_from, backfill_to, backfill_completed_through
       FROM source_sync_state
       WHERE provider = 'USGS' AND lease_owner = $1`,
      [leaseOwner]
    );
    const state = stateResult.rows[0];
    if (!state) throw new Error('USGS backfill lease was lost before the batch started.');

    const batchStart = new Date(
      state.backfill_completed_through || state.backfill_from || BACKFILL_START
    );
    const backfillEnd = new Date(state.backfill_to || now);
    const partial = String(state.backfill_cursor || '').match(/^(.*)\\|(\\d+)$/);
    const offset = partial && new Date(partial[1]).getTime() === batchStart.getTime()
      ? Number(partial[2])
      : 0;

    if (batchStart >= backfillEnd) {
      await query(
        `UPDATE source_sync_state
         SET backfill_status = 'healthy', backfill_last_success_at = NOW(), updated_at = NOW()
         WHERE provider = 'USGS' AND lease_owner = $1`,
        [leaseOwner]
      );
      res.status(200).json({ checked: true, done: true, eventsFetched: 0 });
      return;
    }

    const proposedEnd = addDays(batchStart, BATCH_DAYS);
    const batchEnd = proposedEnd < backfillEnd ? proposedEnd : backfillEnd;

    const events = await fetchUsgsEvents({
      startTime: batchStart.toISOString(),
      endTime: batchEnd.toISOString(),
      ...PHILIPPINES_BOUNDS,
    });

    const batchEvents = events.slice(offset, offset + EVENTS_PER_BATCH);
    let persisted = 0;
    let shadowMatches = 0;
    for (const event of batchEvents) {
      const result = await persistUsgsEvent(event, query);
      const match = await recordUsgsShadowMatch(event, result.sourceId, query);
      if (match) shadowMatches++;
      persisted++;
    }

    const nextOffset = offset + batchEvents.length;
    const windowHasMore = nextOffset < events.length;
    const done = !windowHasMore && batchEnd >= backfillEnd;
    const nextCursor = windowHasMore ? `${batchStart.toISOString()}|${nextOffset}` : null;
    await query(
      `UPDATE source_sync_state
       SET backfill_completed_through = CASE WHEN $1 THEN $2 ELSE backfill_completed_through END,
           backfill_cursor = $3,
           backfill_last_success_at = NOW(),
           backfill_status = $4,
           backfill_last_error = NULL,
           updated_at = NOW()
       WHERE provider = 'USGS' AND lease_owner = $5`,
      [!windowHasMore, batchEnd.toISOString(), nextCursor, done ? 'healthy' : 'running', leaseOwner]
    );

    res.status(200).json({
      checked: true,
      done,
      batchStart: batchStart.toISOString(),
      batchEnd: batchEnd.toISOString(),
      batchOffset: offset,
      eventsInWindow: events.length,
      eventsFetched: batchEvents.length,
      eventsPersisted: persisted,
      shadowMatches,
      source: 'USGS supplemental only',
      notificationEligible: false,
    });
  } catch (error) {
    console.error('[cron/backfill-usgs] Failed:', error.message);
    try {
      await query(
        `UPDATE source_sync_state
         SET backfill_status = 'failed', backfill_last_error = $1, backfill_last_attempt_at = NOW(), updated_at = NOW()
         WHERE provider = 'USGS' AND lease_owner = $2`,
        [error.message, leaseOwner]
      );
    } catch (stateError) {
      console.error('[cron/backfill-usgs] Could not update sync state:', stateError.message);
    }
    res.status(502).json({ checked: false, message: 'USGS historical backfill batch failed.' });
  } finally {
    if (leaseAcquired) {
      try {
        await query(
          `UPDATE source_sync_state
           SET lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
           WHERE provider = 'USGS' AND lease_owner = $1`,
          [leaseOwner]
        );
      } catch (error) {
        console.error('[cron/backfill-usgs] Failed to release lease:', error.message);
      }
    }
  }
}
