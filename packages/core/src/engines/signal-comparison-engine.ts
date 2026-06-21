import type { SignalComparison, SignalSource } from '../types/index';

/**
 * SignalComparisonEngine — Multi-source signal comparison and deviation analysis
 *
 * Compares signals from:
 *   - Polymarket market price
 *   - Internal prediction model
 *   - HLTV community odds (if available)
 */
export class SignalComparisonEngine {
  /**
   * Compare signals from multiple sources for a given market.
   */
  compareSignals(
    marketId: string,
    polymarketProb: number,
    predictedProb: number,
    hltvProb?: number,
  ): SignalComparison {
    const signals: SignalSource[] = [
      {
        source: 'polymarket',
        probability: polymarketProb,
        confidence: 0.8,
        lastUpdated: new Date().toISOString(),
      },
      {
        source: 'prediction_model',
        probability: predictedProb,
        confidence: 0.7,
        lastUpdated: new Date().toISOString(),
      },
    ];

    if (hltvProb !== undefined) {
      signals.push({
        source: 'hltv_odds',
        probability: hltvProb,
        confidence: 0.5,
        lastUpdated: new Date().toISOString(),
      });
    }

    const deviation = this.calculateDeviation(signals);
    const arbitrageOpportunity = this.detectArbitrage(signals);

    return {
      marketId,
      polymarketProb,
      predictedProb,
      deviation,
      signals,
      arbitrageOpportunity,
    };
  }

  /**
   * Calculate the deviation between Polymarket price and model prediction.
   */
  private calculateDeviation(signals: SignalSource[]): number {
    const pm = signals.find((s) => s.source === 'polymarket');
    const model = signals.find((s) => s.source === 'prediction_model');
    if (!pm || !model) return 0;

    return Math.abs(pm.probability - model.probability);
  }

  /**
   * Detect if there's an arbitrage opportunity.
   * Arbitrage exists when different sources give significantly different probabilities.
   */
  private detectArbitrage(signals: SignalSource[]): boolean {
    if (signals.length < 2) return false;

    const probs = signals.map((s) => s.probability);
    const max = Math.max(...probs);
    const min = Math.min(...probs);

    // Arbitrage if difference > 10%
    return max - min > 0.1;
  }

  /**
   * Rank markets by signal deviation (largest deviation first).
   */
  rankByDeviation(comparisons: SignalComparison[]): SignalComparison[] {
    return [...comparisons].sort((a, b) => b.deviation - a.deviation);
  }

  /**
   * Get markets with significant deviation (> 5%).
   */
  getSignificantDeviations(comparisons: SignalComparison[], threshold = 0.05): SignalComparison[] {
    return comparisons.filter((c) => c.deviation > threshold);
  }

  /**
   * Calculate signal accuracy by comparing historical predictions to outcomes.
   */
  calculateAccuracy(predictions: { predicted: number; actual: number }[]): number {
    if (predictions.length === 0) return 0;

    let correct = 0;
    for (const p of predictions) {
      const predictedWinner = p.predicted > 0.5 ? 1 : 0;
      const actualWinner = p.actual > 0.5 ? 1 : 0;
      if (predictedWinner === actualWinner) correct++;
    }

    return correct / predictions.length;
  }

  /**
   * Calculate Brier score (lower is better, 0 = perfect).
   */
  calculateBrierScore(predictions: { predicted: number; actual: number }[]): number {
    if (predictions.length === 0) return 0;

    let sum = 0;
    for (const p of predictions) {
      sum += (p.predicted - p.actual) ** 2;
    }

    return sum / predictions.length;
  }
}
