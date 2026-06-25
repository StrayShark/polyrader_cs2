import type {
  DebateInferenceResult,
  MarketBehaviorResult,
  SignalComparison,
  SignalSource,
  SignalSourceWeights,
  SignalTuningConfigInput,
} from '../types/index';
import { mergeSignalTuningConfig } from '../scoring/weights';

/**
 * SignalComparisonEngine — Multi-source signal comparison and deviation analysis
 *
 * Compares signals from:
 *   - Polymarket market price
 *   - Internal prediction model
 *   - HLTV community vote (Pick a winner)
 */
export class SignalComparisonEngine {
  /**
   * Compare signals from multiple sources for a given market.
   */
  compareSignals(
    marketId: string,
    polymarketProb: number,
    predictedProb: number,
    hltvCommunityProb?: number,
    extraSignals: SignalSource[] = [],
    context?: {
      marketBehavior?: MarketBehaviorResult;
      aiDebate?: DebateInferenceResult;
      tuningConfig?: SignalTuningConfigInput;
    },
  ): SignalComparison {
    const tuningConfig = mergeSignalTuningConfig(context?.tuningConfig);
    const now = new Date().toISOString();
    const signals: SignalSource[] = [
      {
        source: 'polymarket',
        probability: polymarketProb,
        confidence: 0.8,
        lastUpdated: now,
      },
      {
        source: 'prediction_model',
        probability: predictedProb,
        confidence: 0.7,
        lastUpdated: now,
      },
    ];

    if (hltvCommunityProb !== undefined) {
      signals.push({
        source: 'hltv_odds',
        probability: hltvCommunityProb,
        confidence: 0.65,
        lastUpdated: now,
      });
    }

    signals.push(...extraSignals);

    const final = this.calculateFinalProbability(signals, tuningConfig.sourceWeights);
    const edge = final.probability - polymarketProb;
    const bubbleScore = context?.marketBehavior?.bubbleScore ?? 0;
    const riskAdjustedEdge = edge * final.confidence * (1 - bubbleScore * tuningConfig.recommendation.bubbleRiskPenalty);
    const recommendation = this.recommend(edge, final.confidence, bubbleScore, tuningConfig.recommendation);
    const deviation = Math.abs(edge);
    const arbitrageOpportunity = this.detectArbitrage(signals);

    return {
      marketId,
      polymarketProb,
      predictedProb,
      finalProb: final.probability,
      finalConfidence: final.confidence,
      edge,
      riskAdjustedEdge,
      recommendation,
      deviation,
      signals,
      marketBehavior: context?.marketBehavior,
      aiDebate: context?.aiDebate,
      arbitrageOpportunity,
    };
  }

  private calculateFinalProbability(
    signals: SignalSource[],
    sourceWeights: SignalSourceWeights,
  ): { probability: number; confidence: number } {
    const predictiveSignals = signals.filter((s) => s.source !== 'polymarket');
    if (predictiveSignals.length === 0) {
      const pm = signals.find((s) => s.source === 'polymarket');
      return { probability: pm?.probability ?? 0.5, confidence: pm?.confidence ?? 0.1 };
    }

    let totalWeight = 0;
    let weightedProb = 0;
    for (const signal of predictiveSignals) {
      const confidence = this.clamp(signal.confidence, 0.01, 1);
      const sourceWeight = sourceWeights[signal.source] ?? 0.5;
      const weight = confidence * sourceWeight;
      totalWeight += weight;
      weightedProb += this.clamp(signal.probability, 0.01, 0.99) * weight;
    }

    const probability = totalWeight > 0 ? weightedProb / totalWeight : 0.5;
    const confidence = Math.min(0.95, totalWeight / predictiveSignals.length);
    return {
      probability: this.round4(probability),
      confidence: this.round4(confidence),
    };
  }

  private recommend(
    edge: number,
    confidence: number,
    bubbleScore: number,
    config: {
      minEdge: number;
      bubbleMinEdge: number;
      minConfidence: number;
    },
  ): SignalComparison['recommendation'] {
    const minEdge = bubbleScore >= 0.6 ? config.bubbleMinEdge : config.minEdge;
    if (confidence < config.minConfidence || Math.abs(edge) < minEdge) return 'skip';
    return edge > 0 ? 'buy_yes' : 'buy_no';
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

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
