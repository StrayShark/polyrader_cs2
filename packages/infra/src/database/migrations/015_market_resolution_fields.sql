-- Persist market resolution fields so historical signal snapshots can be
-- calibrated after a market resolves.

ALTER TABLE markets ADD COLUMN resolved_outcome TEXT;
ALTER TABLE markets ADD COLUMN resolved_price REAL;
