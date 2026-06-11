# Earthquake Alert System

A **progressive web application** (PWA) for real-time earthquake monitoring with push notifications. Built with Vue 3, Leaflet, Firebase Cloud Messaging, and Vercel serverless functions.

![Earthquake Alert System screenshot](public/icons/icon.svg)

## Features

- 🌍 **Interactive Map** — Dark-themed Leaflet map showing USGS earthquake epicenters (M4.5+, last 30 days), colored by magnitude
- 📊 **Earthquake List** — Sortable sidebar (by time, magnitude, distance from you)
- 🔔 **Push Notifications** — FCM-based alerts when earthquakes occur in your custom watch zones
- 🗺️ **Watch Zones** — Draw polygons on the map to define areas you care about
- 📈 **ShakeMap Overlay** — MMI intensity contours for selected earthquakes with legend
- 👤 **"I Felt It"** — Crowdsourced intensity reporting (placeholder, integrates with USGS DYFI)
- 📱 **PWA** — Installable on mobile/desktop, works offline for cached content
- ⚡ **Real-time** — Auto-refreshes every 60 seconds

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser (PWA)               │
│  Vue 3 + Vite + Leaflet + Firebase Web SDK  │
│         firebase-messaging-sw.js             │
└──────────────────┬──────────────────────────┘
                   │
          Vercel Rewrites (same origin)
                   │
┌──────────────────▼──────────────────────────┐
│          Vercel Serverless Functions          │
│                                              │
│  /api/events/latest       → USGS proxy       │
│  /api/events/[id]         → Event details    │
│  /api/events/[id]/contours→ ShakeMap proxy   │
│  /api/push/subscribe      → Save FCM token   │
│  /api/push/unsubscribe    → Remove token     │
│  /api/zones               → Watch zones CRUD │
│  /api/cron/check-quakes   → Cron: poll USGS  │
│                              + send FCM      │
└──────────────────┬──────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │                           │
     ▼                           ▼
┌──────────────┐       ┌──────────────────┐
│  Vercel      │       │  USGS Earthquake  │
│  Postgres    │       │  API (REST)       │
│  (PostGIS)   │       │  earthquake.usgs  │
│  - users     │       │  .gov             │
│  - push_     │       └──────────────────┘
│    subs      │
│  - watch_    │
│    zones     │
│  - cron_     │
│    state     │
└──────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vue 3 (Composition API), Vite, Leaflet, Leaflet.draw, Firebase Web SDK |
| **Backend** | Vercel Serverless Functions (Node.js) |
| **Database** | PostgreSQL + PostGIS (Vercel Postgres) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **Maps** | OpenStreetMap (CARTO dark tiles), USGS ShakeMap |
| **PWA** | vite-plugin-pwa (Workbox) |
| **Deployment** | Vercel (with Cron Jobs) |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Vercel CLI](https://vercel.com/cli) (for deployment)
- A [Firebase](https://firebase.google.com/) project with Cloud Messaging enabled
- A [Vercel](https://vercel.com/) account with Postgres integration

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd quake-alert
npm install
```

### 2. Firebase Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Cloud Messaging** (API) in the project settings
4. Register a **Web App** to get the Firebase config object
   - Project Settings > General > Your apps > Add app > Web
   - Copy the `firebaseConfig` object
5. Generate a **VAPID key** for Web Push
   - Project Settings > Cloud Messaging > Web Push certificates > Generate Key Pair
   - Copy the key pair value (starts with `BEl...`)
6. Generate a **Service Account key** (for the admin SDK)
   - Project Settings > Service Accounts > Generate new private key
   - This downloads a JSON file — extract `project_id`, `client_email`, and `private_key`

### 3. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Firebase credentials and database URL:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (with PostGIS) |
| `FCM_PROJECT_ID` | Firebase project ID (from service account) |
| `FCM_CLIENT_EMAIL` | Firebase client email (from service account) |
| `FCM_PRIVATE_KEY` | Firebase private key (from service account) |
| `CRON_SECRET` | Random string to protect the cron endpoint |
| `VITE_FIREBASE_CONFIG` | Firebase web app config as a **JSON string** |
| `VITE_FIREBASE_VAPID_KEY` | VAPID public key for Web Push |

**Important for `FCM_PRIVATE_KEY`:** The private key contains newlines. Set it as a single line with `\n` for line breaks:
```
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

**Important for `VITE_FIREBASE_CONFIG`:** This must be a **stringified JSON object**. In Vercel, set it with escaped quotes:
```
VITE_FIREBASE_CONFIG='{"apiKey":"AIza...","authDomain":"...",...}'
```

### 4. Database Migration

First, make sure your Postgres database has the PostGIS extension:

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

Then run the full migration:

```bash
npm run migrate
```

Or manually:

```bash
psql $DATABASE_URL -f db/migrations.sql
```

### 5. Local Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

**Note:** For local development, the API functions need to be served separately. The preferred approach is to use the Vercel CLI:

```bash
vercel dev
```

This runs both the Vite dev server and serverless functions locally.

### 6. Generate PWA Icons

Place the following icon files in `public/icons/`:
- `icon-192x192.png` (192×192)
- `icon-512x512.png` (512×512)

You can use any PNG icon generator or the provided SVG as a source.

### 7. Configure `firebase-messaging-sw.js`

Edit `public/firebase-messaging-sw.js` and replace the `FIREBASE_CONFIG` placeholder with your actual Firebase web app config:

```js
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
```

## Deployment to Vercel

### Step 1: Push to Git

```bash
git init
git add .
git commit -m "Initial commit: Earthquake Alert System"
git remote add origin <your-repo-url>
git push -u origin main
```

### Step 2: Import to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Import your Git repository
3. Configure:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Root Directory:** `quake-alert` (if using monorepo)

### Step 3: Set Environment Variables

In the Vercel project settings, add all environment variables from `.env.example`:

- `DATABASE_URL`
- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`
- `CRON_SECRET`
- `VITE_FIREBASE_CONFIG`
- `VITE_FIREBASE_VAPID_KEY`

### Step 4: Link Vercel Postgres

1. In Vercel Dashboard, go to **Storage > Create Database > Postgres**
2. Select your project and region
3. Vercel will automatically add the `DATABASE_URL` and related env vars
4. Run the migration:
   ```bash
   vercel env pull .env.production.local
   DATABASE_URL=$(grep DATABASE_URL .env.production.local | cut -d '=' -f2-) npm run migrate
   ```

### Step 5: Deploy

```bash
vercel --prod
```

### Step 6: Verify Cron Job

The cron job is configured in `vercel.json` and runs every minute. To test it manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/check-quakes
```

Expected response:
```json
{
  "checked": true,
  "newEvents": 0,
  "processedEvents": 0,
  "notificationsSent": 0,
  "durationMs": 1234
}
```

## API Reference

### `GET /api/events/latest`
Proxies the USGS 4.5_day feed.

**Query params:**
- `min_magnitude` (number) — Filter by minimum magnitude
- `limit` (number) — Max results

### `GET /api/events/:eventId`
Returns event details and ShakeMap URL.

### `GET /api/events/:eventId/contours`
Proxies the ShakeMap `cont_mi.json` file.

### `POST /api/push/subscribe`
Save FCM subscription.

**Body:**
```json
{
  "device_id": "uuid",
  "fcm_token": "token",
  "device_info": "Chrome on Windows"
}
```

### `DELETE /api/push/unsubscribe`
Remove subscription.

**Body/Query:**
```json
{ "fcm_token": "token" }
```

### `GET /api/zones?device_id=xxx`
List watch zones for device.

### `POST /api/zones`
Create a watch zone.

**Body:**
```json
{
  "device_id": "uuid",
  "name": "My Zone",
  "polygon": [[lon, lat], [lon, lat], ...],
  "min_magnitude": 4.5
}
```

### `GET /api/cron/check-quakes`
Protected cron endpoint (requires `Authorization: Bearer <CRON_SECRET>`).

## Database Schema

See `db/migrations.sql` for the complete schema:

- **users** — Device registrations
- **push_subscriptions** — FCM tokens
- **watch_zones** — GeoJSON polygon zones with PostGIS `geography(POLYGON, 4326)`
- **cron_state** — Singleton row tracking last USGS poll

The `find_subscriptions_for_epicenter()` function uses `ST_Contains` for spatial matching.

## Project Structure

```
quake-alert/
├── api/                       # Serverless functions
│   ├── _lib/
│   │   ├── db.js             # Postgres connection helper
│   │   ├── fcm.js            # Firebase Admin SDK helper
│   │   └── usgs.js           # USGS API helpers
│   ├── cron/
│   │   └── check-quakes.js   # Cron job (every minute)
│   ├── events/
│   │   ├── latest.js         # GET latest earthquakes
│   │   └── [eventId]/
│   │       ├── index.js      # GET event details
│   │       └── contours.js   # GET ShakeMap contours
│   ├── push/
│   │   ├── subscribe.js      # POST subscribe
│   │   └── unsubscribe.js    # DELETE unsubscribe
│   └── zones.js              # GET/POST/DELETE watch zones
├── db/
│   ├── migrations.sql        # Full SQL schema
│   └── migrate.js            # Migration runner script
├── public/
│   ├── icons/                # PWA icons (SVG + PNG)
│   ├── firebase-messaging-sw.js  # FCM service worker
│   └── manifest.json         # PWA manifest
├── src/
│   ├── components/
│   │   ├── MapView.vue       # Leaflet map + epicenters + contours
│   │   ├── Sidebar.vue       # Earthquake list + sort controls
│   │   └── SettingsPanel.vue # Push toggle + zones + magnitude slider
│   ├── lib/
│   │   ├── api.js            # API client (fetch wrapper)
│   │   ├── device.js         # Device ID management
│   │   └── fcm.js            # FCM token + foreground messages
│   ├── App.vue               # Root component + state management
│   └── main.js               # Vue app entry point
├── .env.example              # Environment variables template
├── index.html                # HTML entry point
├── package.json              # Dependencies and scripts
├── vercel.json               # Vercel config (cron, rewrites)
└── vite.config.js            # Vite + PWA plugin config
```

## Development

### Adding a New Feature

1. **Frontend:** Add component in `src/components/`, add API call in `src/lib/api.js`
2. **Backend:** Add new route in `api/` directory
3. **Database:** Add migration in `db/migrations.sql`

### Testing the Cron Job

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  https://your-app.vercel.app/api/cron/check-quakes
```

### Adding a New USGS Feed

The default feed is `4.5_day`. To use others (e.g., `all_day`, `significant_week`), pass the `?feed=` query parameter:

```
/api/events/latest?feed=earthquakes/feed/v1.0/summary/all_day.geojson
/api/events/latest?feed=earthquakes/feed/v1.0/summary/2.5_week.geojson
/api/events/latest?feed=earthquakes/feed/v1.0/summary/1.0_day.geojson
```

## Troubleshooting

### "VITE_FIREBASE_CONFIG not set"
Set the `VITE_FIREBASE_CONFIG` environment variable in Vercel or `.env.local`.

### Push notifications not working
1. Check browser console for FCM errors
2. Ensure VAPID key is correct
3. Verify service worker is registered: `chrome://serviceworker-internals/`
4. Check Firebase project has Cloud Messaging enabled

### Cron job fails with 401
The `CRON_SECRET` environment variable doesn't match between what's set and what's sent in the `Authorization` header.

### PostGIS errors
Ensure PostGIS extension is installed: `CREATE EXTENSION IF NOT EXISTS postgis;`

## License

MIT

## Acknowledgments

- [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Leaflet](https://leafletjs.com/) + [Leaflet.draw](https://leaflet.github.io/Leaflet.draw/)
- [Vercel](https://vercel.com/) with Postgres + Cron Jobs
- [CARTO](https://carto.com/) for dark map tiles