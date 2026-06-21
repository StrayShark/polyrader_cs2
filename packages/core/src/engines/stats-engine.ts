import type { LLMStats, UserStats, CalibrationPoint, LLMProvider } from '../types/index';

/**
 * StatsEngine — LLM and user betting statistics calculation.
 */
export class StatsEngine {
  /**
   * Calculate LLM provider statistics from historical predictions.
   */
  calculateLLMStats(
    provider: LLMProvider,
    model: string,
    predictions: Array<{
      predictedProb: number;
      actualOutcome: number; // 1 = correct winner, 0 = wrong
      profitLoss: number;
      settledAt?: string;
    }>,
  ): LLMStats {
    const totalPredictions = predictions.length;
    const correctPredictions = predictions.filter((p) => p.actualOutcome === 1).length;
    const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    const averageConfidence =
      totalPredictions > 0
        ? predictions.reduce((s, p) => s + p.predictedProb, 0) / totalPredictions
        : 0;
    const calibrationError = this.calculateCalibrationError(predictions);
    const profitLoss = predictions.reduce((s, p) => s + p.profitLoss, 0);
    const roi = profitLoss / Math.max(1, totalPredictions * 100); // assuming 100 USDC per bet

    // Build chronological PnL series from settled predictions for risk metrics
    const pnlSeries = predictions
      .filter((p) => p.settledAt !== undefined && p.settledAt !== null)
      .slice()
      .sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : a.settledAt! > b.settledAt! ? 1 : 0))
      .map((p) => p.profitLoss);
    const sharpeRatio = this.calculateSharpeRatio(pnlSeries);
    const maxDrawdown = this.calculateMaxDrawdown(pnlSeries);

    return {
      provider,
      model,
      totalPredictions,
      correctPredictions,
      accuracy: Math.round(accuracy * 10000) / 10000,
      averageConfidence: Math.round(averageConfidence * 10000) / 10000,
      calibrationError: Math.round(calibrationError * 10000) / 10000,
      profitLoss: Math.round(profitLoss * 100) / 100,
      roi: Math.round(roi * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Calculate user betting statistics.
   */
  calculateUserStats(
    bets: Array<{
      result: 'won' | 'lost' | 'pending';
      profitLoss: number;
      provider: LLMProvider;
      settledAt?: string;
    }>,
  ): UserStats {
    const settled = bets.filter((b) => b.result !== 'pending');
    const totalBets = settled.length;
    const correctBets = settled.filter((b) => b.result === 'won').length;
    const accuracy = totalBets > 0 ? correctBets / totalBets : 0;
    const totalProfitLoss = settled.reduce((s, b) => s + b.profitLoss, 0);
    const roi = totalProfitLoss / Math.max(1, totalBets * 100);

    // Find best performing LLM
    const providerStats = new Map<LLMProvider, { wins: number; total: number }>();
    for (const bet of settled) {
      const stat = providerStats.get(bet.provider) ?? { wins: 0, total: 0 };
      stat.total++;
      if (bet.result === 'won') stat.wins++;
      providerStats.set(bet.provider, stat);
    }

    let bestLLM: LLMProvider = 'openai';
    let bestRate = 0;
    for (const [provider, stat] of providerStats) {
      const rate = stat.total > 0 ? stat.wins / stat.total : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestLLM = provider;
      }
    }

    // Calculate streak
    let streak = 0;
    for (let i = settled.length - 1; i >= 0; i--) {
      if (settled[i].result === 'won') streak++;
      else break;
    }

    // Build chronological PnL series from settled bets for risk metrics
    const pnlSeries = settled
      .filter((b) => b.settledAt !== undefined && b.settledAt !== null)
      .slice()
      .sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : a.settledAt! > b.settledAt! ? 1 : 0))
      .map((b) => b.profitLoss);
    const sharpeRatio = this.calculateSharpeRatio(pnlSeries);
    const maxDrawdown = this.calculateMaxDrawdown(pnlSeries);

    return {
      totalBets,
      correctBets,
      accuracy: Math.round(accuracy * 10000) / 10000,
      totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
      roi: Math.round(roi * 10000) / 10000,
      averageKelly: 0, // populated by SimulatedBettingEngine
      bestLLM,
      streak,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    };
  }

  /**
   * Calculate calibration curve data points.
   * Groups predictions by confidence buckets and calculates actual accuracy per bucket.
   */
  calculateCalibration(
    provider: LLMProvider,
    predictions: Array<{
      confidence: number;
      correct: boolean;
    }>,
  ): CalibrationPoint[] {
    const buckets: Map<number, { count: number; correct: number }> = new Map();

    // Initialize buckets (0-10, 10-20, ..., 90-100)
    for (let i = 0; i < 10; i++) {
      buckets.set(i, { count: 0, correct: 0 });
    }

    for (const p of predictions) {
      const bucketIndex = Math.min(9, Math.floor(p.confidence * 10));
      const bucket = buckets.get(bucketIndex)!;
      bucket.count++;
      if (p.correct) bucket.correct++;
    }

    return Array.from(buckets.entries()).map(([bucketIndex, data]) => ({
      confidenceBucket: bucketIndex * 10,
      sampleCount: data.count,
      accuracy: data.count > 0 ? data.correct / data.count : 0,
      provider,
    }));
  }

  /**
   * Calculate Expected Calibration Error (ECE).
   */
  private calculateCalibrationError(
    predictions: Array<{
      predictedProb: number;
      actualOutcome: number;
    }>,
  ): number {
    if (predictions.length === 0) return 0;

    const numBuckets = 10;
    const buckets: Array<{ count: number; confSum: number; accSum: number }> = Array.from(
      { length: numBuckets },
      () => ({ count: 0, confSum: 0, accSum: 0 }),
    );

    for (const p of predictions) {
      const bucket = Math.min(numBuckets - 1, Math.floor(p.predictedProb * numBuckets));
      buckets[bucket].count++;
      buckets[bucket].confSum += p.predictedProb;
      buckets[bucket].accSum += p.actualOutcome;
    }

    let ece = 0;
    for (const bucket of buckets) {
      if (bucket.count === 0) continue;
      const avgConf = bucket.confSum / bucket.count;
      const avgAcc = bucket.accSum / bucket.count;
      ece += (bucket.count / predictions.length) * Math.abs(avgAcc - avgConf);
    }

    return ece;
  }

  /**
   * Calculate annualized Sharpe ratio from a PnL time series.
   * @param pnlSeries - Array of profit/loss values per settled bet, in chronological order
   * @returns Sharpe ratio (0 if insufficient data)
   */
  private calculateSharpeRatio(pnlSeries: number[]): number {
    if (pnlSeries.length < 2) return 0;

    const mean = pnlSeries.reduce((a, b) => a + b, 0) / pnlSeries.length;
    const variance = pnlSeries.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnlSeries.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize: assume ~252 trading days per year (CS2 matches happen frequently)
    // Each bet is one "trade", so annualization factor scales by sqrt(n)
    const annualizationFactor = Math.sqrt(252);
    return (mean / stdDev) * annualizationFactor;
  }

  /**
   * Calculate maximum drawdown from a cumulative PnL curve.
   * @param pnlSeries - Array of profit/loss values per settled bet, in chronological order
   * @returns Maximum drawdown as a positive percentage (0 if no drawdown)
   */
  private calculateMaxDrawdown(pnlSeries: number[]): number {
    if (pnlSeries.length === 0) return 0;

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const pnl of pnlSeries) {
      cumulative += pnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Return as percentage of peak (if peak > 0), otherwise absolute value
    return peak > 0 ? (maxDrawdown / peak) * 100 : maxDrawdown;
  }

  /**
   * Rank LLM providers by accuracy.
   */
  rankProviders(stats: LLMStats[]): LLMStats[] {
    return [...stats].sort((a, b) => b.accuracy - a.accuracy);
  }
}
