import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing the service
vi.mock('@polyrader/infra', () => ({
  WhaleRepository: vi.fn().mockImplementation(() => ({
    findAll: vi.fn(),
    findByAddress: vi.fn(),
    getTrades: vi.fn().mockReturnValue([]),
    findCorrelationData: vi.fn().mockReturnValue({
      correlatedAddressCount: 0,
      marketOverlapRatio: 0,
      avgCorrelatedSuspicion: 0,
    }),
  })),
  LLMRepository: vi.fn().mockImplementation(() => ({
    getBets: vi.fn(),
    getAllStats: vi.fn(),
    getBetsByProvider: vi.fn(),
    getUpcomingMatches: vi.fn(),
    getMatch: vi.fn(),
    upsertBet: vi.fn(),
  })),
  MarketRepository: vi.fn().mockImplementation(() => ({
    findAll: vi.fn(),
    findByConditionId: vi.fn(),
    upsert: vi.fn(),
  })),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  PolymarketGammaClient: vi.fn(),
  PolymarketClobClient: vi.fn(),
}));

import { WhaleService } from '../services/whale-service';
import { AiStatsService } from '../services/ai-stats-service';
import { cacheGet, cacheSet } from '@polyrader/infra';

// ============================================================
// WhaleService tests
// ============================================================
describe('WhaleService', () => {
  let service: WhaleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WhaleService();
  });

  describe('getWhales', () => {
    it('returns cached whales when available', async () => {
      vi.mocked(cacheGet).mockResolvedValue([{ address: '0xabc', suspiciousScore: { total: 50 } } as never]);

      const result = await service.getWhales(50);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xabc');
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('fetches from DB and caches when no cache', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      // Access private repo to mock
      const repo = (service as unknown as { whaleRepo: { findAll: ReturnType<typeof vi.fn> } }).whaleRepo;
      repo.findAll.mockResolvedValue([
        { address: '0xdef', totalVolume: 5000, activePositions: 2, winRate: 0.5, pnl: 100, recentTrades: [], suspiciousScore: { total: 0, volumeAnomaly: 0, timingAnomaly: 0, patternAnomaly: 0, correlationAnomaly: 0 } },
      ]);

      const result = await service.getWhales(10);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xdef');
      expect(cacheSet).toHaveBeenCalledWith('whales:10', expect.any(Array), 120);
    });
  });

  describe('getWhale', () => {
    it('returns cached whale when available', async () => {
      vi.mocked(cacheGet).mockResolvedValue({ address: '0xcached' } as never);

      const result = await service.getWhale('0xcached');

      expect(result?.address).toBe('0xcached');
    });

    it('returns null when whale not found', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const repo = (service as unknown as { whaleRepo: { findByAddress: ReturnType<typeof vi.fn> } }).whaleRepo;
      repo.findByAddress.mockResolvedValue(null);

      const result = await service.getWhale('0xnotfound');

      expect(result).toBeNull();
    });

    it('caches whale when found in DB', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const repo = (service as unknown as { whaleRepo: { findByAddress: ReturnType<typeof vi.fn> } }).whaleRepo;
      const mockWhale = { address: '0xfound', recentTrades: [], suspiciousScore: { total: 0 } };
      repo.findByAddress.mockResolvedValue(mockWhale);

      const result = await service.getWhale('0xfound');

      expect(result?.address).toBe('0xfound');
      expect(cacheSet).toHaveBeenCalledWith('whale:0xfound', mockWhale, 120);
    });
  });
});

// ============================================================
// AiStatsService tests
// ============================================================
describe('AiStatsService', () => {
  let service: AiStatsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AiStatsService();
  });

  describe('getLeaderboard', () => {
    it('returns ranked stats from repository', async () => {
      const mockStats = [
        { provider: 'openai', totalPredictions: 10, correctPredictions: 7, brierScore: 0.2 },
        { provider: 'anthropic', totalPredictions: 5, correctPredictions: 3, brierScore: 0.3 },
      ];

      const repo = (service as unknown as { llmRepo: { getAllStats: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.getAllStats.mockResolvedValue(mockStats);

      const result = await service.getLeaderboard();

      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('openai');
    });
  });

  describe('getHistory', () => {
    it('returns bets from repository with limit', async () => {
      const mockBets = [
        { matchId: 'm1', provider: 'openai', result: 'won', profitLoss: 100, odds: 2.0 },
      ];

      const repo = (service as unknown as { llmRepo: { getBets: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.getBets.mockResolvedValue(mockBets);

      const result = await service.getHistory(10);

      expect(result).toHaveLength(1);
      expect(result[0].matchId).toBe('m1');
      expect(repo.getBets).toHaveBeenCalledWith(10);
    });

    it('uses default limit of 50', async () => {
      const repo = (service as unknown as { llmRepo: { getBets: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.getBets.mockResolvedValue([]);

      await service.getHistory();

      expect(repo.getBets).toHaveBeenCalledWith(50);
    });
  });

  describe('getCalibration', () => {
    it('returns calibration points for a provider', async () => {
      const mockBets = [
        { result: 'won', odds: '1.5', provider: 'openai' },
        { result: 'lost', odds: '3.0', provider: 'openai' },
        { result: 'pending', odds: '2.0', provider: 'openai' },
      ];

      const repo = (service as unknown as { llmRepo: { getBetsByProvider: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.getBetsByProvider.mockResolvedValue(mockBets);

      const result = await service.getCalibration('openai');

      expect(Array.isArray(result)).toBe(true);
      expect(repo.getBetsByProvider).toHaveBeenCalledWith('openai', 200);
    });
  });

  describe('placeBet', () => {
    it('places a bet and saves to repository', async () => {
      const repo = (service as unknown as { llmRepo: { upsertBet: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.upsertBet.mockResolvedValue(undefined);

      const result = await service.placeBet('match1', 'teamA', 100, 2.0);

      expect(result).toBeDefined();
      expect(result.matchId).toBe('match1');
      expect(result.team).toBe('teamA');
      expect(result.amount).toBe(100);
      expect(result.odds).toBe(2.0);
      expect(repo.upsertBet).toHaveBeenCalledOnce();
    });
  });

  describe('getEquityCurve', () => {
    it('returns equity curve from betting engine', async () => {
      const repo = (service as unknown as { llmRepo: { getBets: ReturnType<typeof vi.fn> } }).llmRepo;
      repo.getBets.mockResolvedValue([]);

      const result = await service.getEquityCurve();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
