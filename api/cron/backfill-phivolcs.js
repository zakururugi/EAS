/**
 * Protected, resumable PHIVOLCS archive backfill.
 *
 * Imports historical source records without generating notifications. Only the
 * live PHIVOLCS alert poller is allowed to stage notification deliveries.
 */

import { randomUUID } from 'node:crypto';
import {
  fetchPhivolcsArchiveMonths,
  fetchPhivolcsArchiveMonth,
} from '../_lib/phivolcs-scraper.js';
import { persistPhivolcsEvent } from '../_lib/ingestion/persist-phivolcs-event.js';
import { query } from '../_lib/db.js';

const EVENTS_PER_BATCH = 100;

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
    await query(
      `INSERT INTO source_sync_state (provider, status, updated_at)
       VALUES ('PHIVOLCS', 'never_run', NOW())
       ON CONFLICT (provider) DO NOTHING`
    );

    const lease = await query(
      `UPDATE source_sync_state
       SET lease_owner = $1, lease_expires_at = NOW() + INTERVAL '60 seconds',
           backfill_last_attempt_at = NOW(), backfill_status = 'running',
           updated_at = NOW()
       WHERE provider = 'PHIVOLCS'
         AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
       RETURNING provider`,
      [leaseOwner]
    );
    leaseAcquired = lease.rows.length === 1;
    if (!leaseAcquired) {
      res.status(409).json({ checked: false, message: 'A PHIVOLCS archive batch is already running.' });
      return;
    }

    const archives = await fetchPhivolcsArchiveMonths();
    if (archives.length === 0) {
      throw new Error('The official PHIVOLCS archive index did not expose any monthly archives.');
    }

    const stateResult = await query(
      `SELECT backfill_cursor FROM source_sync_state
       WHERE provider = 'PHIVOLCS' AND lease_owner = $1`,
      [leaseOwner]
    );
    const cursor = stateResult.rows[0]?.backfill_cursor || '';
    const partial = cursor.match(/^(\d{4}-\d{2}):(\d+)$/);
    const activeArchiveKey = partial?.[1] || null;
    const offset = partial ? Number(partial[2]) : 0;
    const nextArchive = activeArchiveKey
      ? archives.find((archive) => archive.key === activeArchiveKey)
      : archives.find((archive) => archive.key > cursor);

    if (!nextArchive) {
      await query(
        `UPDATE source_sync_state
         SET backfill_status = 'healthy', backfill_last_success_at = NOW(),
             backfill_last_error = NULL, updated_at = NOW()
         WHERE provider = 'PHIVOLCS' AND lease_owner = $1`,
        [leaseOwner]
      );
      res.status(200).json({
        checked: true,
        done: true,
        archivesAvailable: archives.length,
        cursor,
        eventsFetched: 0,
        notificationsSent: 0,
      });
      return;
    }

    const events = await fetchPhivolcsArchiveMonth(nextArchive.year, nextArchive.month);
    const batchEvents = events.slice(offset, offset + EVENTS_PER_BATCH);
    let persisted = 0;
    for (const event of batchEvents) {
      await persistPhivolcsEvent(event, query);
      persisted++;
    }

    const nextOffset = offset + batchEvents.length;
    const monthHasMore = nextOffset < events.length;
    const laterArchiveExists = archives.some((archive) => archive.key > nextArchive.key);
    const done = !monthHasMore && !laterArchiveExists;
    const nextCursor = monthHasMore ? `${nextArchive.key}:${nextOffset}` : nextArchive.key;
    const monthEnd = new Date(Date.UTC(nextArchive.year, nextArchive.month, 0, 23, 59, 59, 999));

    await query(
      `UPDATE source_sync_state
       SET backfill_cursor = $1,
           backfill_completed_through = CASE WHEN $2 THEN $3 ELSE backfill_completed_through END,
           backfill_last_success_at = NOW(),
           backfill_status = $4,
           backfill_last_error = NULL,
           updated_at = NOW()
       WHERE provider = 'PHIVOLCS' AND lease_owner = $5`,
      [nextCursor, !monthHasMore, monthEnd.toISOString(), done ? 'healthy' : 'running', leaseOwner]
    );

    res.status(200).json({
      checked: true,
      done,
      archiveMonth: nextArchive.key,
      batchOffset: offset,
      eventsInArchive: events.length,
      eventsFetched: batchEvents.length,
      eventsPersisted: persisted,
      notificationsSent: 0,
      source: 'PHIVOLCS official archive',
    });
  } catch (error) {
    console.error('[cron/backfill-phivolcs] Failed:', error.message);
    try {
      await query(
        `UPDATE source_sync_state
         SET backfill_status = 'failed', backfill_last_error = $1,
             backfill_last_attempt_at = NOW(), updated_at = NOW()
         WHERE provider = 'PHIVOLCS' AND lease_owner = $2`,
        [error.message, leaseOwner]
      );
    } catch (stateError) {
      console.error('[cron/backfill-phivolcs] Could not update sync state:', stateError.message);
    }
    res.status(502).json({ checked: false, message: 'PHIVOLCS archive backfill batch failed.' });
  } finally {
    if (leaseAcquired) {
      try {
        await query(
          `UPDATE source_sync_state
           SET lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
           WHERE provider = 'PHIVOLCS' AND lease_owner = $1`,
          [leaseOwner]
        );
      } catch (error) {
        console.error('[cron/backfill-phivolcs] Failed to release lease:', error.message);
      }
    }
  }
}
