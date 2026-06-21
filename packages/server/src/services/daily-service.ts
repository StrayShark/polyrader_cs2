import type { DailyDashboard } from '@polyrader/core';
import { DailyDashboardEngine, PredictionEngine } from '@polyrader/core';
import { LLMRepository, cacheGet, cacheSet } from '@polyrader/infra';
import { MarketService } from './market-service';
import { WhaleService } from './whale-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { logger } from '../utils/logger';

export class DailyService {
  private engine = new DailyDashboardEngine();
  private predictionEngine = new PredictionEngine();
  private marketService = new MarketService();
  private llmRepo = new LLMRepository();
  private whaleService = new WhaleService();

  async getDashboard(): Promise<DailyDashboard> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily:${today}`;
    const cached = await cacheGet<DailyDashboard>(cacheKey);
    if (cached) return cached;

    return this.refreshDashboard();
  }

  async refreshDashboard(): Promise<DailyDashboard> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const markets = await this.marketService.getMarkets(100, 0);
      const matchMarkets = markets.filter((m) => m.match !== undefined);

      // Load real team data from DB
      const upcomingMatches = this.llmRepo.getUpcomingMatches(100);
      const matchMap = new Map<string, Record<string, unknown>>();
      for (const m of upcomingMatches) {
        matchMap.set(String(m.match_id ?? ''), m);
      }

      const deviations = await Promise.all(
        matchMarkets.map(async (m) => {
          const rawProb = parseFloat(m.outcomePrices[0] ?? '0.5');
          const polymarketProb = Number.isNaN(rawProb) ? 0.5 : rawProb;

          // Try to find matching DB match data by HLTV match_id first
          let dbMatch = matchMap.get(m.conditionId);
          // Fallback: match by team names extracted from the market question
          // (market question looks like "Counter-Strike: TeamA vs TeamB")
          if (!dbMatch) {
            const question = (m.question ?? '').toLowerCase();
            dbMatch = upcomingMatches.find((um) => {
              const nameA = String(um.team_a_name ?? '').toLowerCase();
              const nameB = String(um.team_b_name ?? '').toLowerCase();
              return nameA && nameB && question.includes(nameA) && question.includes(nameB);
            });
          }
          const matchInfo = dbMatch ? buildMatchInfo(dbMatch) : buildFallbackMatchInfo(m.conditionId);

          // Load team data from DB
          const teamA = dbMatch
            ? loadTeamFromDb(String(dbMatch.team_a_id ?? ''))
            : buildFallbackTeam('team-a', 'Team A', 10, 0.6);
          const teamB = dbMatch
            ? loadTeamFromDb(String(dbMatch.team_b_id ?? ''))
            : buildFallbackTeam('team-b', 'Team B', 20, 0.5);

          const prediction = this.predictionEngine.predict(
            matchInfo,
            teamA,
            teamB,
            polymarketProb,
          );

          const deviation = prediction.winProbability.teamA - polymarketProb;

          return {
            marketId: m.conditionId,
            question: m.question,
            polymarketProb,
            predictedProb: prediction.winProbability.teamA,
            deviation,
            direction: deviation > 0 ? ('undervalued' as const) : ('overvalued' as const),
          };
        }),
      );

      const whaleAlerts: Array<{ address: string; marketId: string; action: string; amount: number; timestamp: string; suspiciousScore: number }> = [];
      try {
        const whales = await this.whaleService.getWhales(20);
        for (const whale of whales) {
          for (const trade of whale.recentTrades.slice(0, 3)) {
            if (trade.amount >= 1000) {
              whaleAlerts.push({
                address: whale.address,
                marketId: trade.marketId,
                action: trade.type === 'buy' ? 'buy' : 'sell',
                amount: trade.amount,
                timestamp: trade.timestamp,
                suspiciousScore: whale.suspiciousScore.total,
              });
            }
          }
        }
      } catch {
        // whale service unavailable, continue with empty alerts
      }

      const dashboard = this.engine.generateDashboard(today, matchMarkets, deviations, whaleAlerts);
      await cacheSet(`daily:${today}`, dashboard, 300);
      return dashboard;
    } catch (err) {
      logger.warn('Failed to generate daily dashboard', { error: (err as Error).message });
      return this.engine.generateDashboard(today, [], [], []);
    }
  }

}

