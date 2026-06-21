import type { Team, MatchInfo, Prediction, WinProbability, FactorBreakdown, FactorScore, BetRecommendation, LineupAnalysis } from '../types/index';
import { FACTOR_WEIGHTS } from '../scoring/weights';
import { LineupEngine } from './lineup-engine';

/**
 * PredictionEngine — 6-factor weighted prediction model
 *
 * Factors:
 *   1. HLTV Rank (20%)       — Elo-based ranking difference
 *   2. Recent Form (15%)     — Last 10 match performance
 *   3. Lineup (20%)          — Starting roster strength (NEW)
 *   4. Map Pool (15%)        — Map-specific win rates
 *   5. Head-to-Head (10%)    — Historical matchup results
 *   6. Market Sentiment (20%)— Polymarket price signal
 */
export class PredictionEngine {
  private weights = FACTOR_WEIGHTS;
  private lineupEngine = new LineupEngine();

  predict(
    match: MatchInfo,
    teamA: Team,
    teamB: Team,
    marketProbA?: number,
  ): Prediction {
    const factors = this.calculateFactors(teamA, teamB, match, marketProbA);
    const winProbability = this.aggregateFactors(factors);
    const confidence = this.calculateConfidence(factors);
    const recommendation = this.generateRecommendation(winProbability, factors, confidence);
    const lineupAnalysis = this.buildLineupAnalysis(match);

    return {
      matchId: match.matchId,
      teamA: teamA.name,
      teamB: teamB.name,
      winProbability,
      factors,
      confidence,
      recommendation,
      lineupAnalysis,
      generatedAt: new Date().toISOString(),
    };
  }

  private calculateFactors(
    teamA: Team,
    teamB: Team,
    match: MatchInfo,
    marketProbA?: number,
  ): FactorBreakdown {
    return {
      hltvRank: this.calculateHltvRankFactor(teamA, teamB),
      recentForm: this.calculateRecentFormFactor(teamA, teamB),
      lineup: this.calculateLineupFactor(match),
      mapPool: this.calculateMapPoolFactor(teamA, teamB, match.maps),
      headToHead: this.calculateHeadToHeadFactor(teamA, teamB),
      marketSentiment: this.calculateMarketSentimentFactor(marketProbA),
    };
  }

  // Factor 1: HLTV Rank (20%)
  private calculateHltvRankFactor(teamA: Team, teamB: Team): FactorScore {
    const rankDiff = teamB.rank - teamA.rank;
    const maxRankDiff = 50;
    const normalizedDiff = Math.max(-1, Math.min(1, rankDiff / maxRankDiff));
    const rawScore = (normalizedDiff + 1) / 2;

    return {
      weight: this.weights.hltvRank,
      rawScore,
      weightedScore: rawScore * this.weights.hltvRank,
      teamA: rawScore,
      teamB: 1 - rawScore,
      confidence: this.rankConfidence(Math.abs(rankDiff)),
    };
  }

  // Factor 2: Recent Form (15%)
  private calculateRecentFormFactor(teamA: Team, teamB: Team): FactorScore {
    const scoreA = this.formScore(teamA.recentForm);
    const scoreB = this.formScore(teamB.recentForm);
    const total = scoreA + scoreB || 1;
    const rawScore = scoreA / total;

    return {
      weight: this.weights.recentForm,
      rawScore,
      weightedScore: rawScore * this.weights.recentForm,
      teamA: rawScore,
      teamB: 1 - rawScore,
      confidence: 0.7,
    };
  }

  private formScore(form: Team['recentForm']): number {
    const winPoints = form.winRate * 60;
    const streakBonus = Math.max(-10, Math.min(10, form.streak * 2));
    const ratingBonus = (form.averageRating - 1.0) * 30;
    return Math.max(0, winPoints + streakBonus + ratingBonus);
  }

  // Factor 3: Lineup (20%) — NEW
  private calculateLineupFactor(match: MatchInfo): FactorScore {
    if (!match.lineups) {
      // No lineup data — neutral contribution
      return {
        weight: this.weights.lineup,
        rawScore: 0.5,
        weightedScore: 0.5 * this.weights.lineup,
        teamA: 0.5,
        teamB: 0.5,
        confidence: 0.1,
      };
    }

    const rawScore = this.lineupEngine.calculateLineupFactor(
      match.lineups.teamA,
      match.lineups.teamB,
    );

    // Confidence based on lineup confirmation
    const bothConfirmed = match.lineups.teamA.isConfirmed && match.lineups.teamB.isConfirmed;
    const confidence = bothConfirmed ? 0.8 : 0.4;

    return {
      weight: this.weights.lineup,
      rawScore,
      weightedScore: rawScore * this.weights.lineup,
      teamA: rawScore,
      teamB: 1 - rawScore,
      confidence,
    };
  }

  // Factor 4: Map Pool (15%)
  private calculateMapPoolFactor(teamA: Team, teamB: Team, matchMaps?: string[]): FactorScore {
    const maps = matchMaps && matchMaps.length > 0
      ? matchMaps
      : ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];

    let totalScoreA = 0;
    let totalScoreB = 0;

    for (const map of maps) {
      const statA = teamA.mapPool.maps.find((m) => m.map === map);
      const statB = teamB.mapPool.maps.find((m) => m.map === map);
      totalScoreA += statA?.winRate ?? 0.5;
      totalScoreB += statB?.winRate ?? 0.5;
    }

    const total = totalScoreA + totalScoreB || 1;
    const rawScore = totalScoreA / total;

    return {
      weight: this.weights.mapPool,
      rawScore,
      weightedScore: rawScore * this.weights.mapPool,
      teamA: rawScore,
      teamB: 1 - rawScore,
      confidence: 0.65,
    };
  }

  // Factor 5: Head-to-Head (10%)
  private calculateHeadToHeadFactor(teamA: Team, teamB: Team): FactorScore {
    const h2h = teamA.headToHead.find((h) => h.opponent === teamB.teamId);
    if (!h2h || h2h.matchesPlayed === 0) {
      return {
        weight: this.weights.headToHead,
        rawScore: 0.5,
        weightedScore: 0.5 * this.weights.headToHead,
        teamA: 0.5,
        teamB: 0.5,
        confidence: 0.1,
      };
    }

    const rawScore = h2h.wins / h2h.matchesPlayed;
    const confidence = Math.min(0.8, h2h.matchesPlayed / 10);

    return {
      weight: this.weights.headToHead,
      rawScore,
      weightedScore: rawScore * this.weights.headToHead,
      teamA: rawScore,
      teamB: 1 - rawScore,
      confidence,
    };
  }

  // Factor 6: Market Sentiment (20%)
  private calculateMarketSentimentFactor(marketProbA?: number): FactorScore {
    const prob = marketProbA ?? 0.5;

    return {
      weight: this.weights.marketSentiment,
      rawScore: prob,
      weightedScore: prob * this.weights.marketSentiment,
      teamA: prob,
      teamB: 1 - prob,
      confidence: 0.6,
    };
  }

  // Weighted aggregation (6 factors)
  private aggregateFactors(factors: FactorBreakdown): WinProbability {
    const totalWeight =
      factors.hltvRank.weight +
      factors.recentForm.weight +
      factors.lineup.weight +
      factors.mapPool.weight +
      factors.headToHead.weight +
      factors.marketSentiment.weight;

    const teamA =
      (factors.hltvRank.weightedScore +
        factors.recentForm.weightedScore +
        factors.lineup.weightedScore +
        factors.mapPool.weightedScore +
        factors.headToHead.weightedScore +
        factors.marketSentiment.weightedScore) /
      totalWeight;

    return {
      teamA: Math.round(teamA * 10000) / 10000,
      teamB: Math.round((1 - teamA) * 10000) / 10000,
    };
  }

  private calculateConfidence(factors: FactorBreakdown): number {
    const confidences = [
      factors.hltvRank.confidence,
      factors.recentForm.confidence,
      factors.lineup.confidence,
      factors.mapPool.confidence,
      factors.headToHead.confidence,
      factors.marketSentiment.confidence,
    ];
    const weights = [
      factors.hltvRank.weight,
      factors.recentForm.weight,
      factors.lineup.weight,
      factors.mapPool.weight,
      factors.headToHead.weight,
      factors.marketSentiment.weight,
    ];

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedConf = confidences.reduce((sum, c, i) => sum + c * weights[i], 0);

    return Math.round((weightedConf / totalWeight) * 100) / 100;
  }

  private rankConfidence(rankDiff: number): number {
    if (rankDiff > 30) return 0.9;
    if (rankDiff > 15) return 0.75;
    if (rankDiff > 5) return 0.6;
    return 0.4;
  }

  private buildLineupAnalysis(match: MatchInfo): LineupAnalysis | undefined {
    if (!match.lineups) return undefined;
    return this.lineupEngine.compareLineups(match.lineups.teamA, match.lineups.teamB);
  }

  private generateRecommendation(
    wp: WinProbability,
    factors: FactorBreakdown,
    confidence: number,
  ): BetRecommendation {
    const edge = Math.abs(wp.teamA - 0.5) * 2;
    const kellyFraction = Math.max(0, edge - 0.05) * confidence;

    if (confidence < 0.3 || edge < 0.05) {
      return {
        action: 'skip',
        kellyFraction: 0,
        expectedValue: 0,
        reasoning: '置信度不足或优势太小，建议跳过',
      };
    }

    const action = wp.teamA > wp.teamB ? 'bet_team_a' : 'bet_team_b';
    const ev = edge * confidence * 100;

    return {
      action,
      kellyFraction: Math.round(kellyFraction * 10000) / 10000,
      expectedValue: Math.round(ev * 100) / 100,
      reasoning: this.buildReasoning(wp, factors, action),
    };
  }

  private buildReasoning(
    wp: WinProbability,
    factors: FactorBreakdown,
    action: string,
  ): string {
    const team = action === 'bet_team_a' ? 'Team A' : 'Team B';
    const prob = action === 'bet_team_a' ? wp.teamA : wp.teamB;
    const strongest = this.strongestFactor(factors);

    return `${team} 胜率 ${(prob * 100).toFixed(1)}%，最强信号来自 ${strongest}`;
  }

  private strongestFactor(factors: FactorBreakdown): string {
    const scores = [
      { name: 'HLTV排名', score: Math.abs(factors.hltvRank.rawScore - 0.5) },
      { name: '近期状态', score: Math.abs(factors.recentForm.rawScore - 0.5) },
      { name: '出场阵容', score: Math.abs(factors.lineup.rawScore - 0.5) },
      { name: '地图池', score: Math.abs(factors.mapPool.rawScore - 0.5) },
      { name: '历史交锋', score: Math.abs(factors.headToHead.rawScore - 0.5) },
      { name: '市场情绪', score: Math.abs(factors.marketSentiment.rawScore - 0.5) },
    ];
    return scores.sort((a, b) => b.score - a.score)[0].name;
  }
}
