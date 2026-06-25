import type { DailyDashboard, DeviationAlert } from '@polyrader/core';
import { DailyDashboardEngine, PredictionEngine } from '@polyrader/core';
import { LLMRepository, WalletFollowRepository, cacheGet, cacheSet } from '@polyrader/infra';
import { LLMClientFactory, CircuitBreakerLLMClient } from '@polyrader/infra';
import { KeyManager } from '@polyrader/core';
import type { LLMProvider } from '@polyrader/core';
import { MarketService } from './market-service';
import { WhaleService } from './whale-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { logger } from '../utils/logger';

interface LightweightLLMResult {
  prob: number;
  provider: string;
}

export class DailyService {
  private engine = new DailyDashboardEngine();
  private predictionEngine = new PredictionEngine();
  private marketService = new MarketService();
  private llmRepo = new LLMRepository();
  private whaleService = new WhaleService();
  private walletFollowRepo = new WalletFollowRepository();
  private keyManager: KeyManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerLLMClient>();

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

      // Pre-fetch lightweight LLM predictions for all matches in parallel
      const llmPredictions = await this.batchLightweightPredictions(matchMarkets, upcomingMatches);

      const deviations = await Promise.all(
        matchMarkets.map(async (m) => {
          const rawProb = parseFloat(m.outcomePrices[0] ?? '0.5');
          const polymarketProb = Number.isNaN(rawProb) ? 0.5 : rawProb;

          // Try to find matching DB match data by HLTV match_id first
          let dbMatch = matchMap.get(m.conditionId);
          // Fallback: match by team names extracted from the market question
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

          // Use LLM prediction if available, otherwise fall back to rule-based
          const llmResult = llmPredictions.get(m.conditionId);
          const alert: DeviationAlert = {
            marketId: m.conditionId,
            question: m.question,
            polymarketProb,
            predictedProb: prediction.winProbability.teamA,
            deviation,
            direction: deviation > 0 ? ('undervalued' as const) : ('overvalued' as const),
          };
          if (llmResult) {
            alert.llmProb = llmResult.prob;
          }

          return alert;
        }),
      );

      const whaleAlerts: Array<{ address: string; marketId: string; action: string; amount: number; timestamp: string; suspiciousScore: number }> = [];
      try {
        const whales = await this.whaleService.getWhales({ limit: 20 });
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

      try {
        for (const signal of this.walletFollowRepo.listRecentFollowedSignals(8)) {
          whaleAlerts.push({
            address: signal.leaderAddress,
            marketId: signal.conditionId ?? signal.tokenId,
            action: 'followed_buy',
            amount: signal.leaderAmount,
            timestamp: signal.createdAt,
            suspiciousScore: Math.round((signal.leaderWinRate ?? 0.5) * 100),
          });
        }
      } catch {
        // followed copy signals optional
      }

      const dashboard = this.engine.generateDashboard(today, matchMarkets, deviations, whaleAlerts);
      await cacheSet(`daily:${today}`, dashboard, 300);
      return dashboard;
    } catch (err) {
      logger.warn('Failed to generate daily dashboard', { error: (err as Error).message });
      return this.engine.generateDashboard(today, [], [], []);
    }
  }

  /**
   * Lightweight LLM pre-analysis: for each match, asks a single enabled LLM
   * for a quick win-probability estimate. Falls back gracefully if no LLM
   * is configured or if the call fails.
   */
  private async batchLightweightPredictions(
    matchMarkets: Array<{ conditionId: string; question: string }>,
    upcomingMatches: Array<Record<string, unknown>>,
  ): Promise<Map<string, LightweightLLMResult>> {
    const results = new Map<string, LightweightLLMResult>();
    if (matchMarkets.length === 0) return results;

    let configs: Array<{ provider: LLMProvider; apiKey: string; model: string }>;
    try {
      const allConfigs = await this.llmRepo.getAllConfigs();
      configs = allConfigs
        .filter((c) => c.isEnabled && c.apiKey)
        .map((c) => ({ provider: c.provider, apiKey: c.apiKey, model: c.model }));
    } catch {
      return results;
    }
    if (configs.length === 0) return results;

    // Use the first enabled provider for lightweight pre-analysis
    const config = configs[0];

    const matchMap = new Map<string, Record<string, unknown>>();
    for (const m of upcomingMatches) {
      matchMap.set(String(m.match_id ?? ''), m);
    }

    const promises = matchMarkets.map(async (m) => {
      try {
        const dbMatch = matchMap.get(m.conditionId)
          ?? upcomingMatches.find((um) => {
            const question = (m.question ?? '').toLowerCase();
            const nameA = String(um.team_a_name ?? '').toLowerCase();
            const nameB = String(um.team_b_name ?? '').toLowerCase();
            return nameA && nameB && question.includes(nameA) && question.includes(nameB);
          });

        const teamAName = dbMatch ? String(dbMatch.team_a_name ?? 'Team A') : 'Team A';
        const teamBName = dbMatch ? String(dbMatch.team_b_name ?? 'Team B') : 'Team B';

        const prob = await this.lightweightPredict(config, teamAName, teamBName, m.question);
        if (prob !== null) {
          results.set(m.conditionId, { prob, provider: config.provider });
        }
      } catch {
        // skip on error
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  private async lightweightPredict(
    config: { provider: LLMProvider; apiKey: string; model: string },
    teamAName: string,
    teamBName: string,
    question: string,
  ): Promise<number | null> {
    const encKey = process.env.POLYRADER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
    if (!encKey) return null;

    try {
      if (!this.keyManager) {
        this.keyManager = new KeyManager(encKey);
      }
      const apiKey = this.keyManager.decrypt(config.apiKey);

      const key = `${config.provider}:${config.model}`;
      let wrapped = this.circuitBreakers.get(key);
      if (!wrapped) {
        const inner = LLMClientFactory.create(config.provider, apiKey, config.model);
        wrapped = new CircuitBreakerLLMClient(config.provider, inner);
        this.circuitBreakers.set(key, wrapped);
      }

      const system = 'You are a CS2 esports analyst. Given a match, output ONLY a JSON object: {"teamAProb": 0.0-1.0}. No other text.';
      const user = `Match: ${question}\nTeam A: ${teamAName}\nTeam B: ${teamBName}\nEstimate Team A win probability (0.0-1.0).`;

      const raw = await wrapped.complete({ system, user });
      const match = raw.match(/"teamAProb"\s*:\s*([0-9.]+)/i);
      if (match) {
        const prob = parseFloat(match[1]);
        if (!isNaN(prob) && prob >= 0 && prob <= 1) return prob;
      }
      return null;
    } catch {
      return null;
    }
  }

}
