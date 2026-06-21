import type { Market, ScoredMatch, DailyDashboard, DeviationAlert, WhaleAlert } from '../types/index';
import { ATTENTION_WEIGHTS } from '../scoring/weights';

/**
 * DailyDashboardEngine — Automatic match scanning and attention scoring
 *
 * Scores each match on 5 dimensions:
 *   1. Confidence (30%)  — Prediction confidence
 *   2. Deviation (25%)   — Market vs model deviation
 *   3. Volume (20%)      — 24h trading volume
 *   4. Whale (15%)       — Whale activity
 *   5. Tier (10%)        — Match tier/importance
 */
export class DailyDashboardEngine {
  private weights = ATTENTION_WEIGHTS;

  generateDashboard(
    date: string,
    markets: Market[],
    deviations: DeviationAlert[],
    whaleAlerts: WhaleAlert[],
  ): DailyDashboard {
    const scoredMatches = markets.map((market) =>
      this.scoreMatch(market, deviations, whaleAlerts),
    );

    const sorted = [...scoredMatches].sort(
      (a, b) => b.attentionScore - a.attentionScore,
    );

    const highAttention = sorted.filter((m) => m.attentionScore >= 60);

    return {
      date,
      totalMatches: markets.length,
      analyzedMatches: markets.filter((m) => m.match !== undefined && deviations.some(d => d.marketId === m.conditionId)).length,
      highAttentionMatches: highAttention.slice(0, 10),
      allMatches: sorted,
      topDeviations: this.getTopDeviations(deviations, 5),
      whaleAlerts: this.getTopWhaleAlerts(whaleAlerts, 5),
      generatedAt: new Date().toISOString(),
    };
  }

  private scoreMatch(
    market: Market,
    deviations: DeviationAlert[],
    whaleAlerts: WhaleAlert[],
  ): ScoredMatch {
    const deviation = deviations.find((d) => d.marketId === market.conditionId);
    const confidenceScore = this.calculateConfidenceScore(market, deviation?.predictedProb);
    const deviationScore = this.calculateDeviationScore(market, deviations);
    const volumeScore = this.calculateVolumeScore(market);
    const whaleScore = this.calculateWhaleScore(market, whaleAlerts);
    const tierScore = this.calculateTierScore(market);

    const attentionScore =
      confidenceScore * this.weights.confidence +
      deviationScore * this.weights.deviation +
      volumeScore * this.weights.volume +
      whaleScore * this.weights.whale +
      tierScore * this.weights.tier;

    return {
      market,
      attentionScore: Math.round(attentionScore),
      confidenceScore: Math.round(confidenceScore),
      deviationScore: Math.round(deviationScore),
      volumeScore: Math.round(volumeScore),
      whaleScore: Math.round(whaleScore),
      tierScore: Math.round(tierScore),
      recommendation:
        attentionScore >= 70 ? 'high' : attentionScore >= 40 ? 'medium' : 'low',
    };
  }

  private calculateConfidenceScore(market: Market, predictedProb?: number): number {
    // When a prediction is available, confidence reflects how decisive the
    // prediction is (further from 0.5 = higher confidence).
    if (predictedProb !== undefined) {
      return Math.abs(predictedProb - 0.5) * 2 * 100;
    }
    // Fall back to volume + liquidity proxy when no prediction is available
    const volumeScore = Math.min(100, market.volume24h / 1000);
    const liquidityScore = Math.min(100, market.liquidity / 500);
    return (volumeScore * 0.6 + liquidityScore * 0.4);
  }

  private calculateDeviationScore(
    market: Market,
    deviations: DeviationAlert[],
  ): number {
    const deviation = deviations.find((d) => d.marketId === market.conditionId);
    if (!deviation) return 0;
    return Math.min(100, deviation.deviation * 500); // 20% deviation = 100 score
  }

  private calculateVolumeScore(market: Market): number {
    // Logarithmic scale for volume
    return Math.min(100, Math.log10(market.volume24h + 1) * 20);
  }

  private calculateWhaleScore(
    market: Market,
    whaleAlerts: WhaleAlert[],
  ): number {
    const alerts = whaleAlerts.filter((a) => a.marketId === market.conditionId);
    if (alerts.length === 0) return 0;

    const totalAmount = alerts.reduce((sum, a) => sum + a.amount, 0);
    const suspiciousScore = Math.max(...alerts.map((a) => a.suspiciousScore));

    return Math.min(100, (Math.log10(totalAmount + 1) * 15 + suspiciousScore * 0.5));
  }

  private calculateTierScore(market: Market): number {
    if (!market.match) return 20;

    const tierMap: Record<string, number> = {
      LAN: 100,
      Online: 60,
    };

    const formatMap: Record<string, number> = {
      BO5: 100,
      BO3: 80,
      BO1: 40,
    };

    const eventScore = tierMap[market.match.eventType] ?? 50;
    const formatScore = formatMap[market.match.format] ?? 50;

    return (eventScore + formatScore) / 2;
  }

  private getTopDeviations(deviations: DeviationAlert[], limit: number): DeviationAlert[] {
    return [...deviations]
      .sort((a, b) => b.deviation - a.deviation)
      .slice(0, limit);
  }

  private getTopWhaleAlerts(alerts: WhaleAlert[], limit: number): WhaleAlert[] {
    return [...alerts]
      .sort((a, b) => b.suspiciousScore - a.suspiciousScore)
      .slice(0, limit);
  }
}
