-- Prompt A/B Testing: variant definitions + variant tracking on existing tables

-- ============================================================
-- Prompt Variant Definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS prompt_variants (
  variant_id       TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  system_prompt    TEXT NOT NULL,
  context_template TEXT DEFAULT '',
  output_schema    TEXT DEFAULT '',
  is_enabled       INTEGER DEFAULT 1,
  traffic_weight   REAL DEFAULT 1.0,
  is_control       INTEGER DEFAULT 0,
  notes            TEXT DEFAULT '',
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Add variant_id to existing analysis/bet tables
-- ============================================================
ALTER TABLE llm_analyses ADD COLUMN variant_id TEXT DEFAULT 'baseline';
ALTER TABLE simulated_bets ADD COLUMN variant_id TEXT DEFAULT 'baseline';

-- ============================================================
-- Seed baseline (control) variant
-- ============================================================
INSERT OR IGNORE INTO prompt_variants (variant_id, name, system_prompt, is_control, traffic_weight, notes)
VALUES ('baseline', 'Baseline', 'You are an expert CS2 esports analyst.', 1, 1.0, 'Default prompt variant');
