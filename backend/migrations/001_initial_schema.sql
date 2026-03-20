-- Migration: 001_initial_schema
-- Description: Initial players, saves, and progression_events tables
-- Created: 2026-03-20

-- ============================================================
-- Players
-- Created automatically via Supabase Auth webhook on first login.
-- ============================================================
CREATE TABLE players (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID        NOT NULL UNIQUE,  -- references auth.users (Supabase)
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-Level Security: players can only read/update their own row
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY players_select ON players
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY players_update ON players
  FOR UPDATE USING (auth_user_id = auth.uid());


-- ============================================================
-- Saves
-- One active save per player (enforced via partial unique index).
-- Soft-delete via deleted_at — allows a player to start a new game
-- without losing their previous save for 30 days.
-- ============================================================
CREATE TABLE saves (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  save_version   INTEGER     NOT NULL DEFAULT 1,
  schema_version INTEGER     NOT NULL DEFAULT 1,
  save_data      JSONB       NOT NULL,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ DEFAULT NULL  -- NULL = active; set to now() for soft delete
  -- Future Sprint 2:
  --   GET /api/v1/saves/{player_id}/deleted  — list soft-deleted saves (30-day window)
  --   POST /api/v1/saves/{player_id}/restore — restore most recent soft-deleted save
  --   Rows with deleted_at IS NOT NULL are purged after 30 days via scheduled job
);

-- Partial unique index: only one ACTIVE save per player
-- (allows multiple soft-deleted rows per player — needed for new-game flow)
CREATE UNIQUE INDEX saves_player_active_unique
  ON saves (player_id)
  WHERE deleted_at IS NULL;

-- Index for efficient active-save lookups
CREATE INDEX saves_player_active_idx
  ON saves (player_id)
  WHERE deleted_at IS NULL;

-- Row-Level Security
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY saves_select ON saves
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
    AND deleted_at IS NULL
  );

CREATE POLICY saves_insert ON saves
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );

CREATE POLICY saves_update ON saves
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );


-- ============================================================
-- Progression Events
-- Append-only audit log. Never updated after insert.
-- Used for server-side validation and debugging ("where did my money go?").
-- ============================================================
CREATE TABLE progression_events (
  id               UUID        PRIMARY KEY,  -- client-generated event_id (idempotency key)
  player_id        UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL,     -- mission_complete | vehicle_unlock | purchase | safe_house_unlock
  payload          JSONB       NOT NULL,
  applied          BOOLEAN     NOT NULL,     -- false = rejected by server validation
  rejection_reason TEXT,                     -- populated when applied = false
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for player event history (descending — most recent first)
CREATE INDEX progression_events_player_idx
  ON progression_events (player_id, created_at DESC);

-- Row-Level Security
ALTER TABLE progression_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY progression_events_select ON progression_events
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );

CREATE POLICY progression_events_insert ON progression_events
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );
