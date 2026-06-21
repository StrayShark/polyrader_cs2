import { describe, it, expect } from 'vitest';
import { SignalComparisonEngine } from './signal-comparison-engine';

describe('SignalComparisonEngine', () => {
  const engine = new SignalComparisonEngine();

  it('should compare signals from multiple sources', () => {
    const result = engine.compareSignals('market-1', 0.55, 0.62, 0.58);

    expect(result.marketId).toBe('market-1');
    expect(result.polymarketProb).toBe(0.55);
    expect(result.predictedProb).toBe(0.62);
    expect(result.signals).toHaveLength(3); // polymarket + model + hltv
  });

  it('should calculate deviation correctly', () => {
    const result = engine.compareSignals('m1', 0.5, 0.7);

    expect(result.deviation).toBeCloseTo(0.2, 2);
  });

  it('should detect arbitrage opportunities', () => {
    const result = engine.compareSignals('m1', 0.4, 0.65);

    // Difference > 10% should trigger arbitrage
    expect(result.arbitrageOpportunity).toBe(true);
  });

  it('should not detect arbitrage for small differences', () => {
    const result = engine.compareSignals('m1', 0.5, 0.55);

    expect(result.arbitrageOpportunity).toBe(false);
  });

  it('should rank by deviation', () => {
    const comparisons = [
      engine.compareSignals('m1', 0.5, 0.52),
      engine.compareSignals('m2', 0.5, 0.7),
      engine.compareSignals('m3', 0.5, 0.6),
    ];

    const ranked = engine.rankByDeviation(comparisons);

    expect(ranked[0].marketId).toBe('m2');
    expect(ranked[2].marketId).toBe('m1');
  });

  it('should filter significant deviations', () => {
    const comparisons = [
      engine.compareSignals('m1', 0.5, 0.51),
      engine.compareSignals('m2', 0.5, 0.65),
    ];

    const significant = engine.getSignificantDeviations(comparisons, 0.05);

    expect(significant).toHaveLength(1);
    expect(significant[0].marketId).toBe('m2');
  });

  it('should calculate accuracy', () => {
    const predictions = [
      { predicted: 0.7, actual: 1 },
      { predicted: 0.6, actual: 1 },
      { predicted: 0.4, actual: 0 },
      { predicted: 0.8, actual: 0 },
    ];

    const accuracy = engine.calculateAccuracy(predictions);

    // 3 correct out of 4
    expect(accuracy).toBe(0.75);
  });

  it('should calculate Brier score', () => {
    const predictions = [
      { predicted: 0.7, actual: 1 },
      { predicted: 0.3, actual: 0 },
    ];

    const brier = engine.calculateBrierScore(predictions);

    // (0.7-1)^2 + (0.3-0)^2 = 0.09 + 0.09 = 0.18 / 2 = 0.09
    expect(brier).toBeCloseTo(0.09, 2);
  });
});
