import { query } from '../connection';
import type { SimulationConfig, LLMProvider } from '@polyrader/core';

function mapConfig(row: Record<string, unknown>): SimulationConfig {
  return {
    id: String(row.id ?? 'default'),
    enabled: Boolean(row.enabled),
    initialCapital: Number(row.initial_capital) || 10000,
    betStrategy: String(row.bet_strategy) as 'fixed' | 'kelly' | 'proportional',
    betAmount: Number(row.bet_amount) || 100,
    maxBetFraction: Number(row.max_bet_fraction) || 0.05,
    minConfidence: Number(row.min_confidence) || 0.6,
    minEdge: Number(row.min_edge) || 0.05,
    oddsSource: String(row.odds_source) as 'market' | 'llm_inverse',
    participatingProviders: JSON.parse(String(row.participating_providers ?? '[]')) as LLMProvider[],
    autoSettle: Boolean(row.auto_settle),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export class SimulationRepository {
  getConfig(): SimulationConfig {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulation_config WHERE id = 'default'`,
    );
    if (rows.length === 0) {
      // 插入默认行
      query(`INSERT OR IGNORE INTO simulation_config (id) VALUES ('default')`);
      const retry = query<Record<string, unknown>>(
        `SELECT * FROM simulation_config WHERE id = 'default'`,
      );
      return mapConfig(retry[0]);
    }
    return mapConfig(rows[0]);
  }

  updateConfig(config: Partial<SimulationConfig>): SimulationConfig {
    const current = this.getConfig();
    const merged: SimulationConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };
    query(
      `UPDATE simulation_config SET
        enabled = ?,
        initial_capital = ?,
        bet_strategy = ?,
        bet_amount = ?,
        max_bet_fraction = ?,
        min_confidence = ?,
        min_edge = ?,
        odds_source = ?,
        participating_providers = ?,
        auto_settle = ?,
        updated_at = ?
      WHERE id = 'default'`,
      merged.enabled ? 1 : 0,
      merged.initialCapital,
      merged.betStrategy,
      merged.betAmount,
      merged.maxBetFraction,
      merged.minConfidence,
      merged.minEdge,
      merged.oddsSource,
      JSON.stringify(merged.participatingProviders),
      merged.autoSettle ? 1 : 0,
      merged.updatedAt,
    );
    return merged;
  }
}
