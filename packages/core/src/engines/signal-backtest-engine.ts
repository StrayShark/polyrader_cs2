import type {
  SignalBacktestMetric,
  SignalBacktestSourceKind,
  SignalBacktestSummary,
  SignalCalibrationBucket,
  SignalSnapshot,
  SignalTuningConfig,
  SignalTuningConfigInput,
} from '../types/index';
import { mergeSignalTuningConfig } from '../scoring/weights';

interface ResolvedSignalPoint {
  snapshot: SignalSnapshot;
  actual: number;
}

interface SourcePoint {
  probability: number;
  actual: number;
  marketProb: number;
  createdAt: string;
}

const BACKTEST_SOURCES: Array<{ source: SignalBacktestSourceKind; label: string }> = [
  { source: 'market', label: 'Market Price' },
  { source: 'prediction_model', label: 'Model' },
  { source: 'market_behavior', label: 'Behavior' },
  { source: 'ai_debate', label: 'AI Debate' },
  { source: 'final', label: 'Final Blend' },
];

/**
 * Replays resolved signal snapshots to compare calibration and simple unit
 * staking returns across market, model, behavior, AI debate, and final blend.
 */
export class SignalBacktestEngine {
  run(
    snapshots: SignalSnapshot[],
    options: {
      minEdge?: number;
      tuningConfig?: SignalTuningConfigInput;
    } = {},
  ): SignalBacktestSummary {
    const tuningConfig = mergeSignalTuningConfig(options.tuningConfig);
    const minEdge = clamp(options.minEdge ?? tuningConfig.recommendation.minEdge, 0, 0.5);
    const resolved = snapshots
      .map((snapshot) => this.toResolvedPoint(snapshot))
      .filter((point): point is ResolvedSignalPoint => point !== null)
      .sort((a, b) => a.snapshot.createdAt.localeCompare(b.snapshot.createdAt));

    const metrics = BACKTEST_SOURCES.map(({ source, label }) => this.calculateMetric(
      source,
      label,
      resolved,
      minEdge,
      tuningConfig,
    ));

    const scoredBrier = metrics.filter((metric) => metric.sampleSize > 0);
    const scoredRoi = metrics.filter((metric) => metric.bets > 0);
    const bestBrierSource = scoredBrier
      .slice()
      .sort((a, b) => a.brierScore - b.brierScore)[0]?.source;
    const bestRoiSource = scoredRoi
      .slice()
      .sort((a, b) => b.roi - a.roi)[0]?.source;

    return {
      sampleSize: resolved.length,
      resolvedMarkets: new Set(resolved.map((point) => point.snapshot.marketId)).size,
      startDate: resolved[0]?.snapshot.createdAt,
      endDate: resolved[resolved.length - 1]?.snapshot.createdAt,
      minEdge,
      metrics,
      bestBrierSource,
      bestRoiSource,
      generatedAt: new Date().toISOString(),
      tuningConfig,
    };
  }

  private calculateMetric(
    source: SignalBacktestSourceKind,
    label: string,
    resolved: ResolvedSignalPoint[],
    minEdge: number,
    tuningConfig: SignalTuningConfig,
  ): SignalBacktestMetric {
    const points = resolved
      .map((point) => this.toSourcePoint(point, source))
      .filter((point): point is SourcePoint => point !== null);

    if (points.length === 0) {
      return {
        source,
        label,
        sampleSize: 0,
        brierScore: 0,
        accuracy: 0,
        calibrationError: 0,
        avgPredicted: 0,
        actualRate: 0,
        bets: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        roi: 0,
        maxDrawdown: 0,
        avgEdge: 0,
        currentWeight: this.currentWeight(source, tuningConfig),
        suggestedWeight: undefined,
        buckets: [],
      };
    }

    const brierScore = average(points.map((point) => (point.probability - point.actual) ** 2));
    const accuracy = average(points.map((point) => (
      (point.probability >= 0.5) === (point.actual >= 0.5) ? 1 : 0
    )));
    const avgPredicted = average(points.map((point) => point.probability));
    const actualRate = average(points.map((point) => point.actual));
    const avgEdge = average(points.map((point) => point.probability - point.marketProb));
    const buckets = this.buildBuckets(points);
    const calibrationError = this.calculateCalibrationError(buckets);
    const returns = this.calculateReturns(points, source, minEdge);
    const currentWeight = this.currentWeight(source, tuningConfig);

    return {
      source,
      label,
      sampleSize: points.length,
      brierScore: round4(brierScore),
      accuracy: round4(accuracy),
      calibrationError: round4(calibrationError),
      avgPredicted: round4(avgPredicted),
      actualRate: round4(actualRate),
      bets: returns.bets,
      wins: returns.wins,
      losses: returns.losses,
      totalPnl: round4(returns.totalPnl),
      roi: round4(returns.roi),
      maxDrawdown: round4(returns.maxDrawdown),
      avgEdge: round4(avgEdge),
      currentWeight,
      suggestedWeight: currentWeight === undefined
        ? undefined
        : round4(this.suggestWeight(currentWeight, points.length, brierScore, returns.roi, accuracy)),
      buckets,
    };
  }

  private toResolvedPoint(snapshot: SignalSnapshot): ResolvedSignalPoint | null {
    const actual = this.resolveActual(snapshot);
    if (actual === undefined) return null;
    return { snapshot, actual };
  }

  private resolveActual(snapshot: SignalSnapshot): number | undefined {
    if (snapshot.resolvedPrice !== undefined && Number.isFinite(snapshot.resolvedPrice)) {
      return clamp(snapshot.resolvedPrice, 0, 1);
    }

    const outcome = snapshot.resolvedOutcome?.trim().toLowerCase();
    if (!outcome) return undefined;
    if (['yes', 'true', 'team a', 'team_a', 'a', 'win', 'won'].includes(outcome)) return 1;
    if (['no', 'false', 'team b', 'team_b', 'b', 'loss', 'lost'].includes(outcome)) return 0;
    return undefined;
  }

  private toSourcePoint(
    point: ResolvedSignalPoint,
    source: SignalBacktestSourceKind,
  ): SourcePoint | null {
    const probability = this.getProbability(point.snapshot, source);
    if (probability === undefined) return null;
    return {
      probability: clamp(probability, 0.01, 0.99),
      actual: point.actual,
      marketProb: clamp(point.snapshot.marketProb, 0.01, 0.99),
      createdAt: point.snapshot.createdAt,
    };
  }

  private getProbability(
    snapshot: SignalSnapshot,
    source: SignalBacktestSourceKind,
  ): number | undefined {
    switch (source) {
      case 'market':
        return snapshot.marketProb;
      case 'prediction_model':
        return snapshot.predictedProb;
      case 'market_behavior':
        return snapshot.behaviorProb ?? snapshot.marketBehavior?.probability;
      case 'ai_debate':
        return snapshot.aiDebateProb ?? snapshot.aiDebate?.calibratedProbability;
      case 'final':
        return snapshot.finalProb;
      default:
        return undefined;
    }
  }

  private calculateReturns(
    points: SourcePoint[],
    source: SignalBacktestSourceKind,
    minEdge: number,
  ): {
    bets: number;
    wins: number;
    losses: number;
    totalPnl: number;
    roi: number;
    maxDrawdown: number;
  } {
    if (source === 'market') {
      return { bets: 0, wins: 0, losses: 0, totalPnl: 0, roi: 0, maxDrawdown: 0 };
    }

    let bets = 0;
    let wins = 0;
    let losses = 0;
    let totalPnl = 0;
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const point of points) {
      const edge = point.probability - point.marketProb;
      if (Math.abs(edge) < minEdge) continue;

      const buyYes = edge > 0;
      const win = buyYes ? point.actual >= 0.5 : point.actual < 0.5;
      const sideMarketProb = buyYes ? point.marketProb : 1 - point.marketProb;
      const odds = 1 / clamp(sideMarketProb, 0.01, 0.99);
      const pnl = win ? odds - 1 : -1;

      bets += 1;
      if (win) wins += 1;
      else losses += 1;
      totalPnl += pnl;
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }

    return {
      bets,
      wins,
      losses,
      totalPnl,
      roi: bets > 0 ? totalPnl / bets : 0,
      maxDrawdown,
    };
  }

  private buildBuckets(points: SourcePoint[]): SignalCalibrationBucket[] {
    const buckets: SignalCalibrationBucket[] = [];
    for (let index = 0; index < 5; index += 1) {
      const lowerBound = index * 0.2;
      const upperBound = index === 4 ? 1 : lowerBound + 0.2;
      const bucketPoints = points.filter((point) => (
        index === 4
          ? point.probability >= lowerBound && point.probability <= upperBound
          : point.probability >= lowerBound && point.probability < upperBound
      ));
      buckets.push({
        lowerBound,
        upperBound,
        count: bucketPoints.length,
        avgPredicted: round4(average(bucketPoints.map((point) => point.probability))),
        actualRate: round4(average(bucketPoints.map((point) => point.actual))),
        brierScore: round4(average(bucketPoints.map((point) => (point.probability - point.actual) ** 2))),
      });
    }
    return buckets;
  }

  private calculateCalibrationError(buckets: SignalCalibrationBucket[]): number {
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    if (total <= 0) return 0;
    return buckets.reduce((sum, bucket) => (
      sum + Math.abs(bucket.avgPredicted - bucket.actualRate) * bucket.count
    ), 0) / total;
  }

  private currentWeight(source: SignalBacktestSourceKind, tuningConfig: SignalTuningConfig): number | undefined {
    switch (source) {
      case 'market':
        return tuningConfig.sourceWeights.polymarket;
      case 'prediction_model':
        return tuningConfig.sourceWeights.prediction_model;
      case 'market_behavior':
        return tuningConfig.sourceWeights.market_behavior;
      case 'ai_debate':
        return tuningConfig.sourceWeights.ai_debate;
      case 'final':
        return undefined;
      default:
        return undefined;
    }
  }

  private suggestWeight(
    currentWeight: number,
    sampleSize: number,
    brierScore: number,
    roi: number,
    accuracy: number,
  ): number {
    if (sampleSize < 5) return currentWeight;
    const brierFactor = clamp((0.25 - brierScore) / 0.18, -0.5, 1.25);
    const roiFactor = clamp(roi, -0.5, 0.75) * 0.35;
    const accuracyFactor = clamp(accuracy - 0.5, -0.3, 0.3);
    const multiplier = clamp(0.85 + brierFactor * 0.35 + roiFactor + accuracyFactor, 0.25, 1.75);
    return Math.max(0, currentWeight * multiplier);
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
