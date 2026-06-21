import type { LLMProvider, SimulatedBet } from '../types/index';
import { StatsEngine } from './stats-engine';

/**
 * SettlementEngine — Auto-settle bets when Polymarket markets resolve.
 *
 * Watches for resolved markets, compares LLM predictions against actual outcomes,
 * and updates provider/user statistics.
 */
export class SettlementEngine {
  private statsEngine = new StatsEngine();

  /**
   * Settle all pending bets for a resolved market.
   *
   * @param matchId - The match/market identifier
   * @param winnerTeam - The winning team name (must match what was used in placeBet)
   * @param resolvedPrice - The final resolution price (1.0 = Yes won, 0.0 = No won)
   * @param getBets - Function to load bets from DB
   * @param saveStats - Function to persist updated stats
   */
  async settleMarket(
    matchId: string,
    winnerTeam: string,
    _resolvedPrice: number,
    getBets: (matchId: string) => Promise<SimulatedBet[]>,
    saveStats: (provider: LLMProvider, stats: ReturnType<StatsEngine['calculateLLMStats']>) => Promise<void>,
    saveBet: (bet: SimulatedBet) => Promise<void>,
  ): Promise<{
    settledCount: number;
    providerResults: Array<{ provider: LLMProvider; won: number; lost: number; pnl: number }>;
  }> {
    const bets = await getBets(matchId);
    const pendingBets = bets.filter((b) => b.result === 'pending');

    if (pendingBets.length === 0) {
      return { settledCount: 0, providerResults: [] };
    }

    const providerBets = new Map<LLMProvider, SimulatedBet[]>();
    for (const bet of pendingBets) {
      const won = bet.team === winnerTeam;
      bet.result = won ? 'won' : 'lost';
      bet.profitLoss = won ? bet.amount * (bet.odds - 1) : -bet.amount;
      bet.settledAt = new Date().toISOString();

      await saveBet(bet);

      const existing = providerBets.get(bet.provider) ?? [];
      existing.push(bet);
      providerBets.set(bet.provider, existing);
    }

    // Update stats per provider
    const providerResults: Array<{ provider: LLMProvider; won: number; lost: number; pnl: number }> = [];

    for (const [provider, providerBetList] of providerBets) {
      const predictions = providerBetList.map((b) => ({
        predictedProb: 1 / b.odds, // implied probability from odds
        actualOutcome: b.result === 'won' ? 1 : 0,
        profitLoss: b.profitLoss,
      }));

      const stats = this.statsEngine.calculateLLMStats(provider, 'unknown', predictions);
      await saveStats(provider, stats);

      providerResults.push({
        provider,
        won: providerBetList.filter((b) => b.result === 'won').length,
        lost: providerBetList.filter((b) => b.result === 'lost').length,
        pnl: providerBetList.reduce((s, b) => s + b.profitLoss, 0),
      });
    }

    return {
      settledCount: pendingBets.length,
      providerResults,
    };
  }

  /**
   * Calculate aggregate stats across all providers.
   */
  aggregateProviderStats(
    providerResults: Array<{ provider: LLMProvider; won: number; lost: number; pnl: number }>,
  ): {
    totalBets: number;
    totalWon: number;
    totalPnl: number;
    winRate: number;
    bestProvider: LLMProvider | null;
  } {
    const totalBets = providerResults.reduce((s, r) => s + r.won + r.lost, 0);
    const totalWon = providerResults.reduce((s, r) => s + r.won, 0);
    const totalPnl = providerResults.reduce((s, r) => s + r.pnl, 0);

    let bestProvider: LLMProvider | null = null;
    let bestRate = 0;
    for (const r of providerResults) {
      const rate = (r.won + r.lost) > 0 ? r.won / (r.won + r.lost) : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestProvider = r.provider;
      }
    }

    return {
      totalBets,
      totalWon,
      totalPnl: Math.round(totalPnl * 100) / 100,
      winRate: totalBets > 0 ? Math.round((totalWon / totalBets) * 10000) / 10000 : 0,
      bestProvider,
    };
  }
}
