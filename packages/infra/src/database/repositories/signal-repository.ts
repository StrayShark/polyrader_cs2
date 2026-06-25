import { query } from '../connection';
import type {
  DebateInferenceResult,
  MarketBehaviorResult,
  SignalSnapshot,
  SignalSource,
  SignalTuningConfig,
  SignalTuningConfigInput,
} from '@polyrader/core';
import { mergeSignalTuningConfig } from '@polyrader/core';

export class SignalRepository {
  insertSnapshot(snapshot: Omit<SignalSnapshot, 'id' | 'createdAt'> & { createdAt?: string }): SignalSnapshot {
    const createdAt = snapshot.createdAt ?? new Date().toISOString();
    query(
      `INSERT INTO signal_snapshots (
         market_id, question, market_prob, predicted_prob, behavior_prob,
         ai_debate_prob, final_prob, edge, risk_adjusted_edge, recommendation,
         resolved_outcome, resolved_price, signals, market_behavior, ai_debate,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.marketId,
      snapshot.question,
      snapshot.marketProb,
      snapshot.predictedProb,
      snapshot.behaviorProb ?? null,
      snapshot.aiDebateProb ?? null,
      snapshot.finalProb,
      snapshot.edge,
      snapshot.riskAdjustedEdge,
      snapshot.recommendation,
      snapshot.resolvedOutcome ?? null,
      snapshot.resolvedPrice ?? null,
      JSON.stringify(snapshot.signals),
      snapshot.marketBehavior ? JSON.stringify(snapshot.marketBehavior) : null,
      snapshot.aiDebate ? JSON.stringify(snapshot.aiDebate) : null,
      createdAt,
    );

    return { ...snapshot, createdAt };
  }

  findByMarket(marketId: string, limit = 50): SignalSnapshot[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM signal_snapshots
       WHERE market_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      marketId,
      limit,
    );
    return rows.map((row) => this.mapRow(row));
  }

  findRecent(limit = 100): SignalSnapshot[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM signal_snapshots
       ORDER BY created_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((row) => this.mapRow(row));
  }

  findResolved(limit = 1000): SignalSnapshot[] {
    const rows = query<Record<string, unknown>>(
      `SELECT
         s.*,
         COALESCE(s.resolved_outcome, m.resolved_outcome) AS effective_resolved_outcome,
         COALESCE(s.resolved_price, m.resolved_price) AS effective_resolved_price
       FROM signal_snapshots s
       LEFT JOIN markets m ON m.condition_id = s.market_id
       WHERE
         s.resolved_price IS NOT NULL OR
         s.resolved_outcome IS NOT NULL OR
         m.resolved_price IS NOT NULL OR
         m.resolved_outcome IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((row) => this.mapRow({
      ...row,
      resolved_outcome: row.effective_resolved_outcome,
      resolved_price: row.effective_resolved_price,
    }));
  }

  getTuningConfig(): SignalTuningConfig {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM signal_tuning_config WHERE id = 'default'`,
    );
    if (rows.length === 0) {
      return mergeSignalTuningConfig();
    }
    return this.mapTuningConfig(rows[0]);
  }

  updateTuningConfig(config: SignalTuningConfigInput): SignalTuningConfig {
    const current = this.getTuningConfig();
    const merged = mergeSignalTuningConfig({
      ...current,
      ...config,
      sourceWeights: {
        ...current.sourceWeights,
        ...config.sourceWeights,
      },
      behaviorWeights: {
        ...current.behaviorWeights,
        ...config.behaviorWeights,
      },
      recommendation: {
        ...current.recommendation,
        ...config.recommendation,
      },
      updatedAt: new Date().toISOString(),
    });

    query(
      `INSERT OR REPLACE INTO signal_tuning_config (
         id, source_weights, behavior_weights, recommendation, updated_at
       ) VALUES ('default', ?, ?, ?, ?)`,
      JSON.stringify(merged.sourceWeights),
      JSON.stringify(merged.behaviorWeights),
      JSON.stringify(merged.recommendation),
      merged.updatedAt,
    );

    return merged;
  }

  private mapRow(row: Record<string, unknown>): SignalSnapshot {
    return {
      id: Number(row.id),
      marketId: String(row.market_id ?? ''),
      question: String(row.question ?? ''),
      marketProb: Number(row.market_prob) || 0.5,
      predictedProb: Number(row.predicted_prob) || 0.5,
      behaviorProb: nullableNumber(row.behavior_prob),
      aiDebateProb: nullableNumber(row.ai_debate_prob),
      finalProb: Number(row.final_prob) || 0.5,
      edge: Number(row.edge) || 0,
      riskAdjustedEdge: Number(row.risk_adjusted_edge) || 0,
      recommendation: normalizeRecommendation(row.recommendation),
      resolvedOutcome: nullableString(row.resolved_outcome),
      resolvedPrice: nullableNumber(row.resolved_price),
      signals: parseJson<SignalSource[]>(row.signals, []),
      marketBehavior: parseJson<MarketBehaviorResult | undefined>(row.market_behavior, undefined),
      aiDebate: parseJson<DebateInferenceResult | undefined>(row.ai_debate, undefined),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    };
  }

  private mapTuningConfig(row: Record<string, unknown>): SignalTuningConfig {
    return mergeSignalTuningConfig({
      sourceWeights: parseJson<SignalTuningConfig['sourceWeights']>(row.source_weights, {} as SignalTuningConfig['sourceWeights']),
      behaviorWeights: parseJson<SignalTuningConfig['behaviorWeights']>(row.behavior_weights, {} as SignalTuningConfig['behaviorWeights']),
      recommendation: parseJson<SignalTuningConfig['recommendation']>(row.recommendation, {} as SignalTuningConfig['recommendation']),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    });
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nullableNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function nullableString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function normalizeRecommendation(value: unknown): SignalSnapshot['recommendation'] {
  return value === 'buy_yes' || value === 'buy_no' || value === 'skip' ? value : 'skip';
}
