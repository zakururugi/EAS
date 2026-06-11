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

CREATE INDEX idx_users_device_id ON users(device_id);

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

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_fcm_token ON push_subscriptions(fcm_token);

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

CREATE INDEX idx_watch_zones_user_id ON watch_zones(user_id);
-- Spatial index for fast containment queries
CREATE INDEX idx_watch_zones_zone_geom ON watch_zones USING GIST (zone_geom);

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