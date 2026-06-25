-- ============================================================
-- 009: Esports data normalization — players, rosters, lineups, H2H
--
-- Design goals:
--   1. Team uniqueness is defined by the active roster (5-man lineup).
--      When a team's roster changes, a new roster_hash snapshot is created
--      so historical analyses remain reproducible.
--   2. Only data from the last 3 months is retained (enforced by cron cleanup).
--   3. Head-to-head data is now persisted (previously fetched but discarded).
-- ============================================================

-- ============================================================
-- players — normalized player records (replaces teams.players JSON)
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  player_id   TEXT PRIMARY KEY,        -- nickname lowercased as stable id
  nickname    TEXT NOT NULL,
  real_name   TEXT DEFAULT '',
  role        TEXT DEFAULT '',
  rating      REAL DEFAULT 1.0,
  kd_ratio    REAL DEFAULT 1.0,
  hs_percent  REAL DEFAULT 0,
  maps_played INTEGER DEFAULT 0,
  source      TEXT DEFAULT 'hltv',     -- 'hltv' | 'liquipedia'
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_nickname ON players(nickname);

-- ============================================================
-- team_rosters — roster snapshots keyed by roster_hash
--
-- A roster_hash = SHA-256 of sorted active player IDs.
-- When the 5-man lineup changes, a NEW row is inserted.
-- The teams table retains the *current* roster_hash for quick lookups.
-- ============================================================
CREATE TABLE IF NOT EXISTS team_rosters (
  roster_hash  TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  player_ids   TEXT NOT NULL,          -- JSON array of player_id, sorted
  player_count INTEGER DEFAULT 5,
  is_active    INTEGER DEFAULT 1,      -- 1 = current roster, 0 = historical
  first_seen   TEXT DEFAULT (datetime('now')),
  last_seen    TEXT DEFAULT (datetime('now')),
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_rosters_team ON team_rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_team_rosters_active ON team_rosters(is_active);
CREATE INDEX IF NOT EXISTS idx_team_rosters_last_seen ON team_rosters(last_seen DESC);

-- ============================================================
-- team_roster_players — many-to-many between roster snapshot and players
-- ============================================================
CREATE TABLE IF NOT EXISTS team_roster_players (
  roster_hash  TEXT NOT NULL REFERENCES team_rosters(roster_hash) ON DELETE CASCADE,
  player_id    TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  role         TEXT DEFAULT '',
  is_standin   INTEGER DEFAULT 0,
  PRIMARY KEY (roster_hash, player_id)
);

CREATE INDEX IF NOT EXISTS idx_trp_player ON team_roster_players(player_id);

-- ============================================================
-- Add roster_hash column to teams table (points to current active roster)
-- ============================================================
ALTER TABLE teams ADD COLUMN roster_hash TEXT DEFAULT '';

-- ============================================================
-- match_lineups — normalized lineup per match (replaces matches.lineups JSON)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_lineups (
  match_id      TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  team_a_hash   TEXT DEFAULT '',       -- roster_hash at match time
  team_b_hash   TEXT DEFAULT '',
  team_a_confirmed INTEGER DEFAULT 0,
  team_b_confirmed INTEGER DEFAULT 0,
  team_a_standin_count INTEGER DEFAULT 0,
  team_b_standin_count INTEGER DEFAULT 0,
  raw_lineup    TEXT,                  -- full JSON for audit
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_match_lineups_match ON match_lineups(match_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_created ON match_lineups(created_at DESC);

-- ============================================================
-- match_lineup_players — individual player entries per match lineup
-- ============================================================
CREATE TABLE IF NOT EXISTS match_lineup_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      TEXT NOT NULL REFERENCES match_lineups(match_id) ON DELETE CASCADE,
  team_side     TEXT NOT NULL,         -- 'A' | 'B'
  player_id     TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  role          TEXT DEFAULT '',
  rating        REAL DEFAULT 1.0,
  impact_score  REAL DEFAULT 0,
  maps_on_record INTEGER DEFAULT 0,
  is_standin    INTEGER DEFAULT 0,
  UNIQUE(match_id, team_side, player_id)
);

CREATE INDEX IF NOT EXISTS idx_mlp_match ON match_lineup_players(match_id);
CREATE INDEX IF NOT EXISTS idx_mlp_player ON match_lineup_players(player_id);

-- ============================================================
-- head_to_head — persisted H2H records between two teams
-- ============================================================
CREATE TABLE IF NOT EXISTS head_to_head (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  team_a_id       TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  team_b_id       TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  matches_played  INTEGER DEFAULT 0,
  team_a_wins     INTEGER DEFAULT 0,
  team_b_wins     INTEGER DEFAULT 0,
  last_match_date TEXT,
  map_results     TEXT DEFAULT '[]',   -- JSON array of { map, result, score }
  source          TEXT DEFAULT 'hltv',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(team_a_id, team_b_id)
);

CREATE INDEX IF NOT EXISTS idx_h2h_team_a ON head_to_head(team_a_id);
CREATE INDEX IF NOT EXISTS idx_h2h_team_b ON head_to_head(team_b_id);
CREATE INDEX IF NOT EXISTS idx_h2h_created ON head_to_head(created_at DESC);

-- ============================================================
-- team_match_history — recent match results per team (for recentForm)
-- ============================================================
CREATE TABLE IF NOT EXISTS team_match_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  match_id    TEXT,
  opponent    TEXT NOT NULL,
  opponent_id TEXT DEFAULT '',
  result      TEXT NOT NULL,           -- 'win' | 'loss' | 'draw'
  score       TEXT DEFAULT '',
  event       TEXT DEFAULT '',
  match_date  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tmh_team ON team_match_history(team_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_tmh_created ON team_match_history(created_at DESC);

-- ============================================================
-- map_pool_stats — per-team per-map statistics (replaces teams.map_pool JSON)
-- ============================================================
CREATE TABLE IF NOT EXISTS map_pool_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id         TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  map_name        TEXT NOT NULL,
  win_rate        REAL DEFAULT 0.5,
  matches_played  INTEGER DEFAULT 0,
  rounds_won      INTEGER DEFAULT 0,
  rounds_lost     INTEGER DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, map_name)
);

CREATE INDEX IF NOT EXISTS idx_map_pool_team ON map_pool_stats(team_id);
