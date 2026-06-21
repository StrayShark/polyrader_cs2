import { randomUUID } from 'crypto';
import type { SimulatedBet, LLMProvider } from '../types/index';

/**
 * SimulatedBettingEngine — factory for simulated bet records.
 *
 * Creating a bet does NOT persist it; the caller is responsible for saving
 * the returned record to the database via LLMRepository.upsertBet().
 */
export class SimulatedBettingEngine {
  /**
   * Create a simulated bet record based on an LLM recommendation.
   * Does NOT persist — caller must save via LLMRepository.upsertBet().
   */
  placeBet(
    matchId: string,
    provider: LLMProvider,
    team: string,
    odds: number,
    amount = 100,
  ): SimulatedBet {
    const id = `bet-${randomUUID()}`;
    return {
      id,
      matchId,
      provider,
      team,
      odds,
      amount,
      result: 'pending',
      profitLoss: 0,
      placedAt: new Date().toISOString(),
    };
  }
}
