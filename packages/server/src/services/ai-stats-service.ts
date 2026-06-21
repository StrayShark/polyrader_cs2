import type { LLMStats, UserStats, SimulatedBet, CalibrationPoint, LLMProvider } from '@polyrader/core';
import { StatsEngine, SimulatedBettingEngine } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';

export class AiStatsService {
  private statsEngine = new StatsEngine();
  private bettingEngine = new SimulatedBettingEngine();
  private llmRepo = new LLMRepository();

  async getLeaderboard(): Promise<LLMStats[]> {
    const stats = await this.llmRepo.getAllStats();
    return this.statsEngine.rankProviders(stats);
  }

  async getUserStats(): Promise<UserStats> {
    const bets = await this.llmRepo.getBets(200);
    return this.statsEngine.calculateUserStats(
      bets.map((b) => ({
        result: b.result === 'pending' ? 'pending' : b.result,
        profitLoss: b.profitLoss,
        provider: b.provider,
        settledAt: b.settledAt,
      })),
    );
  }

  async getHistory(limit = 50): Promise<SimulatedBet[]> {
    return this.llmRepo.getBets(limit);
  }

  async getCalibration(providerId: string): Promise<CalibrationPoint[]> {
    const provider = providerId as LLMProvider;
    const bets = await this.llmRepo.getBetsByProvider(provider, 200);

    // Use implied probability (1/odds) as confidence, not raw odds
    // odds of 2.0 → implied prob 0.5 (50% confidence)
    const predictions = bets
      .filter((b) => b.result !== 'pending')
      .map((b) => ({
        confidence: 1 / Math.max(1.01, b.odds),
        correct: b.result === 'won',
      }));

    return this.statsEngine.calculateCalibration(provider, predictions);
  }

  async getEquityCurve(): Promise<Array<{ date: string; equity: number }>> {
    // Read from DB for persistence — fall back to in-memory if DB is empty
    const settledBets = (await this.llmRepo.getBets(500)) ?? [];
    const settled = settledBets
      .filter((b) => b.result !== 'pending' && b.settledAt)
      .sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : 1));

    if (settled.length === 0) return [];

    let equity = 0;
    return settled.map((b) => {
      equity += b.profitLoss;
      return { date: b.settledAt!, equity: Math.round(equity * 100) / 100 };
    });
  }

  async placeBet(matchId: string, team: string, amount: number, odds: number, provider?: LLMProvider, reasoning?: string): Promise<SimulatedBet> {
    // Use provided provider, or 'user' for manual bets not tied to a specific LLM
    const betProvider = provider ?? 'user' as LLMProvider;
    const bet = this.bettingEngine.placeBet(matchId, betProvider, team, odds, amount);
    if (reasoning) {
      bet.reasoning = reasoning;
    }
    await this.llmRepo.upsertBet(bet);
    return bet;
  }

  async settleBet(id: string, result: 'won' | 'lost', profitLoss?: number): Promise<SimulatedBet | null> {
    const bet = await this.llmRepo.getBetById(id);
    if (!bet) return null;

    const pnl = (profitLoss !== undefined && Number.isFinite(profitLoss))
      ? profitLoss
      : (result === 'won' ? bet.amount * (bet.odds - 1) : -bet.amount);

    const updatedBet: SimulatedBet = {
      ...bet,
      result,
      profitLoss: pnl,
      settledAt: new Date().toISOString(),
    };

    await this.llmRepo.upsertBet(updatedBet);
    return updatedBet;
  }

  async deleteBet(id: string): Promise<void> {
    await this.llmRepo.deleteBet(id);
  }
}
