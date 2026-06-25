-- Tunable signal weights used by behavior inference and final aggregation.

CREATE TABLE IF NOT EXISTS signal_tuning_config (
  id                  TEXT PRIMARY KEY DEFAULT 'default',
  source_weights      TEXT NOT NULL,
  behavior_weights    TEXT NOT NULL,
  recommendation      TEXT NOT NULL,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO signal_tuning_config (
  id,
  source_weights,
  behavior_weights,
  recommendation
) VALUES (
  'default',
  '{"polymarket":0.4,"prediction_model":1,"hltv_odds":0.6,"community":0.6,"capital_flow":0.55,"whale_flow":0.55,"mean_reversion":0.55,"market_behavior":0.9,"ai_debate":1.15}',
  '{"capitalWithOrderBook":0.32,"capitalWithoutOrderBook":0.1,"reversionWithHistory":0.28,"reversionWithoutHistory":0.12,"whaleWithFlow":0.3,"whaleWithoutFlow":0.05,"market":0.1}',
  '{"minEdge":0.05,"bubbleMinEdge":0.07,"minConfidence":0.3,"bubbleRiskPenalty":0.5}'
);
