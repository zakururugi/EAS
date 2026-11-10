-- Earthquake Alert System – PostgreSQL Schema
-- Requires: PostGIS extension for geospatial queries
-- Run: psql $DATABASE_URL -f migrations.sql

-- Enable PostGIS (required for ST_Contains, geography, geometry operations)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- Table: users
-- Tracks registered devices/users for push notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) UNIQUE NOT NULL,        -- unique device identifier (generated client-side)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);

-- ============================================================
-- Table: push_subscriptions
-- Stores FCM tokens per user. A user may have multiple tokens
-- (e.g. one per browser/device), but we enforce unique token.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT UNIQUE NOT NULL,
    device_info VARCHAR(255),                       -- optional: "Chrome on Windows", "Safari on iOS"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_fcm_token ON push_subscriptions(fcm_token);

-- ============================================================
-- Table: watch_zones
-- Each user can define one or more GeoJSON polygons on the map.
-- The zone geometry is stored as geography(Polygon, 4326) for
-- accurate geospatial queries.
-- ============================================================
CREATE TABLE IF NOT EXISTS watch_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT 'My Zone',
    zone_geom geography(POLYGON, 4326) NOT NULL,    -- the polygon in WGS84
    min_magnitude REAL NOT NULL DEFAULT 4.5,        -- min mag for notifications
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_zones_user_id ON watch_zones(user_id);
-- Spatial index for fast containment queries
CREATE INDEX IF NOT EXISTS idx_watch_zones_zone_geom ON watch_zones USING GIST (zone_geom);

-- ============================================================
-- Table: cron_state
-- Tracks the last USGS poll timestamp so the cron job only
-- processes new earthquakes since the last run.
-- ============================================================
CREATE TABLE IF NOT EXISTS cron_state (
    id INTEGER PRIMARY KEY DEFAULT 1,             -- singleton row (id=1)
    last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_id VARCHAR(50)                      -- last processed USGS event id
);

-- Insert the initial singleton row if not exists
INSERT INTO cron_state (id, last_run_at)
VALUES (1, NOW() - INTERVAL '2 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Function: create_user_if_not_exists
-- Idempotent user creation by device_id
-- ============================================================
CREATE OR REPLACE FUNCTION create_user_if_not_exists(p_device_id VARCHAR)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    INSERT INTO users (device_id)
    VALUES (p_device_id)
    ON CONFLICT (device_id)
    DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_user_id;

    -- If ON CONFLICT didn't return (e.g. no update needed), fetch existing
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM users WHERE device_id = p_device_id;
    END IF;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function: find_subscriptions_for_epicenter
-- Given a point (lon, lat) and magnitude, find all subscriptions
-- whose watch zones contain that point and whose min_magnitude
-- is <= the given magnitude.
-- Returns: user_id, fcm_token, zone_id, zone_name
-- ============================================================
CREATE OR REPLACE FUNCTION find_subscriptions_for_epicenter(
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_magnitude REAL
)
RETURNS TABLE(
    user_id UUID,
    fcm_token TEXT,
    zone_id UUID,
    zone_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        u.id,
        ps.fcm_token,
        wz.id,
        wz.name
    FROM watch_zones wz
    JOIN users u ON u.id = wz.user_id
    JOIN push_subscriptions ps ON ps.user_id = u.id
    WHERE wz.enabled = TRUE
      AND wz.min_magnitude <= p_magnitude
      AND ST_Contains(
          wz.zone_geom,
          ST_GeogFromText('POINT(' || p_lon || ' ' || p_lat || ')')
      );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Canonical earthquake archive and multi-source provenance
-- Additive schema: existing users, subscriptions, and watch zones
-- remain intact.
-- ============================================================

CREATE TABLE IF NOT EXISTS earthquake_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_time TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    depth_km DOUBLE PRECISION CHECK (depth_km IS NULL OR depth_km >= 0),
    preferred_magnitude NUMERIC(4,2),
    preferred_magnitude_type VARCHAR(32),
    preferred_source VARCHAR(16) NOT NULL CHECK (preferred_source IN ('PHIVOLCS', 'USGS')),
    place TEXT,
    event_status VARCHAR(24) NOT NULL DEFAULT 'reviewed'
      CHECK (event_status IN ('reviewed', 'preliminary', 'updated', 'deleted', 'uncertain')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earthquake_events_origin_time
    ON earthquake_events (origin_time DESC, id);
CREATE INDEX IF NOT EXISTS idx_earthquake_events_magnitude
    ON earthquake_events (preferred_magnitude DESC, origin_time DESC);
CREATE INDEX IF NOT EXISTS idx_earthquake_events_location
    ON earthquake_events (latitude, longitude);

CREATE TABLE IF NOT EXISTS event_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    earthquake_event_id UUID REFERENCES earthquake_events(id) ON DELETE SET NULL,
    provider VARCHAR(16) NOT NULL CHECK (provider IN ('PHIVOLCS', 'USGS')),
    provider_event_id TEXT NOT NULL,
    source_origin_time TIMESTAMPTZ,
    source_latitude DOUBLE PRECISION,
    source_longitude DOUBLE PRECISION,
    source_depth_km DOUBLE PRECISION,
    source_magnitude NUMERIC(4,2),
    source_magnitude_type VARCHAR(32),
    source_place TEXT,
    source_status VARCHAR(32),
    source_url TEXT,
    source_revision TEXT,
    content_hash TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_sources_canonical_event
    ON event_sources (earthquake_event_id);
CREATE INDEX IF NOT EXISTS idx_event_sources_provider_retrieved
    ON event_sources (provider, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS event_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_source_id UUID NOT NULL UNIQUE REFERENCES event_sources(id) ON DELETE CASCADE,
    earthquake_event_id UUID NOT NULL REFERENCES earthquake_events(id) ON DELETE CASCADE,
    confidence NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
    decision VARCHAR(16) NOT NULL DEFAULT 'unreviewed'
      CHECK (decision IN ('unreviewed', 'matched', 'rejected', 'manual')),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    algorithm_version VARCHAR(32),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_matches_event
    ON event_matches (earthquake_event_id);

CREATE TABLE IF NOT EXISTS event_revisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    earthquake_event_id UUID NOT NULL REFERENCES earthquake_events(id) ON DELETE CASCADE,
    event_source_id UUID REFERENCES event_sources(id) ON DELETE SET NULL,
    change_kind VARCHAR(24) NOT NULL DEFAULT 'source_update',
    changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_revisions_event_time
    ON event_revisions (earthquake_event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS intensity_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    earthquake_event_id UUID NOT NULL REFERENCES earthquake_events(id) ON DELETE CASCADE,
    provider VARCHAR(16) NOT NULL CHECK (provider IN ('PHIVOLCS', 'USGS', 'OTHER')),
    product_type VARCHAR(32) NOT NULL,
    scale VARCHAR(16) NOT NULL CHECK (scale IN ('PEIS', 'MMI', 'UNKNOWN')),
    intensity_value NUMERIC(4,2),
    locality TEXT,
    observation_type VARCHAR(24) NOT NULL DEFAULT 'observed'
      CHECK (observation_type IN ('observed', 'instrumental', 'modelled', 'unknown')),
    uncertainty JSONB,
    observed_at TIMESTAMPTZ,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_url TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_intensity_observations_event
    ON intensity_observations (earthquake_event_id, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS source_sync_state (
    provider VARCHAR(16) PRIMARY KEY CHECK (provider IN ('PHIVOLCS', 'USGS')),
    cursor_value TEXT,
    backfill_from TIMESTAMPTZ,
    backfill_to TIMESTAMPTZ,
    backfill_completed_through TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'never_run'
      CHECK (status IN ('never_run', 'running', 'healthy', 'degraded', 'failed')),
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    earthquake_event_id UUID NOT NULL REFERENCES earthquake_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
    notification_type VARCHAR(24) NOT NULL DEFAULT 'initial'
      CHECK (notification_type IN ('initial', 'significant_revision')),
    qualifying_revision INTEGER NOT NULL DEFAULT 1 CHECK (qualifying_revision > 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    matched_zone_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'sending', 'delivered', 'retryable_failure', 'permanent_failure', 'suppressed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    fcm_message_id TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_retry
    ON notification_deliveries (status, next_attempt_at)
    WHERE status IN ('pending', 'retryable_failure');
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event_user
    ON notification_deliveries (earthquake_event_id, user_id, notification_type);

-- The legacy cursor remains for backward compatibility while the new
-- source-specific checkpoints and delivery ledger are introduced.
ALTER TABLE cron_state
    ADD COLUMN IF NOT EXISTS lease_owner TEXT,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Migration ledger used by db/migrate.js.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(128) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('20261110_eas_canonical_archive_v1')
ON CONFLICT (version) DO NOTHING;
