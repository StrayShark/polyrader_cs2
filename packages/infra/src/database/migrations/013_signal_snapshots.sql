-- Signal snapshots for replay, calibration, and post-resolution review.

CREATE TABLE IF NOT EXISTS signal_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id           TEXT NOT NULL,
  question            TEXT NOT NULL DEFAULT '',
  market_prob         REAL NOT NULL,
  predicted_prob      REAL NOT NULL,
  behavior_prob       REAL,
  ai_debate_prob      REAL,
  final_prob          REAL NOT NULL,
  edge                REAL NOT NULL,
  risk_adjusted_edge  REAL NOT NULL,
  recommendation      TEXT NOT NULL DEFAULT 'skip',
  resolved_outcome    TEXT,
  resolved_price      REAL,
  signals             TEXT NOT NULL DEFAULT '[]',
  market_behavior     TEXT,
  ai_debate           TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_market ON signal_snapshots(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_snapshots_created ON signal_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_snapshots_edge ON signal_snapshots(edge DESC);
