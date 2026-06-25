-- ============================================================
-- 011: Add history_months to analysis_config
--
-- Controls how many months of match history to fetch for analysis.
-- Default 3 months, configurable range 3-6.
-- ============================================================

ALTER TABLE analysis_config ADD COLUMN history_months INTEGER NOT NULL DEFAULT 3 CHECK (history_months >= 3 AND history_months <= 6);
