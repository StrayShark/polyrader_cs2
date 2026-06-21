import { describe, it, expect } from 'vitest';
import { StatsEngine } from './stats-engine';
import type { LLMProvider } from '../types/index';

describe('StatsEngine', () => {
  const engine = new StatsEngine();

  it('should calculate LLM stats', () => {
    const predictions = [
      { predictedProb: 0.7, actualOutcome: 1, profitLoss: 50 },
      { predictedProb: 0.6, actualOutcome: 1, profitLoss: 30 },
      { predictedProb: 0.8, actualOutcome: 0, profitLoss: -100 },
      { predictedProb: 0.55, actualOutcome: 1, profitLoss: 20 },
    ];

    const stats = engine.calculateLLMStats('openai', 'gpt-4o', predictions);

    expect(stats.totalPredictions).toBe(4);
    expect(stats.correctPredictions).toBe(3);
    expect(stats.accuracy).toBe(0.75);
    expect(stats.profitLoss).toBe(0); // 50+30-100+20 = 0
  });

  it('should calculate user stats', () => {
    const bets = [
      { result: 'won' as const, profitLoss: 50, provider: 'openai' as LLMProvider },
      { result: 'won' as const, profitLoss: 30, provider: 'openai' as LLMProvider },
      { result: 'lost' as const, profitLoss: -100, provider: 'anthropic' as LLMProvider },
      { result: 'pending' as const, profitLoss: 0, provider: 'google' as LLMProvider },
    ];

    const stats = engine.calculateUserStats(bets);

    expect(stats.totalBets).toBe(3); // pending excluded
    expect(stats.correctBets).toBe(2);
    expect(stats.accuracy).toBeCloseTo(2 / 3, 2);
    expect(stats.bestLLM).toBe('openai');
  });

  it('should calculate calibration data', () => {
    const predictions = [
      { confidence: 0.75, correct: true },
      { confidence: 0.75, correct: true },
      { confidence: 0.75, correct: false },
      { confidence: 0.25, correct: false },
      { confidence: 0.25, correct: true },
    ];

    const calibration = engine.calculateCalibration('openai', predictions);

    expect(calibration).toHaveLength(10); // 10 buckets

    const bucket70 = calibration.find((c) => c.confidenceBucket === 70)!;
    expect(bucket70.sampleCount).toBe(3);
    expect(bucket70.accuracy).toBeCloseTo(2 / 3, 2);
  });

  it('should rank providers by accuracy', () => {
    const stats = [
      { provider: 'openai' as LLMProvider, model: 'gpt-4o', totalPredictions: 10, correctPredictions: 7, accuracy: 0.7, averageConfidence: 0.75, calibrationError: 0.05, profitLoss: 100, roi: 0.1, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: '' },
      { provider: 'anthropic' as LLMProvider, model: 'claude', totalPredictions: 10, correctPredictions: 8, accuracy: 0.8, averageConfidence: 0.7, calibrationError: 0.03, profitLoss: 200, roi: 0.2, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: '' },
      { provider: 'google' as LLMProvider, model: 'gemini', totalPredictions: 10, correctPredictions: 5, accuracy: 0.5, averageConfidence: 0.8, calibrationError: 0.15, profitLoss: -50, roi: -0.05, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: '' },
    ];

    const ranked = engine.rankProviders(stats);

    expect(ranked[0].provider).toBe('anthropic');
    expect(ranked[2].provider).toBe('google');
  });

  it('should handle empty predictions', () => {
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', []);

    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.calibrationError).toBe(0);
  });
});

/**
 * Build a chronological series of settled predictions with the given PnL values.
 * Positive PnL → won (actualOutcome 1), negative → lost (actualOutcome 0).
 * settledAt timestamps increment by one day to preserve input order after sorting.
 */
function createSettledBets(
  pnlArray: number[],
): Array<{ predictedProb: number; actualOutcome: number; profitLoss: number; settledAt: string }> {
  const base = new Date('2024-01-01T00:00:00Z').getTime();
  return pnlArray.map((pnl, i) => ({
    predictedProb: 0.5,
    actualOutcome: pnl >= 0 ? 1 : 0,
    profitLoss: pnl,
    settledAt: new Date(base + i * 86_400_000).toISOString(),
  }));
}

describe('Sharpe ratio and max drawdown', () => {
  const engine = new StatsEngine();

  it('calculates Sharpe ratio correctly for consistent returns', () => {
    // All positive returns with low (non-zero) variance → high Sharpe
    const bets = createSettledBets([100, 105, 95, 102, 98]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.sharpeRatio).toBeGreaterThan(0);
  });

  it('returns 0 Sharpe ratio for single bet', () => {
    const bets = createSettledBets([100]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.sharpeRatio).toBe(0);
  });

  it('returns 0 Sharpe ratio when all returns are identical (zero variance)', () => {
    const bets = createSettledBets([50, 50, 50]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.sharpeRatio).toBe(0);
  });

  it('calculates max drawdown correctly', () => {
    // PnL: +100, -50, +200, -150 → cumulative: 100, 50, 250, 100
    // Peak at 250, trough at 100 → drawdown = 150/250 = 60%
    const bets = createSettledBets([100, -50, 200, -150]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.maxDrawdown).toBeCloseTo(60, 0);
  });

  it('returns 0 max drawdown for monotonically increasing PnL', () => {
    const bets = createSettledBets([100, 200, 300]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.maxDrawdown).toBe(0);
  });

  it('handles all-loss PnL series', () => {
    const bets = createSettledBets([-100, -200, -50]);
    const stats = engine.calculateLLMStats('openai', 'gpt-4o', bets);
    expect(stats.sharpeRatio).toBeLessThan(0);
    // peak is 0, drawdown is absolute
    expect(stats.maxDrawdown).toBeGreaterThan(0);
  });
});
