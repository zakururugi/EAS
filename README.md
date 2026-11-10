# Earthquake Alert System (EAS)

A Vue 3 progressive web app for monitoring Philippine earthquakes, viewing epicenters on a Leaflet map, defining watch zones, and receiving push alerts.

## Source and alert policy

- **PHIVOLCS is the authoritative source for Philippine earthquake alerts.**
- Only PHIVOLCS-backed events may independently qualify for push notifications.
- USGS is intended as a supplemental source for cross-reference and additional products; USGS-only events must not independently trigger EAS push alerts.
- Source values and provenance must remain separate. Magnitudes from different agencies must never be averaged.
- Synthetic intensity contours and shaking timelines are model estimates, not observed intensity data or official ShakeMaps.

## Current features

- Leaflet map with OpenStreetMap tiles and attribution (no map API key required).
- PHIVOLCS latest-earthquake feed.
- Sortable event sidebar and event selection/share links.
- User location and location-follow controls.
- User-drawn watch-zone polygons.
- Firebase Cloud Messaging subscription support.
- IndexedDB cache for recent events, zones, and intensity overlays.
- PWA installability and offline fallback.
- Clearly labelled illustrative shaking estimates.

## Architecture

```text
Browser: Vue 3 + Leaflet + OpenStreetMap + Firebase Web SDK
                       |
                EAS API routes
                       |
        +--------------+----------------+
        |              |                |
    PHIVOLCS       Supabase         Firebase
    source         PostgreSQL       Cloud Messaging
                   + PostGIS
        |
   (USGS ComCat adapter + shadow-only cross-source matching)
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vite, Leaflet |
| Map tiles | OpenStreetMap |
| Backend | Vercel serverless functions, Node.js 22 |
| Database | Supabase PostgreSQL + PostGIS |
| SQL client | `postgres` |
| Push | Firebase Cloud Messaging |
| PWA | vite-plugin-pwa |
| CI | GitHub Actions |

## Local setup

### Requirements

- Node.js 22
- npm
- Supabase PostgreSQL project for database-backed features
- Firebase project for push notifications

### Install

```bash
npm ci
cp .env.example .env.local
```

Set the environment variables in `.env.local`. See [Supabase setup](docs/SUPABASE_SETUP.md).

### Database migration

Use the Supabase **Transaction pooler** PostgreSQL URI as `DATABASE_URL`, then run:

```bash
npm run migrate
```

The migration preserves existing user/subscription/watch-zone tables and adds the canonical event archive and notification ledger. It is additive; still take a backup before applying it to a database with real user data.

### Run

```bash
npm run dev
```

For local serverless API routes, use the Vercel CLI:

```bash
vercel dev
```

### Tests and build

```bash
npm test
npm run build
```

## Environment variables

See `.env.example`.

| Variable | Use |
|---|---|
| `DATABASE_URL` | Private Supabase PostgreSQL transaction-pooler URI |
| `CRON_SECRET` | Bearer secret for the protected cron endpoint |
| `FCM_PROJECT_ID` | Firebase Admin project ID |
| `FCM_CLIENT_EMAIL` | Firebase Admin service-account email |
| `FCM_PRIVATE_KEY` | Firebase Admin private key |
| `VITE_FIREBASE_CONFIG` | Public Firebase Web App configuration JSON |
| `VITE_FIREBASE_VAPID_KEY` | Public Web Push VAPID key |

Never prefix database credentials, FCM private keys, or cron secrets with `VITE_`. Do not put Supabase secret API keys in browser code.

## API routes

| Route | Purpose |
|---|---|
| `GET /api/events/latest` | Latest PHIVOLCS events; provider failures return an explicit error, not an empty success |
| `GET /api/events/history` | Keyset-paginated archive with inclusive date filters and source provenance |
| `GET /api/events/:eventId` | Event details |
| `GET /api/events/:eventId/contours` | Illustrative modelled contours (not official observations) |
| `POST /api/push/subscribe` | Register an FCM token |
| `POST /api/push/unsubscribe` | Remove an FCM token |
| `GET/POST/DELETE /api/zones` | Manage watch zones |
| `GET/POST /api/cron/check-quakes` | Protected PHIVOLCS ingestion and recipient-idempotent notification dispatcher |
| `POST /api/cron/backfill-phivolcs` | Resumable monthly PHIVOLCS archive backfill; does not send alerts |
| `POST /api/cron/backfill-usgs` | Resumable USGS supplemental history backfill; does not send alerts |

## Data and database

The initial EAS database schema includes the existing device, subscription, and watch-zone tables. The additive archive schema introduces:

- `earthquake_events`: canonical event records.
- `event_sources`: provider-specific source values and raw payload provenance.
- `event_matches`: auditable cross-provider matching decisions.
- `event_revisions`: source and canonical event change history.
- `intensity_observations`: explicitly typed PEIS/MMI observations and modelled products.
- `source_sync_state`: independent provider and backfill checkpoints.
- `notification_deliveries`: recipient-level idempotency and retry state.
- `schema_migrations`: migration version ledger.

The archive backfill endpoints process bounded, resumable batches. PHIVOLCS monthly archives are discovered from official PHIVOLCS index links; USGS ComCat history is queried in seven-day windows over the Philippines region. Neither backfill sends notifications. USGS/PHIVOLCS candidate matching is recorded in shadow mode only and never merges records automatically. The archive is limited to records retrievable from the upstream providers, not a claim that every earthquake ever recorded exists online.

## Scheduler

The live alert handler is protected by `CRON_SECRET` and requires the database and Firebase Admin configuration. The repository's `vercel.json` does not define a cron schedule; the active schedule must be verified in the deployment dashboard or external scheduler before adding another schedule, to avoid duplicate polling. The two archive backfill endpoints are separate protected POST routes and should be run repeatedly until their progress responses report `done: true`.

## Map tile usage

The map uses the standard OpenStreetMap tile service with attribution. It requires no API key or account, but it is a community-operated service with a usage policy. Do not bulk-download tiles or use it as an offline tile archive.

## Safety and data interpretation

- A provider outage must not be presented as a valid empty earthquake catalogue.
- A failed refresh must not erase the last-known-good event list.
- PHIVOLCS and USGS measurements remain separate source observations.
- PEIS and MMI are different intensity scales and must not be silently converted or combined.
- Modelled contours must never be labelled as official PHIVOLCS observations or USGS ShakeMap products.
- Notification retries must be recipient-level and idempotent to avoid duplicate alerts.

## License

MIT
