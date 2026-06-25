-- Followed wallets (Phase 2) and copy trading (Phase 3)

CREATE TABLE IF NOT EXISTS followed_wallets (
  address TEXT PRIMARY KEY,
  label TEXT,
  min_trade_usd REAL DEFAULT 500,
  alerts_enabled INTEGER DEFAULT 1,
  auto_copy_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_copy_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'paper' CHECK(mode IN ('paper', 'live')),
  copy_ratio REAL DEFAULT 0.1,
  max_order_usd REAL DEFAULT 200,
  min_leader_trade_usd REAL DEFAULT 500,
  max_slippage REAL DEFAULT 0.05,
  cs2_only INTEGER DEFAULT 1,
  min_leader_win_rate REAL DEFAULT 0.55,
  min_leader_samples INTEGER DEFAULT 10,
  daily_cap_usd REAL DEFAULT 2000,
  require_user_confirm INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO wallet_copy_config (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS wallet_copy_signals (
  id TEXT PRIMARY KEY,
  leader_address TEXT NOT NULL,
  leader_tx_hash TEXT NOT NULL UNIQUE,
  token_id TEXT NOT NULL,
  condition_id TEXT,
  market_question TEXT,
  outcome TEXT,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  leader_amount REAL NOT NULL,
  leader_price REAL NOT NULL,
  suggested_amount REAL,
  leader_win_rate REAL,
  leader_settled_bets INTEGER,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'executed', 'skipped', 'failed')),
  skip_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wallet_copy_signals_leader ON wallet_copy_signals(leader_address);
CREATE INDEX IF NOT EXISTS idx_wallet_copy_signals_status ON wallet_copy_signals(status);
CREATE INDEX IF NOT EXISTS idx_wallet_copy_signals_created ON wallet_copy_signals(created_at);

CREATE TABLE IF NOT EXISTS copy_trades (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('paper', 'live')),
  token_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
  amount REAL NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'filled', 'failed', 'rejected')),
  error_message TEXT,
  clob_order_id TEXT,
  executed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (signal_id) REFERENCES wallet_copy_signals(id)
);

CREATE INDEX IF NOT EXISTS idx_copy_trades_signal ON copy_trades(signal_id);
CREATE INDEX IF NOT EXISTS idx_copy_trades_created ON copy_trades(created_at);
