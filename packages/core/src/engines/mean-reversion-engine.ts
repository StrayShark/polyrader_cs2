/**
 * MeanReversionEngine — Detect overreaction and mean reversion opportunities
 *
 * Based on behavioral finance theory: markets often overreact to news/events,
 * creating price dislocations that tend to revert to the statistical mean.
 *
 * Methodology:
 *   1. Compute rolling mean and standard deviation of recent prices
 *   2. Calculate Z-Score: (current - mean) / stdDev
 *   3. |Z| > threshold → overreaction detected
 *   4. Reversion target = rolling mean
 *
 * This engine is purely quantitative — no external data beyond price history.
 */
export interface PricePoint {
  timestamp: string;
  price: number;
}

export interface MeanReversionResult {
  currentPrice: number;
  rollingMean: number;
  stdDev: number;
  zScore: number;
  isOverreacted: boolean;
  direction: 'overbought' | 'oversold' | 'neutral';
  reversionTarget: number;
  deviationPct: number;
  windowSize: number;
}

export class MeanReversionEngine {
  private readonly defaultWindow: number;
  private readonly zThreshold: number;

  constructor(windowSize = 20, zThreshold = 2.0) {
    this.defaultWindow = windowSize;
    this.zThreshold = zThreshold;
  }

  /**
   * Analyze a price series for overreaction signals.
   *
   * @param prices Chronological price points (oldest first)
   * @param window Rolling window size (default 20)
   * @returns Mean reversion analysis result
   */
  analyze(prices: PricePoint[], window?: number): MeanReversionResult {
    const w = Math.min(window ?? this.defaultWindow, prices.length);
    const n = prices.length;

    if (n < 3) {
      const current = prices[n - 1]?.price ?? 0.5;
      return {
        currentPrice: current,
        rollingMean: current,
        stdDev: 0,
        zScore: 0,
        isOverreacted: false,
        direction: 'neutral',
        reversionTarget: current,
        deviationPct: 0,
        windowSize: n,
      };
    }

    const currentPrice = prices[n - 1].price;
    const windowPrices = prices.slice(n - w).map((p) => p.price);

    const mean = windowPrices.reduce((a, b) => a + b, 0) / w;
    const variance = windowPrices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / w;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;
    const isOverreacted = Math.abs(zScore) > this.zThreshold;

    // For probability markets (0-1), oversold means price too high (overbought in traditional terms)
    // because "Yes" price = probability. High z-score = price above mean = market overconfident.
    // We use: z > threshold → overbought (price too high), z < -threshold → oversold (price too low)
    const correctedDirection: MeanReversionResult['direction'] =
      zScore > this.zThreshold ? 'overbought' : zScore < -this.zThreshold ? 'oversold' : 'neutral';

    const deviationPct = mean > 0 ? ((currentPrice - mean) / mean) * 100 : 0;

    return {
      currentPrice: Math.round(currentPrice * 10000) / 10000,
      rollingMean: Math.round(mean * 10000) / 10000,
      stdDev: Math.round(stdDev * 10000) / 10000,
      zScore: Math.round(zScore * 100) / 100,
      isOverreacted,
      direction: correctedDirection,
      reversionTarget: Math.round(mean * 10000) / 10000,
      deviationPct: Math.round(deviationPct * 100) / 100,
      windowSize: w,
    };
  }
}
