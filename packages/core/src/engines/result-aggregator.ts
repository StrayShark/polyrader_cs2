import type {
  LLMAnalysisResult,
  LLMAggregation,
  ConsensusResult,
  KellyAllocation,
  WinProbability,
  LLMStats,
} from '../types/index';
import { KELLY_FRACTION_CAP } from '../scoring/weights';

/**
 * ResultAggregator — Multi-LLM result aggregation with voting, weighting, and consensus detection.
 *
 * Process:
 *   1. Collect results from all LLM providers
 *   2. Weight by provider reliability (historical accuracy + calibration)
 *   3. Detect consensus level
 *   4. Calculate Kelly Criterion fund allocation
 */
export class ResultAggregator {
  /**
   * Compute provider weights from historical stats using calibration error.
   *
   * Weight = max(0.1, 1 - calibrationError * 2) * min(1, totalPredictions / 10)
   *
   * Providers with few predictions (< 10) get a discount to avoid over-weighting
   * lucky early guesses. Providers with high calibration error get penalized.
   * A floor of 0.1 ensures no provider is fully zeroed out.
   */
  static computeProviderWeights(stats: LLMStats[]): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const s of stats) {
      const calibrationPenalty = Math.max(0.1, 1 - s.calibrationError * 2);
      const sampleSizeFactor = Math.min(1, s.totalPredictions / 10);
      weights[s.provider] = calibrationPenalty * sampleSizeFactor;
    }
    return weights;
  }

  /**
   * Aggregate multiple LLM results into a single prediction.
   */
  aggregate(
    matchId: string,
    results: LLMAnalysisResult[],
    providerWeights?: Record<string, number>,
    marketProbA?: number,
  ): LLMAggregation {
    const validResults = results.filter((r) => !r.error);

    if (validResults.length === 0) {
      return this.emptyAggregation(matchId, results);
    }

    const consensus = this.detectConsensus(validResults);
    const aggregatedProbability = this.weightedAggregate(validResults, providerWeights);
    const kellyAllocation = this.calculateKelly(
      aggregatedProbability,
      validResults,
      consensus,
      marketProbA,
    );

    return {
      matchId,
      results,
      consensus,
      kellyAllocation,
      aggregatedProbability,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Weighted aggregation of LLM probabilities.
   */
  private weightedAggregate(
    results: LLMAnalysisResult[],
    providerWeights?: Record<string, number>,
  ): WinProbability {
    const defaultWeight = 1 / results.length;
    let totalWeight = 0;
    let weightedA = 0;

    for (const r of results) {
      const weight = providerWeights?.[r.provider] ?? defaultWeight;
      totalWeight += weight;
      weightedA += r.winProbability.teamA * weight;
    }

    const teamA = totalWeight > 0 ? weightedA / totalWeight : 0.5;

    return {
      teamA: Math.round(teamA * 10000) / 10000,
      teamB: Math.round((1 - teamA) * 10000) / 10000,
    };
  }

  /**
   * Detect consensus level among LLM results.
   */
  private detectConsensus(results: LLMAnalysisResult[]): ConsensusResult {
    const probs = results.map((r) => r.winProbability.teamA);
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const variance =
      probs.reduce((sum, p) => sum + (p - mean) ** 2, 0) / probs.length;
    const stdDev = Math.sqrt(variance);

    // Count how many agree on the winner
    const teamAPicks = probs.filter((p) => p > 0.5).length;
    const teamBPicks = probs.length - teamAPicks;
    const agreementRate = Math.max(teamAPicks, teamBPicks) / probs.length;

    let level: ConsensusResult['level'];
    if (agreementRate === 1 && stdDev < 0.05) {
      level = 'strong';
    } else if (agreementRate >= 0.75 && stdDev < 0.1) {
      level = 'moderate';
    } else if (agreementRate >= 0.5 && stdDev < 0.15) {
      level = 'weak';
    } else {
      level = 'divergent';
    }

    return {
      level,
      agreementRate: Math.round(agreementRate * 100) / 100,
      teamAAvgProb: Math.round(mean * 10000) / 10000,
      teamBAvgProb: Math.round((1 - mean) * 10000) / 10000,
      stdDev: Math.round(stdDev * 10000) / 10000,
      majorityPick: teamAPicks > teamBPicks ? 'team_a' : teamBPicks > teamAPicks ? 'team_b' : 'split',
    };
  }

  /**
   * Kelly Criterion fund allocation.
   *
   * Kelly formula: f* = (bp - q) / b
   *   where b = odds - 1, p = win probability, q = 1 - p
   *
   * We use fractional Kelly to reduce risk.
   */
  private calculateKelly(
    probability: WinProbability,
    results: LLMAnalysisResult[],
    consensus: ConsensusResult,
    marketProbA?: number,
  ): KellyAllocation {
    const avgConfidence = results.reduce((s, r) => s + r.confidence, 0) / results.length;

    // Only bet if consensus is strong enough
    if (consensus.level === 'divergent' || avgConfidence < 0.3) {
      return {
        teamAAllocation: 0,
        teamBAllocation: 0,
        recommendedBet: 'skip',
        kellyFraction: 0,
        bankrollFraction: 0,
      };
    }

    const bestProb = Math.max(probability.teamA, probability.teamB);
    const bestTeam = probability.teamA > probability.teamB ? 'team_a' : 'team_b';
    if (marketProbA === undefined || !Number.isFinite(marketProbA)) {
      return {
        teamAAllocation: 0,
        teamBAllocation: 0,
        recommendedBet: 'skip',
        kellyFraction: 0,
        bankrollFraction: 0,
      };
    }

    const marketProb = bestTeam === 'team_a' ? marketProbA : 1 - marketProbA;
    if (marketProb <= 0 || marketProb >= 1 || bestProb <= marketProb) {
      return {
        teamAAllocation: 0,
        teamBAllocation: 0,
        recommendedBet: 'skip',
        kellyFraction: 0,
        bankrollFraction: 0,
      };
    }

    // Use market odds as payout price. Model probability is p; market price
    // determines odds. This is the actual Kelly edge.
    const odds = 1 / marketProb;
    const b = odds - 1;
    const p = bestProb;
    const q = 1 - p;

    // Full Kelly
    const fullKelly = (b * p - q) / b;

    // Fractional Kelly (half Kelly for safety)
    const fractionalKelly = Math.max(0, fullKelly * 0.5);

    // Cap at KELLY_FRACTION_CAP of bankroll
    const cappedKelly = Math.min(fractionalKelly, KELLY_FRACTION_CAP);

    // Adjust by consensus agreement rate
    const adjustedKelly = cappedKelly * consensus.agreementRate * avgConfidence;

    return {
      teamAAllocation: bestTeam === 'team_a' ? Math.round(adjustedKelly * 10000) / 10000 : 0,
      teamBAllocation: bestTeam === 'team_b' ? Math.round(adjustedKelly * 10000) / 10000 : 0,
      recommendedBet: adjustedKelly > 0.01 ? bestTeam : 'skip',
      kellyFraction: Math.round(adjustedKelly * 10000) / 10000,
      bankrollFraction: Math.round(adjustedKelly * 100) / 100,
    };
  }

  private emptyAggregation(matchId: string, results: LLMAnalysisResult[]): LLMAggregation {
    return {
      matchId,
      results,
      consensus: {
        level: 'divergent',
        agreementRate: 0,
        teamAAvgProb: 0.5,
        teamBAvgProb: 0.5,
        stdDev: 0,
        majorityPick: 'split',
      },
      kellyAllocation: {
        teamAAllocation: 0,
        teamBAllocation: 0,
        recommendedBet: 'skip',
        kellyFraction: 0,
        bankrollFraction: 0,
      },
      aggregatedProbability: { teamA: 0.5, teamB: 0.5 },
      generatedAt: new Date().toISOString(),
    };
  }
}
