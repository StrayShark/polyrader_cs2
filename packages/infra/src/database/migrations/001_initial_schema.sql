-- PolyRader CS2 Database Schema (SQLite)
-- Auto-created on first run

-- ============================================================
-- Markets (Polymarket data)
-- ============================================================
CREATE TABLE IF NOT EXISTS markets (
  condition_id   TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  question       TEXT NOT NULL,
  description    TEXT DEFAULT '',
  outcomes       TEXT DEFAULT '[]',
  outcome_prices TEXT DEFAULT '[]',
  volume         REAL DEFAULT 0,
  volume_24h     REAL DEFAULT 0,
  liquidity      REAL DEFAULT 0,
  end_date       TEXT,
  start_date     TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  tags           TEXT DEFAULT '[]',
  match_info     TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_markets_slug ON markets(slug);

-- ============================================================
-- Price History
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  condition_id  TEXT NOT NULL REFERENCES markets(condition_id) ON DELETE CASCADE,
  price         REAL NOT NULL,
  timestamp     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_condition ON price_history(condition_id, timestamp DESC);

-- ============================================================
-- Teams (HLTV data, local cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  team_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  logo        TEXT DEFAULT '',
  rank        INTEGER DEFAULT 999,
  region      TEXT DEFAULT '',
  players     TEXT DEFAULT '[]',
  recent_form TEXT DEFAULT '{}',
  map_pool    TEXT DEFAULT '{}',
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_teams_rank ON teams(rank);

-- ============================================================
-- Matches (HLTV data, local cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  match_id      TEXT PRIMARY KEY,
  team_a_id     TEXT REFERENCES teams(team_id),
  team_b_id     TEXT REFERENCES teams(team_id),
  team_a_name   TEXT DEFAULT '',
  team_b_name   TEXT DEFAULT '',
  event_name    TEXT DEFAULT '',
  event_type    TEXT DEFAULT 'Online',
  format        TEXT DEFAULT 'BO3',
  scheduled_at  TEXT,
  status        TEXT DEFAULT 'upcoming',
  maps          TEXT DEFAULT '[]',
  score         TEXT,
  winner_id     TEXT,
  has_team_data INTEGER DEFAULT 0,
  lineups      TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON matches(scheduled_at);

-- ============================================================
-- Predictions
-- ============================================================
CREATE TABLE IF NOT EXISTS predictions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id        TEXT NOT NULL REFERENCES matches(match_id),
  team_a_prob     REAL NOT NULL,
  team_b_prob     REAL NOT NULL,
  factors         TEXT DEFAULT '{}',
  confidence      REAL DEFAULT 0,
  recommendation  TEXT DEFAULT 'skip',
  generated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);

-- ============================================================
-- Whales
-- ============================================================
CREATE TABLE IF NOT EXISTS whales (
  address          TEXT PRIMARY KEY,
  label            TEXT,
  total_volume     REAL DEFAULT 0,
  total_positions  INTEGER DEFAULT 0,
  active_positions INTEGER DEFAULT 0,
  win_rate         REAL DEFAULT 0,
  pnl              REAL DEFAULT 0,
  suspicious_score TEXT DEFAULT '{}',
  recent_trades    TEXT DEFAULT '[]',
  last_active      TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_whales_volume ON whales(total_volume DESC);

-- ============================================================
-- Whale Trades
-- ============================================================
CREATE TABLE IF NOT EXISTS whale_trades (
  tx_hash    TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  market_id  TEXT NOT NULL,
  outcome    TEXT NOT NULL,
  amount     REAL NOT NULL,
  price      REAL NOT NULL,
  timestamp  TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'buy'
);

CREATE INDEX IF NOT EXISTS idx_whale_trades_address ON whale_trades(address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_whale_trades_market ON whale_trades(market_id);

-- ============================================================
-- Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  address          TEXT NOT NULL,
  market_id        TEXT,
  alert_type       TEXT NOT NULL DEFAULT 'whale_activity',
  message          TEXT NOT NULL,
  suspicious_score REAL DEFAULT 0,
  amount           REAL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now')),
  is_read          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

-- ============================================================
-- LLM Configs
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_configs (
  provider        TEXT PRIMARY KEY,
  model           TEXT NOT NULL,
  api_key         TEXT NOT NULL DEFAULT '',
  is_enabled      INTEGER DEFAULT 0,
  is_connected    INTEGER DEFAULT 0,
  last_tested_at  TEXT,
  quota_used      REAL DEFAULT 0,
  quota_limit     REAL DEFAULT 1000000,
  cost_estimate   REAL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- LLM Analysis Results
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_analyses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id        TEXT NOT NULL REFERENCES matches(match_id),
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  team_a_prob     REAL NOT NULL,
  team_b_prob     REAL NOT NULL,
  confidence      REAL DEFAULT 0,
  reasoning       TEXT DEFAULT '',
  key_factors     TEXT DEFAULT '[]',
  risk_assessment TEXT DEFAULT '',
  latency         INTEGER DEFAULT 0,
  token_usage     TEXT DEFAULT '{}',
  error           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_analyses_match ON llm_analyses(match_id);
CREATE INDEX IF NOT EXISTS idx_llm_analyses_provider ON llm_analyses(provider);

-- ============================================================
-- LLM Aggregations
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_aggregations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id                TEXT NOT NULL REFERENCES matches(match_id),
  aggregated_team_a_prob  REAL NOT NULL,
  aggregated_team_b_prob  REAL NOT NULL,
  consensus_level         TEXT NOT NULL DEFAULT 'divergent',
  agreement_rate          REAL DEFAULT 0,
  std_dev                 REAL DEFAULT 0,
  majority_pick           TEXT DEFAULT 'split',
  kelly_team_a            REAL DEFAULT 0,
  kelly_team_b            REAL DEFAULT 0,
  recommended_bet         TEXT DEFAULT 'skip',
  kelly_fraction          REAL DEFAULT 0,
  results                 TEXT DEFAULT '[]',
  created_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_aggregations_match ON llm_aggregations(match_id);

-- ============================================================
-- LLM Stats
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_stats (
  provider            TEXT PRIMARY KEY,
  model               TEXT NOT NULL,
  total_predictions   INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  accuracy            REAL DEFAULT 0,
  average_confidence  REAL DEFAULT 0,
  calibration_error   REAL DEFAULT 0,
  profit_loss         REAL DEFAULT 0,
  roi                 REAL DEFAULT 0,
  last_updated        TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Simulated Bets
-- ============================================================
CREATE TABLE IF NOT EXISTS simulated_bets (
  id          TEXT PRIMARY KEY,
  match_id    TEXT NOT NULL REFERENCES matches(match_id),
  provider    TEXT NOT NULL,
  team        TEXT NOT NULL,
  amount      REAL DEFAULT 100,
  odds        REAL NOT NULL,
  result      TEXT DEFAULT 'pending',
  profit_loss REAL DEFAULT 0,
  placed_at   TEXT DEFAULT (datetime('now')),
  settled_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_simulated_bets_provider ON simulated_bets(provider);
CREATE INDEX IF NOT EXISTS idx_simulated_bets_result ON simulated_bets(result);
CREATE INDEX IF NOT EXISTS idx_simulated_bets_match ON simulated_bets(match_id);
CREATE INDEX IF NOT EXISTS idx_simulated_bets_placed ON simulated_bets(placed_at DESC);

-- ============================================================
-- Calibration Data
-- ============================================================
CREATE TABLE IF NOT EXISTS calibration_data (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL,
  confidence_bucket INTEGER NOT NULL,
  sample_count      INTEGER DEFAULT 0,
  accuracy          REAL DEFAULT 0,
  updated_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, confidence_bucket)
);

CREATE INDEX IF NOT EXISTS idx_calibration_provider ON calibration_data(provider);

-- ============================================================
-- Signal Comparisons
-- ============================================================
CREATE TABLE IF NOT EXISTS signal_comparisons (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id             TEXT NOT NULL,
  polymarket_prob       REAL NOT NULL,
  predicted_prob        REAL NOT NULL,
  deviation             REAL DEFAULT 0,
  arbitrage_opportunity INTEGER DEFAULT 0,
  signals               TEXT DEFAULT '[]',
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_comparisons_market ON signal_comparisons(market_id);
CREATE INDEX IF NOT EXISTS idx_signal_comparisons_deviation ON signal_comparisons(deviation DESC);
CREATE INDEX IF NOT EXISTS idx_signal_comparisons_created ON signal_comparisons(created_at DESC);

-- ============================================================
-- Daily Dashboards
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_dashboards (
  date             TEXT PRIMARY KEY,
  total_matches    INTEGER DEFAULT 0,
  analyzed_matches INTEGER DEFAULT 0,
  matches_data     TEXT DEFAULT '[]',
  top_deviations   TEXT DEFAULT '[]',
  whale_alerts     TEXT DEFAULT '[]',
  generated_at     TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Performance: Composite indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_markets_status_volume ON markets(status, volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status_scheduled ON matches(status, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_llm_analyses_provider_created ON llm_analyses(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulated_bets_result_provider ON simulated_bets(result, provider);
CREATE INDEX IF NOT EXISTS idx_whale_trades_market_timestamp ON whale_trades(market_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_read_created ON alerts(is_read, created_at DESC);

-- ============================================================
-- Performance: Additional indexes for lookup patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_markets_condition ON markets(condition_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_a ON matches(team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b ON matches(team_b_id);
CREATE INDEX IF NOT EXISTS idx_whale_trades_timestamp ON whale_trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_llm_aggregations_created ON llm_aggregations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

-- ============================================================
-- SQLite PRAGMA optimizations (applied at connection level)
-- ============================================================
-- PRAGMA journal_mode=WAL;       -- Write-Ahead Logging
-- PRAGMA synchronous=NORMAL;     -- Safe with WAL
-- PRAGMA cache_size=-64000;      -- 64MB cache
-- PRAGMA busy_timeout=5000;      -- 5s busy timeout
-- PRAGMA foreign_keys=ON;        -- Enforce FK constraints

-- ============================================================
-- Migration tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  executed_at TEXT DEFAULT (datetime('now'))
);
