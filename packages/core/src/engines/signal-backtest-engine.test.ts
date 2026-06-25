import { describe, expect, it } from 'vitest';
import { SignalBacktestEngine } from './signal-backtest-engine';
import type { SignalSnapshot } from '../types/index';

function makeSnapshot(overrides: Partial<SignalSnapshot>): SignalSnapshot {
  return {
    marketId: 'm1',
    question: 'Will Team A win?',
    marketProb: 0.5,
    predictedProb: 0.6,
    behaviorProb: 0.55,
    aiDebateProb: 0.58,
    finalProb: 0.6,
    edge: 0.1,
    riskAdjustedEdge: 0.08,
    recommendation: 'buy_yes',
    resolvedPrice: 1,
    signals: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SignalBacktestEngine', () => {
  const engine = new SignalBacktestEngine();

  it('calculates Brier score for market, model, behavior, AI, and final signals', () => {
    const result = engine.run([
      makeSnapshot({ marketId: 'm1', marketProb: 0.5, predictedProb: 0.7, behaviorProb: 0.65, aiDebateProb: 0.6, finalProb: 0.68, resolvedPrice: 1 }),
      makeSnapshot({ marketId: 'm2', marketProb: 0.5, predictedProb: 0.3, behaviorProb: 0.4, aiDebateProb: 0.35, finalProb: 0.32, resolvedPrice: 0 }),
    ]);

    expect(result.sampleSize).toBe(2);
    expect(result.metrics).toHaveLength(5);
    expect(result.metrics.find((metric) => metric.source === 'prediction_model')?.brierScore).toBeCloseTo(0.09, 2);
    expect(result.metrics.find((metric) => metric.source === 'market')?.bets).toBe(0);
  });

  it('simulates unit-stake returns when source edge exceeds minEdge', () => {
    const result = engine.run([
      makeSnapshot({ marketId: 'm1', marketProb: 0.4, predictedProb: 0.7, finalProb: 0.7, resolvedPrice: 1 }),
      makeSnapshot({ marketId: 'm2', marketProb: 0.6, predictedProb: 0.3, finalProb: 0.3, resolvedPrice: 0 }),
    ], { minEdge: 0.05 });

    const model = result.metrics.find((metric) => metric.source === 'prediction_model');

    expect(model?.bets).toBe(2);
    expect(model?.wins).toBe(2);
    expect(model?.totalPnl).toBeGreaterThan(1);
    expect(model?.roi).toBeGreaterThan(0);
  });

  it('returns current weight as suggestion when sample is too small', () => {
    const result = engine.run([
      makeSnapshot({ predictedProb: 0.8, resolvedPrice: 1 }),
    ], {
      tuningConfig: {
        sourceWeights: {
          prediction_model: 1.4,
        },
      },
    });

    const model = result.metrics.find((metric) => metric.source === 'prediction_model');

    expect(model?.currentWeight).toBe(1.4);
    expect(model?.suggestedWeight).toBe(1.4);
  });
});
