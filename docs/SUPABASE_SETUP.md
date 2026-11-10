# Supabase database setup for EAS

EAS uses PostgreSQL with PostGIS. The Supabase project already provides PostgreSQL; the EAS tables, indexes, and functions still need to be installed.

## 1. Get the PostgreSQL connection URI

1. Open the Supabase project dashboard.
2. Open **Connect** and choose **Transaction pooler**.
3. Copy the PostgreSQL connection URI shown for the project.
4. Use the database password configured for the Supabase project.

The database password is not the same thing as a Supabase publishable key, secret API key, or anon JWT. EAS does not need the Supabase API keys for its server-side SQL access.

For Vercel/serverless use, prefer the transaction-pooler URI. Keep the URI private.

## 2. Configure the local environment

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to the copied URI. Do not add the database URI to any `VITE_*` variable and do not commit `.env.local`.

The backend uses the existing `postgres` package and parameterized SQL calls. SSL is required and prepared statements are disabled for transaction-pooler compatibility.

## 3. Apply the EAS schema

After confirming the Supabase project is the intended EAS test project, run:

```bash
npm ci
npm run migrate
```

The migration is additive and idempotent. It preserves the existing `users`, `push_subscriptions`, `watch_zones`, and `cron_state` tables while adding the canonical earthquake archive, provider provenance, event matching/revision records, intensity observations, source checkpoints, and notification delivery ledger.

The migration runner:
- splits SQL safely around quoted strings and PostgreSQL dollar-quoted function bodies;
- executes statements in one transaction;
- records the migration version in `schema_migrations`;
- does not suppress arbitrary SQL errors.

Do not run the migration against production until a database backup exists and the target project has been verified.

## 4. Configure Vercel

Add `DATABASE_URL` to the EAS Vercel project's server-side environment variables for Preview and Production as appropriate. Use the Supabase transaction-pooler URI. Do not add Supabase secret keys or the database URI to browser variables.

Also configure the server-side Firebase Admin variables and `CRON_SECRET` described in `.env.example`.

## 5. Verify the database

After migration, verify that these tables exist in Supabase Table Editor:

- Existing: `users`, `push_subscriptions`, `watch_zones`, `cron_state`
- New: `earthquake_events`, `event_sources`, `event_matches`, `event_revisions`, `intensity_observations`, `source_sync_state`, `notification_deliveries`, `schema_migrations`

Also verify that the PostGIS extension is enabled.

## Important

Applying the schema does not backfill earthquake history, configure the scheduler, enable FCM, or deploy the application. Those are separate stages and must be tested independently. The API secret key pasted into a chat is not a substitute for a PostgreSQL connection URI.
