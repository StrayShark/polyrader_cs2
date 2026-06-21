import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock infra
vi.mock('@polyrader/infra', () => ({
  PolygonClient: vi.fn().mockImplementation(() => ({
    getBlockNumber: vi.fn().mockResolvedValue(1000),
    getLogs: vi.fn().mockResolvedValue([]),
  })),
  WhaleRepository: vi.fn().mockImplementation(() => ({
    insertTrade: vi.fn(),
    upsert: vi.fn(),
    findByAddress: vi.fn().mockReturnValue(null),
    getTrades: vi.fn().mockReturnValue([]),
    findCorrelationData: vi.fn().mockReturnValue({ correlatedAddressCount: 0, marketOverlapRatio: 0, avgCorrelatedSuspicion: 0 }),
    findAll: vi.fn().mockReturnValue([]),
  })),
  MarketRepository: vi.fn().mockImplementation(() => ({
    findAll: vi.fn().mockReturnValue([]),  // empty → outcome = 'Unknown'
    findByConditionId: vi.fn().mockReturnValue(null),
  })),
}));

import { WhaleIngestionService } from '../services/whale-ingestion-service';

describe('P2-4: Whale Ingestion Fixes', () => {
  let service: WhaleIngestionService;
  let polygonClient: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WhaleIngestionService();
    polygonClient = (service as unknown as { client: Record<string, ReturnType<typeof vi.fn>> }).client;
  });

  describe('parseTradeLog — buy side (makerAssetId = 0)', () => {
    it('correctly decodes a buy OrderFilled log', () => {
      // Build a mock OrderFilled log entry with 0x-prefixed data.
      // The 0x prefix must be stripped before slicing, otherwise every field
      // would be shifted by one byte and the parsed values would be garbled.
      //
      // Topics layout (OrderFilled event):
      //   [0] event signature
      //   [1] orderHash (indexed)
      //   [2] maker address (indexed, padded to 32 bytes — address in last 20 bytes)
      //   [3] taker address (indexed, padded to 32 bytes — address in last 20 bytes)
      //
      // Data (after stripping 0x) is 4 packed 32-byte words (ABI-encoded uint256):
      //   word 1 [0,64):    makerAssetId      = 0 (USDC → maker gives USDC, receives shares → buy)
      //   word 2 [64,128):  takerAssetId      = 12345 (the outcome tokenId)
      //   word 3 [128,192): makerAmountFilled = 1000000 (1 USDC in 6 decimals)
      //   word 4 [192,256): takerAmountFilled = 2000000 (2 shares in 6 decimals)
      const makerAddress = '1234567890abcdef1234567890abcdef12345678'; // 40 hex chars (20 bytes)
      const takerAddress = 'fedcba0987654321fedcba0987654321fedcba09'; // 40 hex chars (20 bytes)

      const mockLog = {
        address: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
        topics: [
          '0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb', // event topic [0]
          '0x' + '0'.repeat(64), // orderHash placeholder [1]
          '0x' + '0'.repeat(24) + makerAddress, // maker address (padded to 32 bytes) [2]
          '0x' + '0'.repeat(24) + takerAddress, // taker address (padded to 32 bytes) [3]
        ],
        data:
          '0x' +
          '0'.repeat(64) + // makerAssetId = 0 (USDC)
          (12345).toString(16).padStart(64, '0') + // takerAssetId = 12345 (tokenId)
          (1000000).toString(16).padStart(64, '0') + // makerAmountFilled = 1 USDC (6 decimals)
          (2000000).toString(16).padStart(64, '0'), // takerAmountFilled = 2 shares (6 decimals)
        blockNumber: '0x3e8',
        transactionHash: '0xabc123',
      };

      // Access the private method via any
      const trade = (service as any).parseTradeLog(mockLog);

      expect(trade).toBeDefined();
      // maker/taker addresses are the last 20 bytes of topics[2]/topics[3]
      expect(trade.maker).toBe('0x' + makerAddress);
      expect(trade.taker).toBe('0x' + takerAddress);
      // makerAssetId == 0 → maker gives USDC, receives shares → buy
      expect(trade.side).toBe('buy');
      // tokenId is the non-zero assetId (takerAssetId)
      expect(trade.tokenId).toBe('12345');
      // USDC amount = makerAmountFilled = 1000000 / 1e6 = 1.0
      expect(trade.amount).toBe(1);
      // price = USDC amount / share amount = 1.0 / 2.0 = 0.5
      expect(trade.price).toBe(0.5);
      // No market data in mocked DB → outcome = 'Unknown'
      expect(trade.outcome).toBe('Unknown');
    });
  });

  describe('parseTradeLog — sell side (takerAssetId = 0)', () => {
    it('correctly decodes a sell OrderFilled log', () => {
      // makerAssetId = 12345 (shares), takerAssetId = 0 (USDC)
      // → maker gives shares, receives USDC → sell
      // makerAmountFilled = 2000000 (2 shares)
      // takerAmountFilled = 1000000 (1 USDC)
      const makerAddress = '1234567890abcdef1234567890abcdef12345678';
      const takerAddress = 'fedcba0987654321fedcba0987654321fedcba09';

      const mockLog = {
        address: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
        topics: [
          '0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb',
          '0x' + '0'.repeat(64), // orderHash [1]
          '0x' + '0'.repeat(24) + makerAddress, // maker [2]
          '0x' + '0'.repeat(24) + takerAddress, // taker [3]
        ],
        data:
          '0x' +
          (12345).toString(16).padStart(64, '0') + // makerAssetId = 12345 (shares tokenId)
          '0'.repeat(64) + // takerAssetId = 0 (USDC)
          (2000000).toString(16).padStart(64, '0') + // makerAmountFilled = 2 shares
          (1000000).toString(16).padStart(64, '0'), // takerAmountFilled = 1 USDC
        blockNumber: '0x3e8',
        transactionHash: '0xdef456',
      };

      const trade = (service as any).parseTradeLog(mockLog);

      expect(trade).toBeDefined();
      expect(trade.maker).toBe('0x' + makerAddress);
      expect(trade.taker).toBe('0x' + takerAddress);
      // takerAssetId == 0 → maker gives shares, receives USDC → sell
      expect(trade.side).toBe('sell');
      // tokenId is the non-zero assetId (makerAssetId)
      expect(trade.tokenId).toBe('12345');
      // USDC amount = takerAmountFilled = 1000000 / 1e6 = 1.0
      expect(trade.amount).toBe(1);
      // price = USDC amount / share amount = 1.0 / 2.0 = 0.5
      expect(trade.price).toBe(0.5);
      expect(trade.outcome).toBe('Unknown');
    });
  });

  describe('scanRecentTrades — empty result', () => {
    it('returns 0 when no logs found', async () => {
      polygonClient.getLogs.mockResolvedValue([]);
      const count = await service.scanRecentTrades();
      expect(count).toBe(0);
    });
  });
});
