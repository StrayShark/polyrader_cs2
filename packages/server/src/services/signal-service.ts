import type { SignalComparison } from '@polyrader/core';
import { SignalComparisonEngine, PredictionEngine } from '@polyrader/core';
import { cacheGet, cacheSet, LLMRepository } from '@polyrader/infra';
import { MarketService } from './market-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { logger } from '../utils/logger';

export class SignalService {
  private engine = new SignalComparisonEngine();
  private predictionEngine = new PredictionEngine();
  private marketService = new MarketService();
  private llmRepo = new LLMRepository();

  async getSignals(marketId: string): Promise<SignalComparison | null> {
    const cacheKey = `signals:${marketId}`;
    const cached = await cacheGet<SignalComparison>(cacheKey);
    if (cached) return cached;

    try {
      const market = await this.marketService.getMarket(marketId);
      if (!market) return null;

      const polymarketProb = parseFloat(market.outcomePrices[0] ?? '0.5');

      // Try to load real match/team data from DB
      const dbMatch = this.llmRepo.getMatch(marketId);
      const matchInfo = dbMatch ? buildMatchInfo(dbMatch) : buildFallbackMatchInfo(marketId);
      const teamA = dbMatch ? loadTeamFromDb(String(dbMatch.team_a_id ?? '')) : buildFallbackTeam('team-a', 'Team A', 10, 0.6);
      const teamB = dbMatch ? loadTeamFromDb(String(dbMatch.team_b_id ?? '')) : buildFallbackTeam('team-b', 'Team B', 20, 0.5);

      const prediction = this.predictionEngine.predict(matchInfo, teamA, teamB, polymarketProb);

      const signal = this.engine.compareSignals(
        marketId,
        polymarketProb,
        prediction.winProbability.teamA,
      );

      await cacheSet(cacheKey, signal, 60);
      return signal;
    } catch (err) {
      logger.warn('Failed to generate signal', { error: (err as Error).message });
      return null;
    }
  }

  async getTopDeviations(limit = 10): Promise<SignalComparison[]> {
    const cacheKey = 'signals:top-deviations';
    const cached = await cacheGet<SignalComparison[]>(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.marketService.getMarkets(50, 0);
      const signals: SignalComparison[] = [];

      for (const market of markets.slice(0, limit)) {
        const signal = await this.getSignals(market.conditionId);
        if (signal && Math.abs(signal.deviation) > 0.05) {
          signals.push(signal);
        }
      }

      signals.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
      await cacheSet(cacheKey, signals, 120);
      return signals;
    } catch (err) {
      logger.warn('Failed to get top deviations', { error: (err as Error).message });
      return [];
    }
  }

  async getStats(): Promise<{
    accuracy: number;
    brierScore: number;
    totalPredictions: number;
  }> {
    const cacheKey = 'signals:stats';
    const cached = await cacheGet<{ accuracy: number; brierScore: number; totalPredictions: number }>(cacheKey);
    if (cached) return cached;

    try {
      const bets = this.llmRepo.getBets(500);
      const settled = bets.filter((b) => b.result !== 'pending');

      const totalPredictions = settled.length;
      const correctPredictions = settled.filter((b) => b.result === 'won').length;
      const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

      const brierScore = totalPredictions > 0
        ? settled.reduce((sum, b) => {
            const predicted = b.odds > 0 ? 1 / b.odds : 0.5;
            const actual = b.result === 'won' ? 1 : 0;
            return sum + (predicted - actual) ** 2;
          }, 0) / totalPredictions
        : 0;

      const stats = { accuracy, brierScore, totalPredictions };
      await cacheSet(cacheKey, stats, 300);
      return stats;
    } catch (err) {
      logger.warn('Failed to compute signal stats', { error: (err as Error).message });
      return { accuracy: 0, brierScore: 0, totalPredictions: 0 };
    }
  }

}

