-- ============================================================
-- 012: Add min_volume_usd to analysis_config
--
-- Minimum market volume (in USD) required to trigger analysis.
-- Default 10000 (10k), configurable.
-- ============================================================

ALTER TABLE analysis_config ADD COLUMN min_volume_usd REAL NOT NULL DEFAULT 10000;
