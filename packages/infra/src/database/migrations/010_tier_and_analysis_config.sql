-- ============================================================
-- 010: Event tier classification + analysis filter config
--
-- Adds tier column to matches and a configurable analysis filter
-- so the 6-hour batch analysis cron can skip low-tier events.
-- ============================================================

-- Add tier column to matches (S/A/B/C, defaults to C for legacy rows)
ALTER TABLE matches ADD COLUMN tier TEXT DEFAULT 'C';
CREATE INDEX IF NOT EXISTS idx_matches_tier ON matches(tier);
CREATE INDEX IF NOT EXISTS idx_matches_tier_scheduled ON matches(tier, scheduled_at ASC);

-- ============================================================
-- analysis_config — singleton config table for batch analysis filters
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_config (
  id                  INTEGER PRIMARY KEY DEFAULT 1,  -- singleton row
  min_tier            TEXT NOT NULL DEFAULT 'B',      -- minimum tier to analyze: S/A/B/C
  enabled             INTEGER DEFAULT 1,              -- master toggle for batch analysis
  min_stars           INTEGER DEFAULT 0,              -- HLTV star rating threshold (0-5)
  lan_only            INTEGER DEFAULT 0,              -- 1 = only analyze LAN events
  skip_if_no_roster   INTEGER DEFAULT 1,              -- 1 = skip matches without confirmed roster
  updated_at          TEXT DEFAULT (datetime('now')),
  CHECK (id = 1)  -- enforce singleton
);

-- Seed default config row
INSERT OR IGNORE INTO analysis_config (id, min_tier, enabled, min_stars, lan_only, skip_if_no_roster)
VALUES (1, 'B', 1, 0, 0, 1);
