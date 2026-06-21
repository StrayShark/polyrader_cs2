import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@polyrader/infra', () => ({
  PolymarketGammaClient: vi.fn().mockImplementation(() => ({
    getMarkets: vi.fn(),
    getMarket: vi.fn(),
    getPriceHistory: vi.fn(),
  })),
  PolymarketClobClient: vi.fn().mockImplementation(() => ({
    getOrderBook: vi.fn(),
  })),
  MarketRepository: vi.fn().mockImplementation(() => ({
    findAll: vi.fn(),
    findByConditionId: vi.fn(),
    upsert: vi.fn(),
  })),
  AlertRepository: vi.fn().mockImplementation(() => ({
    getAlerts: vi.fn().mockReturnValue([]),
    getAlertById: vi.fn().mockReturnValue(null),
    createAlert: vi.fn(),
    updateAlert: vi.fn(),
    deleteAlert: vi.fn(),
    getTriggeredAlerts: vi.fn().mockReturnValue([]),
  })),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock('../websocket', () => ({
  broadcast: vi.fn(),
}));

import { MarketService } from '../services/market-service';
import { cacheGet, cacheSet } from '@polyrader/infra';

describe('MarketService', () => {
  let service: MarketService;
  let gammaClient: { getMarkets: ReturnType<typeof vi.fn>; getMarket: ReturnType<typeof vi.fn>; getPriceHistory: ReturnType<typeof vi.fn> };
  let marketRepo: { findAll: ReturnType<typeof vi.fn>; findByConditionId: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MarketService();

    gammaClient = (service as unknown as { gammaClient: typeof gammaClient }).gammaClient;
    marketRepo = (service as unknown as { marketRepo: typeof marketRepo }).marketRepo;
  });

  describe('getMarkets', () => {
    it('returns cached markets when available', async () => {
      const mockMarkets = [{ conditionId: 'c1', question: 'Test?' }];
      vi.mocked(cacheGet).mockResolvedValue(mockMarkets as never);

      const result = await service.getMarkets(50, 0);

      expect(result).toBe(mockMarkets);
      expect(gammaClient.getMarkets).not.toHaveBeenCalled();
    });

    it('fetches from API and caches when no cache', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const mockMarkets = [
        { conditionId: 'c1', question: 'Market 1' },
        { conditionId: 'c2', question: 'Market 2' },
      ];
      gammaClient.getMarkets.mockResolvedValue(mockMarkets);
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.getMarkets(50, 0);

      expect(result).toHaveLength(2);
      expect(gammaClient.getMarkets).toHaveBeenCalledWith(50, 0);
      expect(cacheSet).toHaveBeenCalledWith('markets:50:0', mockMarkets, 60);
      expect(marketRepo.upsert).toHaveBeenCalledTimes(2);
    });

    it('falls back to DB when API fails', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarkets.mockRejectedValue(new Error('API down'));

      const dbMarkets = [{ conditionId: 'c1', question: 'DB Market' }];
      marketRepo.findAll.mockResolvedValue(dbMarkets);

      const result = await service.getMarkets(50, 0);

      expect(result).toBe(dbMarkets);
      expect(marketRepo.findAll).toHaveBeenCalledWith(50, 0);
    });
  });

  describe('getMarket', () => {
    it('returns cached market when available', async () => {
      const mockMarket = { conditionId: 'c1', question: 'Test?' };
      vi.mocked(cacheGet).mockResolvedValue(mockMarket as never);

      const result = await service.getMarket('c1');

      expect(result).toBe(mockMarket);
    });

    it('fetches single market from API and caches', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const mockMarket = { conditionId: 'c1', question: 'Test?' };
      gammaClient.getMarket.mockResolvedValue(mockMarket);
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.getMarket('c1');

      expect(result).toBe(mockMarket);
      expect(cacheSet).toHaveBeenCalledWith('market:c1', mockMarket, 60);
      expect(marketRepo.upsert).toHaveBeenCalledWith(mockMarket);
    });

    it('returns null when API returns null', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarket.mockResolvedValue(null);

      const result = await service.getMarket('nonexistent');

      expect(result).toBeNull();
    });

    it('falls back to DB when API fails', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarket.mockRejectedValue(new Error('API down'));

      const dbMarket = { conditionId: 'c1', question: 'DB Market' };
      marketRepo.findByConditionId.mockResolvedValue(dbMarket);

      const result = await service.getMarket('c1');

      expect(result).toBe(dbMarket);
      expect(marketRepo.findByConditionId).toHaveBeenCalledWith('c1');
    });
  });

  describe('getPriceHistory', () => {
    it('returns price history from API', async () => {
      const mockHistory = [
        { timestamp: '2024-01-01', price: 0.5 },
        { timestamp: '2024-01-02', price: 0.6 },
      ];
      gammaClient.getPriceHistory.mockResolvedValue(mockHistory);

      const result = await service.getPriceHistory('c1');

      expect(result).toHaveLength(2);
      expect(gammaClient.getPriceHistory).toHaveBeenCalledWith('c1');
    });

    it('returns empty array when API fails', async () => {
      gammaClient.getPriceHistory.mockImplementation(async () => {
        throw new Error('API down');
      });

      const result = await service.getPriceHistory('c2');

      expect(result).toEqual([]);
    });
  });

  describe('refreshMarkets', () => {
    it('fetches and caches markets', async () => {
      const mockMarkets = [
        { conditionId: 'c1', question: 'M1' },
        { conditionId: 'c2', question: 'M2' },
      ];
      gammaClient.getMarkets.mockResolvedValue(mockMarkets);
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.refreshMarkets();

      expect(result).toHaveLength(2);
      expect(gammaClient.getMarkets).toHaveBeenCalledWith(100, 0);
      expect(marketRepo.upsert).toHaveBeenCalledTimes(2);
      expect(cacheSet).toHaveBeenCalledWith('markets:50:0', mockMarkets.slice(0, 50), 60);
    });

    it('returns empty array when API fails', async () => {
      gammaClient.getMarkets.mockRejectedValue(new Error('API down'));

      const result = await service.refreshMarkets();

      expect(result).toEqual([]);
    });
  });

  describe('getOrderBook', () => {
    it('returns cached orderbook when available', async () => {
      const mockBook = { bids: [], asks: [], spread: 0.01, midpoint: 0.5 };
      vi.mocked(cacheGet).mockResolvedValue(mockBook as never);

      const result = await service.getOrderBook('c1');

      expect(result).toBe(mockBook);
    });

    it('returns null when market has no clobTokenIds', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      // Mock getMarket to return a market without clobTokenIds
      gammaClient.getMarket.mockResolvedValue({ conditionId: 'c1', clobTokenIds: [] });

      const result = await service.getOrderBook('c1');

      expect(result).toBeNull();
    });
  });
});
