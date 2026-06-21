-- Risk metrics: annualized Sharpe ratio and maximum drawdown
-- Backs the new LLMStats.sharpeRatio / LLMStats.maxDrawdown fields

ALTER TABLE llm_stats ADD COLUMN sharpe_ratio REAL DEFAULT 0;
ALTER TABLE llm_stats ADD COLUMN max_drawdown REAL DEFAULT 0;
