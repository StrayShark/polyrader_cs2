-- Paper copy trade settlement / PnL attribution

ALTER TABLE copy_trades ADD COLUMN pnl REAL;
ALTER TABLE copy_trades ADD COLUMN settlement_status TEXT DEFAULT 'pending'
  CHECK(settlement_status IN ('pending', 'won', 'lost'));
ALTER TABLE copy_trades ADD COLUMN market_question TEXT;
ALTER TABLE copy_trades ADD COLUMN outcome TEXT;
ALTER TABLE copy_trades ADD COLUMN resolved_at TEXT;

CREATE INDEX IF NOT EXISTS idx_copy_trades_settlement ON copy_trades(settlement_status);
