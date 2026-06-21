-- Bet Allocation: bankroll config + allocation plan history
-- Supports AI-driven bet allocation based on remaining capital and target return rate

-- ============================================================
-- Bankroll Configuration (single-row, user's capital settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS bankroll_config (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  total_capital       REAL NOT NULL DEFAULT 10000,
  target_return_rate  REAL NOT NULL DEFAULT 0.15,
  risk_tolerance      TEXT NOT NULL DEFAULT 'balanced',
  max_bet_fraction    REAL NOT NULL DEFAULT 0.15,
  max_total_exposure  REAL NOT NULL DEFAULT 0.60,
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- Seed default row
INSERT OR IGNORE INTO bankroll_config (id) VALUES (1);

-- ============================================================
-- Allocation Plans (history of AI-generated allocation plans)
-- ============================================================
CREATE TABLE IF NOT EXISTS allocation_plans (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  allocations         TEXT NOT NULL DEFAULT '[]',
  total_allocated     REAL NOT NULL DEFAULT 0,
  remaining_capital   REAL NOT NULL DEFAULT 0,
  expected_return     REAL NOT NULL DEFAULT 0,
  expected_roi        REAL NOT NULL DEFAULT 0,
  portfolio_risk      REAL NOT NULL DEFAULT 0,
  reasoning           TEXT DEFAULT '',
  source              TEXT NOT NULL DEFAULT 'algorithmic',
  generated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_allocation_plans_created ON allocation_plans(generated_at DESC);
