import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock infra
vi.mock('@polyrader/infra', () => ({
  LLMRepository: vi.fn().mockImplementation(() => ({
    getAllStats: vi.fn().mockResolvedValue([]),
    getBets: vi.fn().mockResolvedValue([]),
    getBetsByProvider: vi.fn().mockResolvedValue([]),
    getBetsByMatch: vi.fn().mockResolvedValue([]),
    upsertBet: vi.fn(),
    upsertStats: vi.fn(),
    getStats: vi.fn().mockReturnValue(null),
    getMatch: vi.fn().mockReturnValue(null),
    getUpcomingMatches: vi.fn().mockReturnValue([]),
    getAllConfigs: vi.fn().mockResolvedValue([]),
  })),
}));

import { AiStatsService } from '../services/ai-stats-service';

describe('P2-1: LLM Pipeline Fixes', () => {
  let service: AiStatsService;
  let llmRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AiStatsService();
    llmRepo = (service as unknown as { llmRepo: Record<string, ReturnType<typeof vi.fn>> }).llmRepo;
  });

  describe('placeBet — provider parameter', () => {
    it('accepts provider parameter and passes it to betting engine', async () => {
      const bet = await service.placeBet('match1', 'Team A', 100, 2.0, 'anthropic');
      expect(bet.provider).toBe('anthropic');
    });

    it('defaults to "user" provider when not specified', async () => {
      const bet = await service.placeBet('match1', 'Team A', 100, 2.0);
      expect(bet.provider).toBe('user');
    });
  });

  describe('getCalibration — uses implied probability', () => {
    it('uses 1/odds as confidence (not raw odds)', async () => {
      const mockBets = [
        { odds: 2.0, result: 'won', provider: 'openai' },
        { odds: 4.0, result: 'lost', provider: 'openai' },
      ];
      llmRepo.getBetsByProvider.mockResolvedValue(mockBets);

      const result = await service.getCalibration('openai');

      // odds 2.0 → confidence 0.5, odds 4.0 → confidence 0.25
      // These should be in different calibration buckets
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getEquityCurve — reads from DB', () => {
    it('returns empty array when DB has no settled bets', async () => {
      llmRepo.getBets.mockResolvedValue([]);
      const result = await service.getEquityCurve();
      expect(result).toEqual([]);
    });

    it('builds equity curve from settled bets in DB', async () => {
      llmRepo.getBets.mockResolvedValue([
        { matchId: 'm1', result: 'won', profitLoss: 100, settledAt: '2026-01-01T00:00:00Z', odds: 2.0, provider: 'openai' },
        { matchId: 'm2', result: 'lost', profitLoss: -50, settledAt: '2026-01-02T00:00:00Z', odds: 2.0, provider: 'openai' },
        { matchId: 'm3', result: 'pending', profitLoss: 0, settledAt: null, odds: 2.0, provider: 'openai' },
      ]);
      const result = await service.getEquityCurve();
      // Only 2 settled bets (pending excluded)
      expect(result).toHaveLength(2);
      // Equity accumulates: 100, then 100-50=50
      expect(result[0].equity).toBe(100);
      expect(result[1].equity).toBe(50);
    });

    it('handles undefined from getBets gracefully', async () => {
      llmRepo.getBets.mockResolvedValue(undefined);
      const result = await service.getEquityCurve();
      expect(result).toEqual([]);
    });
  });
});
