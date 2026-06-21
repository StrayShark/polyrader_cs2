import type { Whale, SuspiciousScore, WhaleTrade, CorrelationData } from '../types/index';
import { SUSPICIOUS_WEIGHTS } from '../scoring/weights';

/**
 * WhaleScoringEngine — 4-dimensional suspicious activity scoring
 *
 * Dimensions:
 *   1. Volume Anomaly (30%)    — Unusual trading volume
 *   2. Timing Anomaly (25%)    — Trades near market close/resolution
 *   3. Pattern Anomaly (25%)   — Wash trading, circular patterns
 *   4. Correlation Anomaly (20%)— Correlated with other suspicious addresses
 */
export class WhaleScoringEngine {
  private weights = SUSPICIOUS_WEIGHTS;

  scoreWhale(
    address: string,
    trades: WhaleTrade[],
    totalVolume: number,
    activePositions: number,
    winRate: number,
    pnl: number,
    correlationData?: CorrelationData,
  ): Whale {
    const volumeAnomaly = this.calculateVolumeAnomaly(trades, totalVolume);
    const timingAnomaly = this.calculateTimingAnomaly(trades);
    const patternAnomaly = this.calculatePatternAnomaly(trades);
    const correlationAnomaly = this.calculateCorrelationAnomaly(correlationData);

    const total =
      volumeAnomaly * this.weights.volumeAnomaly +
      timingAnomaly * this.weights.timingAnomaly +
      patternAnomaly * this.weights.patternAnomaly +
      correlationAnomaly * this.weights.correlationAnomaly;

    const suspiciousScore: SuspiciousScore = {
      total: Math.round(total * 100),
      volumeAnomaly: Math.round(volumeAnomaly * 100),
      timingAnomaly: Math.round(timingAnomaly * 100),
      patternAnomaly: Math.round(patternAnomaly * 100),
      correlationAnomaly: Math.round(correlationAnomaly * 100),
    };

    return {
      address,
      totalVolume,
      totalPositions: trades.length,
      activePositions,
      winRate,
      pnl,
      suspiciousScore,
      recentTrades: trades.slice(-20),
      lastActive: trades[trades.length - 1]?.timestamp ?? '',
    };
  }

  private calculateVolumeAnomaly(trades: WhaleTrade[], totalVolume: number): number {
    if (trades.length === 0) return 0;

    // Check for sudden volume spikes
    const recentVolume = trades.slice(-5).reduce((sum, t) => sum + t.amount, 0);
    const avgVolume = totalVolume / Math.max(1, trades.length);
    const spikeRatio = recentVolume / Math.max(1, avgVolume * 5);

    // Check for very large single trades
    const maxTrade = Math.max(...trades.map((t) => t.amount));
    const maxRatio = maxTrade / Math.max(1, avgVolume);

    return Math.min(1, (spikeRatio * 0.5 + maxRatio * 0.02));
  }

  private calculateTimingAnomaly(trades: WhaleTrade[]): number {
    if (trades.length === 0) return 0;

    // Check for trades clustered in short time windows
    const timestamps = trades.map((t) => new Date(t.timestamp).getTime()).sort();
    let clusterScore = 0;

    for (let i = 0; i < timestamps.length - 3; i++) {
      const window = timestamps[i + 3] - timestamps[i];
      if (window < 60000) clusterScore += 0.2; // 4 trades in 1 minute
      if (window < 300000) clusterScore += 0.1; // 4 trades in 5 minutes
    }

    return Math.min(1, clusterScore);
  }

  private calculatePatternAnomaly(trades: WhaleTrade[]): number {
    if (trades.length < 4) return 0;

    // Check for buy-sell-buy-sell patterns (potential wash trading)
    let patternScore = 0;
    for (let i = 1; i < trades.length; i++) {
      if (trades[i].type !== trades[i - 1].type) {
        patternScore += 0.05;
      }
    }

    // Check for same-amount trades
    const amounts = trades.map((t) => t.amount);
    const uniqueAmounts = new Set(amounts.map((a) => Math.round(a * 100)));
    if (uniqueAmounts.size < amounts.length * 0.3) {
      patternScore += 0.3;
    }

    return Math.min(1, patternScore);
  }

  /**
   * Calculate correlation anomaly based on cross-address trading overlap.
   *
   * Scoring logic:
   * - More correlated addresses → higher score (each adds ~0.1, capped at 0.5)
   * - High market overlap ratio amplifies the score (× overlap, up to 0.3)
   * - If correlated addresses are themselves suspicious, add up to 0.2
   *
   * Returns 0 when no correlation data is provided (backward compatible).
   */
  private calculateCorrelationAnomaly(data?: CorrelationData): number {
    if (!data || data.correlatedAddressCount === 0) return 0;

    // Base score: more correlated addresses = more suspicious
    const countScore = Math.min(0.5, data.correlatedAddressCount * 0.1);

    // Overlap amplification: high market overlap = stronger correlation
    const overlapScore = data.marketOverlapRatio * 0.3;

    // Suspicion propagation: if correlated addresses are also suspicious,
    // this address is likely part of a coordinated group
    const avgSuspicion = data.avgCorrelatedSuspicion / 100; // normalize 0-1
    const suspicionScore = avgSuspicion * 0.2;

    return Math.min(1, countScore + overlapScore + suspicionScore);
  }

  /**
   * Rank whales by suspicious score.
   */
  rankWhales(whales: Whale[]): Whale[] {
    return [...whales].sort((a, b) => b.suspiciousScore.total - a.suspiciousScore.total);
  }

  /**
   * Filter whales above a suspicious threshold.
   */
  getHighRiskWhales(whales: Whale[], threshold = 50): Whale[] {
    return whales.filter((w) => w.suspiciousScore.total >= threshold);
  }
}
