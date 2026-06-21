import type { SignalComparison } from '@polyrader/core';
import { SignalComparisonEngine, PredictionEngine } from '@polyrader/core';
import { cacheGet, cacheSet, LLMRepository } from '@polyrader/infra';
import { MarketService } from './market-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

export interface ArbitrageOpportunity {
  marketSlug: string;
  question: string;
  type: 'yes_no_spread' | 'cross_market_spread';
  profitPct: number;
  details: string;
}

export interface ArbitrageResult {
  opportunities: ArbitrageOpportunity[];
}

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

  async getArbitrageOpportunities(): Promise<ArbitrageResult> {
    const cacheKey = 'signals:arbitrage';
    const cached = await cacheGet<ArbitrageResult>(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.marketService.getMarkets(100, 0);
      const opportunities: ArbitrageOpportunity[] = [];

      // 1. Detect Yes/No price sum < 1 (same-market arbitrage)
      for (const market of markets) {
        if (market.outcomePrices.length < 2) continue;
        const yesPrice = parseFloat(market.outcomePrices[0] ?? '0');
        const noPrice = parseFloat(market.outcomePrices[1] ?? '0');
        if (!Number.isFinite(yesPrice) || !Number.isFinite(noPrice)) continue;
        if (yesPrice <= 0 || noPrice <= 0) continue;

        const sum = yesPrice + noPrice;
        if (sum < 1) {
          const profitPct = (1 - sum) * 100;
          opportunities.push({
            marketSlug: market.slug,
            question: market.question,
            type: 'yes_no_spread',
            profitPct,
            details: `Yes: ${(yesPrice * 100).toFixed(1)}% + No: ${(noPrice * 100).toFixed(1)}% = ${(sum * 100).toFixed(1)}%`,
          });
        }
      }

      // 2. Detect cross-market price differences (markets sharing tags)
      const marketGroups = new Map<string, typeof markets>();
      for (const market of markets) {
        const tags = market.tags ?? [];
        for (const tag of tags) {
          if (!tag) continue;
          const key = tag.toLowerCase();
          const group = marketGroups.get(key);
          if (group) {
            group.push(market);
          } else {
            marketGroups.set(key, [market]);
          }
        }
      }

      for (const [groupKey, groupMarkets] of marketGroups) {
        if (groupMarkets.length < 2) continue;
        for (let i = 0; i < groupMarkets.length; i++) {
          for (let j = i + 1; j < groupMarkets.length; j++) {
            const m1 = groupMarkets[i];
            const m2 = groupMarkets[j];
            const p1 = parseFloat(m1.outcomePrices[0] ?? '0');
            const p2 = parseFloat(m2.outcomePrices[0] ?? '0');
            if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;

            const diff = Math.abs(p1 - p2);
            if (diff > 0.02) {
              opportunities.push({
                marketSlug: `${m1.slug} | ${m2.slug}`,
                question: `${m1.question} / ${m2.question}`,
                type: 'cross_market_spread',
                profitPct: diff * 100,
                details: `Tag: ${groupKey} | Price diff: ${(diff * 100).toFixed(1)}% (${(p1 * 100).toFixed(1)}% vs ${(p2 * 100).toFixed(1)}%)`,
              });
            }
          }
        }
      }

      opportunities.sort((a, b) => b.profitPct - a.profitPct);

      const result: ArbitrageResult = { opportunities };
      await cacheSet(cacheKey, result, 120);
      return result;
    } catch (err) {
      logger.warn('Failed to detect arbitrage opportunities', { error: (err as Error).message });
      return { opportunities: [] };
    }
  }

  /**
   * Scan for arbitrage opportunities and broadcast via WebSocket.
   * Called by cron job every 2 minutes.
   */
  async scanAndBroadcastArbitrage(): Promise<void> {
    try {
      const result = await this.getArbitrageOpportunities();
      if (result.opportunities.length > 0) {
        broadcast('arbitrage', {
          type: 'arbitrage:update',
          opportunities: result.opportunities,
          count: result.opportunities.length,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.warn('Failed to broadcast arbitrage', { error: (err as Error).message });
    }
  }

}

