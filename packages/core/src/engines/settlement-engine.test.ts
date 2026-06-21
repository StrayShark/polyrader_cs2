import { describe, it, expect, vi } from 'vitest';
import { SettlementEngine } from './settlement-engine';
import type { SimulatedBet, LLMProvider } from '../types/index';

function makeBet(overrides: Partial<SimulatedBet> = {}): SimulatedBet {
  return {
    id: 'bet-1',
    matchId: 'match-1',
    provider: 'openai' as LLMProvider,
    team: 'Natus Vincere',
    amount: 100,
    odds: 2.0,
    result: 'pending',
    profitLoss: 0,
    placedAt: '2025-06-20T10:00:00Z',
    ...overrides,
  };
}

describe('SettlementEngine', () => {
  const engine = new SettlementEngine();

  describe('settleMarket', () => {
    it('should settle pending bets for a match', async () => {
      const bets = [
        makeBet({ id: 'bet-1', team: 'Natus Vincere', provider: 'openai' }),
        makeBet({ id: 'bet-2', team: 'FaZe Clan', provider: 'anthropic' }),
        makeBet({ id: 'bet-3', team: 'Natus Vincere', provider: 'google' }),
      ];

      const getBets = vi.fn().mockResolvedValue(bets);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      const result = await engine.settleMarket(
        'match-1',
        'Natus Vincere',
        1.0,
        getBets,
        saveStats,
        saveBet,
      );

      expect(result.settledCount).toBe(3);
      expect(saveBet).toHaveBeenCalledTimes(3);
      expect(saveStats).toHaveBeenCalledTimes(3);
    });

    it('should mark correct bets as won with profit', async () => {
      const bets = [makeBet({ id: 'bet-1', team: 'Natus Vincere', odds: 2.0 })];

      const getBets = vi.fn().mockResolvedValue(bets);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      await engine.settleMarket('match-1', 'Natus Vincere', 1.0, getBets, saveStats, saveBet);

      const savedBet = saveBet.mock.calls[0][0] as SimulatedBet;
      expect(savedBet.result).toBe('won');
      expect(savedBet.profitLoss).toBe(100); // 100 * (2.0 - 1)
    });

    it('should mark wrong bets as lost with negative profit', async () => {
      const bets = [makeBet({ id: 'bet-1', team: 'Natus Vincere', odds: 2.0 })];

      const getBets = vi.fn().mockResolvedValue(bets);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      await engine.settleMarket('match-1', 'FaZe Clan', 1.0, getBets, saveStats, saveBet);

      const savedBet = saveBet.mock.calls[0][0] as SimulatedBet;
      expect(savedBet.result).toBe('lost');
      expect(savedBet.profitLoss).toBe(-100);
    });

    it('should skip already settled bets', async () => {
      const bets = [
        makeBet({ id: 'bet-1', team: 'Natus Vincere', result: 'won', profitLoss: 100 }),
      ];

      const getBets = vi.fn().mockResolvedValue(bets);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      const result = await engine.settleMarket('match-1', 'Natus Vincere', 1.0, getBets, saveStats, saveBet);

      expect(result.settledCount).toBe(0);
      expect(saveBet).not.toHaveBeenCalled();
    });

    it('should return empty results when no pending bets', async () => {
      const getBets = vi.fn().mockResolvedValue([]);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      const result = await engine.settleMarket('match-1', 'Natus Vincere', 1.0, getBets, saveStats, saveBet);

      expect(result.settledCount).toBe(0);
      expect(result.providerResults).toHaveLength(0);
    });

    it('should group results by provider', async () => {
      const bets = [
        makeBet({ id: 'bet-1', team: 'Natus Vincere', provider: 'openai' }),
        makeBet({ id: 'bet-2', team: 'FaZe Clan', provider: 'openai' }),
        makeBet({ id: 'bet-3', team: 'Natus Vincere', provider: 'anthropic' }),
      ];

      const getBets = vi.fn().mockResolvedValue(bets);
      const saveStats = vi.fn().mockResolvedValue(undefined);
      const saveBet = vi.fn().mockResolvedValue(undefined);

      const result = await engine.settleMarket('match-1', 'Natus Vincere', 1.0, getBets, saveStats, saveBet);

      expect(result.providerResults).toHaveLength(2);
      const openaiResult = result.providerResults.find((r) => r.provider === 'openai')!;
      expect(openaiResult.won).toBe(1);
      expect(openaiResult.lost).toBe(1);
    });
  });

  describe('aggregateProviderStats', () => {
    it('should calculate aggregate stats across providers', () => {
      const results = [
        { provider: 'openai' as LLMProvider, won: 7, lost: 3, pnl: 400 },
        { provider: 'anthropic' as LLMProvider, won: 5, lost: 5, pnl: 0 },
        { provider: 'google' as LLMProvider, won: 3, lost: 7, pnl: -400 },
      ];

      const stats = engine.aggregateProviderStats(results);

      expect(stats.totalBets).toBe(30);
      expect(stats.totalWon).toBe(15);
      expect(stats.totalPnl).toBe(0);
      expect(stats.winRate).toBe(0.5);
      expect(stats.bestProvider).toBe('openai');
    });

    it('should return null bestProvider when no bets', () => {
      const stats = engine.aggregateProviderStats([]);

      expect(stats.totalBets).toBe(0);
      expect(stats.bestProvider).toBeNull();
    });

    it('should handle single provider', () => {
      const results = [
        { provider: 'openai' as LLMProvider, won: 8, lost: 2, pnl: 600 },
      ];

      const stats = engine.aggregateProviderStats(results);

      expect(stats.totalBets).toBe(10);
      expect(stats.winRate).toBe(0.8);
      expect(stats.bestProvider).toBe('openai');
    });
  });

  describe('P2-5: Settlement fixes', () => {
    it('settles bets based on winner team name match', async () => {
      const bets = [
        { matchId: 'm1', team: 'Natus Vincere', amount: 100, odds: 1.8, provider: 'openai', result: 'pending' as const, profitLoss: 0, settledAt: null },
        { matchId: 'm1', team: 'FaZe Clan', amount: 100, odds: 2.2, provider: 'anthropic', result: 'pending' as const, profitLoss: 0, settledAt: null },
      ];
      const savedBets: typeof bets = [];
      const savedStats: Array<{ provider: string; stats: unknown }> = [];

      const result = await engine.settleMarket(
        'm1',
        'Natus Vincere',
        1.0,
        async () => bets as any,
        async (provider, stats) => { savedStats.push({ provider, stats }); },
        async (bet) => { savedBets.push(bet as any); },
      );

      expect(result.settledCount).toBe(2);
      // NaVi bet won, FaZe bet lost
      expect(savedBets[0].result).toBe('won');
      expect(savedBets[0].profitLoss).toBe(100 * (1.8 - 1)); // 80
      expect(savedBets[1].result).toBe('lost');
      expect(savedBets[1].profitLoss).toBe(-100);
    });

    it('uses "unknown" model name instead of "default"', async () => {
      const bets = [
        { matchId: 'm1', team: 'Team A', amount: 100, odds: 2.0, provider: 'openai', result: 'pending' as const, profitLoss: 0, settledAt: null },
      ];
      let savedStats: any = null;

      await engine.settleMarket(
        'm1', 'Team A', 1.0,
        async () => bets as any,
        async (_provider, stats) => { savedStats = stats; },
        async () => {},
      );

      expect(savedStats.model).toBe('unknown');
    });
  });
});
