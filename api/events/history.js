/**
 * GET /api/events/history
 *
 * Keyset-paginated canonical archive. The default client view is 14 days.
 * For an explicit older date window of at most 14 days, this route fetches the
 * matching PHIVOLCS monthly archive(s), imports only events inside that window,
 * and then serves the canonical Supabase query. Historical imports never stage
 * notification deliveries.
 */

import { query } from '../_lib/db.js';
import { encodeHistoryCursor, parseHistoryQuery } from '../_lib/history-query.js';
import { fetchPhivolcsArchiveMonths, fetchPhivolcsArchiveMonth, fetchPhivolcsEvents } from '../_lib/phivolcs-scraper.js';
import { persistPhivolcsEvent } from '../_lib/ingestion/persist-phivolcs-event.js';

const MAX_ON_DEMAND_DAYS = 14;
const MAX_ON_DEMAND_EVENTS = 300;

function getManilaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function addCalendarDays(dateOnly, days) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function listMonthKeys(fromDate, toDate) {
  const [startYear, startMonth] = fromDate.split('-').map(Number);
  const [endYear, endMonth] = toDate.split('-').map(Number);
  const months = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(year + '-' + String(month).padStart(2, '0'));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function shouldLookupHistoricalArchive(filters) {
  if (!filters.fromDate || !filters.toDate || !filters.rangeDays) return false;
  if (filters.rangeDays > MAX_ON_DEMAND_DAYS) return false;

  const recentWindowStart = addCalendarDays(getManilaDate(), -(MAX_ON_DEMAND_DAYS - 1));
  return filters.fromDate < recentWindowStart;
}

async function importRequestedPhivolcsArchive(filters) {
  if (!filters.fromDate || !filters.toDate) {
    return { status: 'not_requested', imported: 0 };
  }
  if (filters.rangeDays > MAX_ON_DEMAND_DAYS) {
    return {
      status: 'range_too_wide',
      imported: 0,
      maxDays: MAX_ON_DEMAND_DAYS,
    };
  }
  if (!shouldLookupHistoricalArchive(filters)) {
    return { status: 'recent_window', imported: 0 };
  }

  const startMs = Date.parse(filters.from);
  const endMs = Date.parse(filters.to);
  const monthKeys = listMonthKeys(filters.fromDate, filters.toDate);
  const failures = [];
  let candidateEvents = [];

  let archives;
  try {
    archives = await fetchPhivolcsArchiveMonths();
  } catch (error) {
    console.error('[events/history] PHIVOLCS archive index failed:', error.message);
    return {
      status: 'unavailable',
      imported: 0,
      message: 'The PHIVOLCS archive index could not be reached. Stored history is still available.',
    };
  }

  const archiveByMonth = new Map(archives.map((archive) => [archive.key, archive]));
  const currentMonthKey = getManilaDate().slice(0, 7);
  let currentMonthEvents = null;

  function appendMatchingEvents(events) {
    candidateEvents.push(...events.filter((event) => {
      const timestamp = Number(event.time);
      return Number.isFinite(timestamp) && timestamp >= startMs && timestamp < endMs;
    }));
  }

  for (const key of monthKeys) {
    const archive = archiveByMonth.get(key);
    if (!archive && key !== currentMonthKey) {
      failures.push(key);
      continue;
    }

    if (!archive && key === currentMonthKey) {
      try {
        currentMonthEvents = currentMonthEvents || await fetchPhivolcsEvents();
        appendMatchingEvents(currentMonthEvents);
      } catch (error) {
        console.error('[events/history] Current PHIVOLCS feed fallback failed:', error.message);
        failures.push(key);
      }
      continue;
    }

    try {
      const [year, month] = key.split('-').map(Number);
      const monthEvents = await fetchPhivolcsArchiveMonth(year, month, archives);
      appendMatchingEvents(monthEvents);
    } catch (error) {
      console.error('[events/history] PHIVOLCS archive ' + key + ' failed:', error.message);
      if (key === currentMonthKey) {
        try {
          currentMonthEvents = currentMonthEvents || await fetchPhivolcsEvents();
          appendMatchingEvents(currentMonthEvents);
        } catch (fallbackError) {
          console.error('[events/history] Current PHIVOLCS feed fallback failed:', fallbackError.message);
          failures.push(key);
        }
      } else {
        failures.push(key);
      }
    }
  }

  const uniqueEvents = [...new Map(candidateEvents.map((event) => [event.id || event.eventId, event])).values()];
  let imported = 0;
  let missingEvents = [];

  if (uniqueEvents.length > 0) {
    const providerIds = uniqueEvents
      .map((event) => event.id || event.eventId)
      .filter((id) => typeof id === 'string' && id.length > 0);
    const existing = await query(
      [
        'SELECT provider_event_id',
        'FROM event_sources',
        "WHERE provider = 'PHIVOLCS'",
        'AND provider_event_id = ANY($1::text[])',
      ].join(' '),
      [providerIds]
    );
    const existingIds = new Set(existing.rows.map((row) => row.provider_event_id));
    missingEvents = uniqueEvents.filter((event) => !existingIds.has(event.id || event.eventId));
  }

  // The limit protects the serverless import loop, not the search result set.
  // Do not report a dense range as a failure when those source events are
  // already persisted in Supabase and can be returned immediately.
  if (missingEvents.length > MAX_ON_DEMAND_EVENTS) {
    return {
      status: 'range_too_dense',
      imported: 0,
      matched: uniqueEvents.length,
      missing: missingEvents.length,
      maxEvents: MAX_ON_DEMAND_EVENTS,
      message: 'Too many missing PHIVOLCS records need importing in one request. Narrow the selected date range.',
    };
  }

  for (const event of missingEvents) {
    await persistPhivolcsEvent(event, query);
    imported += 1;
  }

  return {
    status: failures.length > 0 ? 'partial' : 'complete',
    imported,
    matched: uniqueEvents.length,
    months: monthKeys,
    unavailableMonths: failures,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  let filters;
  try {
    filters = parseHistoryQuery(req.query || {});
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
    return;
  }

  try {
    let archiveLookup = { status: 'not_requested', imported: 0 };
    if (!filters.cursor) {
      archiveLookup = await importRequestedPhivolcsArchive(filters);
    }

    const statement = [
      'SELECT',
      '  e.id,',
      '  e.origin_time,',
      '  e.latitude,',
      '  e.longitude,',
      '  e.depth_km,',
      '  e.preferred_magnitude,',
      '  e.preferred_magnitude_type,',
      '  e.preferred_source,',
      '  e.place,',
      '  e.last_updated_at,',
      '  primary_source.provider_event_id,',
      '  primary_source.source_url,',
      '  primary_source.raw_payload,',
      "  COALESCE(all_sources.source_records, '[]'::jsonb) AS sources",
      'FROM earthquake_events e',
      'LEFT JOIN LATERAL (',
      '  SELECT es.provider_event_id, es.source_url, es.raw_payload',
      '  FROM event_sources es',
      '  WHERE es.earthquake_event_id = e.id',
      '  ORDER BY (es.provider = e.preferred_source) DESC, es.retrieved_at DESC',
      '  LIMIT 1',
      ') primary_source ON TRUE',
      'LEFT JOIN LATERAL (',
      '  SELECT jsonb_agg(',
      '    jsonb_build_object(',
      "      'provider', es.provider,",
      "      'providerEventId', es.provider_event_id,",
      "      'magnitude', es.source_magnitude,",
      "      'magnitudeType', es.source_magnitude_type,",
      "      'depth', es.source_depth_km,",
      "      'place', es.source_place,",
      "      'sourceUrl', es.source_url,",
      "      'retrievedAt', es.retrieved_at",
      '    ) ORDER BY es.provider, es.retrieved_at DESC',
      '  ) AS source_records',
      '  FROM event_sources es',
      '  WHERE es.earthquake_event_id = e.id',
      ') all_sources ON TRUE',
      'WHERE ($1::timestamptz IS NULL OR e.origin_time >= $1::timestamptz)',
      '  AND ($2::timestamptz IS NULL OR e.origin_time < $2::timestamptz)',
      '  AND ($3::numeric IS NULL OR e.preferred_magnitude >= $3::numeric)',
      '  AND (',
      '    $4::timestamptz IS NULL OR',
      '    (e.origin_time, e.id) < ($4::timestamptz, $5::uuid)',
      '  )',
      'ORDER BY e.origin_time DESC, e.id DESC',
      'LIMIT $6',
    ].join('\n');

    const result = await query(statement, [
      filters.from,
      filters.to,
      filters.minMagnitude,
      filters.cursor?.timestamp || null,
      filters.cursor?.id || null,
      filters.limit + 1,
    ]);

    const hasMore = result.rows.length > filters.limit;
    const pageRows = hasMore ? result.rows.slice(0, filters.limit) : result.rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeHistoryCursor(lastRow.origin_time, lastRow.id)
      : null;

    const events = pageRows.map((row) => {
      const payload = row.raw_payload || {};
      return {
        id: row.id,
        eventId: row.id,
        sourceEventId: row.provider_event_id,
        source: row.preferred_source,
        magnitude: row.preferred_magnitude == null ? null : Number(row.preferred_magnitude),
        magnitudeType: row.preferred_magnitude_type || null,
        place: row.place || 'Location unavailable',
        time: new Date(row.origin_time).getTime(),
        updated: new Date(row.last_updated_at).getTime(),
        depth: row.depth_km == null ? null : Number(row.depth_km),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        url: row.source_url || null,
        felt: Number.isFinite(Number(payload.felt)) ? Number(payload.felt) : 0,
        mmi: payload.mmi == null ? null : Number(payload.mmi),
        alert: payload.alert || null,
        tsunami: payload.tsunami ?? null,
        sources: row.sources || [],
      };
    });

    res.status(200).json({
      type: 'FeatureCollection',
      metadata: {
        generated: Date.now(),
        count: events.length,
        source: 'EAS_ARCHIVE',
        status: 'ok',
        hasMore,
        nextCursor,
        archiveLookup,
        timezone: 'Asia/Manila',
        filters: {
          from: filters.from,
          toExclusive: filters.to,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          minMagnitude: filters.minMagnitude,
        },
      },
      events,
    });
  } catch (error) {
    console.error('[events/history] Archive query failed:', error.message);
    res.status(503).json({
      error: 'Earthquake history is temporarily unavailable.',
      metadata: { source: 'EAS_ARCHIVE', status: 'unavailable' },
    });
  }
}
