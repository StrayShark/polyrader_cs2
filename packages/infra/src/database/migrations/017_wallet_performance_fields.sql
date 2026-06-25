-- Wallet performance stats derived from settled markets
ALTER TABLE whales ADD COLUMN settled_bets INTEGER DEFAULT 0;
ALTER TABLE whales ADD COLUMN wins INTEGER DEFAULT 0;
ALTER TABLE whales ADD COLUMN losses INTEGER DEFAULT 0;
ALTER TABLE whales ADD COLUMN total_wagered REAL DEFAULT 0;
ALTER TABLE whales ADD COLUMN roi REAL DEFAULT 0;
ALTER TABLE whales ADD COLUMN performance_updated_at TEXT;
