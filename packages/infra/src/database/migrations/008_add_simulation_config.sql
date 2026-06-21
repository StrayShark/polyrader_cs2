-- Simulation configuration table
CREATE TABLE IF NOT EXISTS simulation_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled INTEGER DEFAULT 0,                    -- 0=disabled, 1=enabled
  initial_capital REAL DEFAULT 10000,           -- per-provider 初始虚拟资金
  bet_strategy TEXT DEFAULT 'fixed',            -- 'fixed' | 'kelly' | 'proportional'
  bet_amount REAL DEFAULT 100,                  -- fixed 策略时的固定金额
  max_bet_fraction REAL DEFAULT 0.05,           -- kelly/proportional 时的最大资金比例
  min_confidence REAL DEFAULT 0.6,              -- 低于此置信度不下注
  min_edge REAL DEFAULT 0.05,                   -- LLM概率 vs 市场概率的最小edge
  odds_source TEXT DEFAULT 'market',            -- 'market' | 'llm_inverse'
  participating_providers TEXT DEFAULT '[]',    -- JSON数组: ["openai","anthropic"]
  auto_settle INTEGER DEFAULT 1,                -- 是否自动结算
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 插入默认配置
INSERT OR IGNORE INTO simulation_config (id) VALUES ('default');
