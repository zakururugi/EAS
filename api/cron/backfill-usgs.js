/**
 * Protected, resumable USGS historical backfill.
 *
 * Processes one bounded Philippines-region time window per request. USGS
 * records are supplemental and are never passed to the push-alert dispatcher.
 */

import { fetchUsgsEvents } from '../_lib/sources/usgs.js';
import { persistUsgsEvent } from '../_lib/ingestion/persist-usgs-event.js';
import { recordUsgsShadowMatch } from '../_lib/events/matching.js';
import { query } from '../_lib/db.js';

const BACKFILL_START = '1900-01-01T00:00:00.000Z';
const BATCH_DAYS = 7;
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

  try {
    const now = new Date();
    await query(
      `INSERT INTO source_sync_state (
         provider, backfill_from, backfill_to, backfill_completed_through,
         last_attempt_at, status, updated_at
       ) VALUES ('USGS', $1, $2, $1, NOW(), 'running', NOW())
       ON CONFLICT (provider) DO UPDATE SET
         backfill_from = COALESCE(source_sync_state.backfill_from, EXCLUDED.backfill_from),
         backfill_to = COALESCE(source_sync_state.backfill_to, EXCLUDED.backfill_to),
         backfill_completed_through = COALESCE(
           source_sync_state.backfill_completed_through, EXCLUDED.backfill_completed_through
         ),
         last_attempt_at = NOW(),
         status = 'running',
         last_error = NULL,
         updated_at = NOW()`,
      [BACKFILL_START, now.toISOString()]
    );

    const stateResult = await query(
      `SELECT backfill_from, backfill_to, backfill_completed_through
       FROM source_sync_state WHERE provider = 'USGS'`
    );
    const state = stateResult.rows[0];
    const batchStart = new Date(state.backfill_completed_through || state.backfill_from || BACKFILL_START);
    const backfillEnd = new Date(state.backfill_to || now);

    if (batchStart >= backfillEnd) {
      await query(
        `UPDATE source_sync_state
         SET status = 'healthy', last_success_at = NOW(), updated_at = NOW()
         WHERE provider = 'USGS'`
      );
      res.status(200).json({ checked: true, done: true, eventsFetched: 0 });
      return;
    }

    const batchEnd = addDays(batchStart, BATCH_DAYS) < backfillEnd
      ? addDays(batchStart, BATCH_DAYS)
      : backfillEnd;

    const events = await fetchUsgsEvents({
      startTime: batchStart.toISOString(),
      endTime: batchEnd.toISOString(),
      ...PHILIPPINES_BOUNDS,
    });

    let persisted = 0;
    let shadowMatches = 0;
    for (const event of events) {
      const result = await persistUsgsEvent(event, query);
      const match = await recordUsgsShadowMatch(event, result.sourceId, query);
      if (match) shadowMatches++;
      persisted++;
    }

    const done = batchEnd >= backfillEnd;
    await query(
      `UPDATE source_sync_state
       SET backfill_completed_through = $1,
           last_success_at = NOW(),
           status = $2,
           last_error = NULL,
           updated_at = NOW()
       WHERE provider = 'USGS'`,
      [batchEnd.toISOString(), done ? 'healthy' : 'running']
    );

    res.status(200).json({
      checked: true,
      done,
      batchStart: batchStart.toISOString(),
      batchEnd: batchEnd.toISOString(),
      eventsFetched: events.length,
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
         SET status = 'failed', last_error = $1, last_attempt_at = NOW(), updated_at = NOW()
         WHERE provider = 'USGS'`,
        [error.message]
      );
    } catch (stateError) {
      console.error('[cron/backfill-usgs] Could not update sync state:', stateError.message);
    }
    res.status(502).json({ checked: false, message: 'USGS historical backfill batch failed.' });
  }
}
