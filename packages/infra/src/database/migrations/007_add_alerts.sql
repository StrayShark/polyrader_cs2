CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  market_slug TEXT NOT NULL,
  market_question TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('price_above','price_below','volume_above')),
  threshold REAL NOT NULL,
  current_value REAL DEFAULT 0,
  triggered INTEGER DEFAULT 0,
  triggered_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_market ON price_alerts(market_slug);
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON price_alerts(triggered);
