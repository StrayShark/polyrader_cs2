import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccountStatus: vi.fn(),
  getBalanceAllowance: vi.fn(),
  getOpenOrders: vi.fn(),
  getAuthenticatedTrades: vi.fn(),
  getTotalValue: vi.fn(),
  getCurrentPositions: vi.fn(),
  getActivity: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock('@polyrader/infra', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  PolymarketClobClient: vi.fn().mockImplementation(() => ({
    getAccountStatus: mocks.getAccountStatus,
    getBalanceAllowance: mocks.getBalanceAllowance,
    getOpenOrders: mocks.getOpenOrders,
    getAuthenticatedTrades: mocks.getAuthenticatedTrades,
  })),
  PolymarketDataClient: vi.fn().mockImplementation(() => ({
    getTotalValue: mocks.getTotalValue,
    getCurrentPositions: mocks.getCurrentPositions,
    getActivity: mocks.getActivity,
    getTrades: mocks.getTrades,
  })),
}));

import { cacheGet } from '@polyrader/infra';
import { PolymarketAccountService } from '../services/polymarket-account-service';

describe('PolymarketAccountService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cacheGet).mockResolvedValue(null);
    mocks.getTotalValue.mockResolvedValue(123.45);
    mocks.getCurrentPositions.mockResolvedValue([]);
    mocks.getActivity.mockResolvedValue([]);
    mocks.getTrades.mockResolvedValue([]);
    mocks.getBalanceAllowance.mockResolvedValue({ assetType: 'COLLATERAL', balance: 50 });
    mocks.getOpenOrders.mockResolvedValue([]);
    mocks.getAuthenticatedTrades.mockResolvedValue([]);
  });

  it('returns public-only status when address is missing', async () => {
    mocks.getAccountStatus.mockReturnValue({
      hasApiCredentials: true,
      hasAddress: false,
      canReadPrivate: false,
      message: 'missing address',
    });

    const result = await new PolymarketAccountService().getOverview();

    expect(result.status.canReadPrivate).toBe(false);
    expect(result.totalPositionValue).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(mocks.getTotalValue).not.toHaveBeenCalled();
    expect(mocks.getBalanceAllowance).not.toHaveBeenCalled();
  });

  it('combines public positions with private balances and open orders', async () => {
    mocks.getAccountStatus.mockReturnValue({
      hasApiCredentials: true,
      hasAddress: true,
      address: '0xabc',
      canReadPrivate: true,
    });
    mocks.getCurrentPositions.mockResolvedValue([{ marketId: 'm1', question: 'Q', outcome: 'Yes', shares: 10, value: 7 }]);
    mocks.getOpenOrders.mockResolvedValue([{ id: 'o1', side: 'buy', price: 0.5, originalSize: 10, sizeMatched: 0, remainingSize: 10 }]);

    const result = await new PolymarketAccountService().getOverview();

    expect(result.totalPositionValue).toBe(123.45);
    expect(result.positions).toHaveLength(1);
    expect(result.balances).toHaveLength(1);
    expect(result.openOrders).toHaveLength(1);
    expect(result.diagnostics.every((diagnostic) => diagnostic.ok)).toBe(true);
    expect(mocks.getAuthenticatedTrades).toHaveBeenCalledWith(100);
  });

  it('reports non-sensitive diagnostics when account data sources fail', async () => {
    mocks.getAccountStatus.mockReturnValue({
      hasApiCredentials: true,
      hasAddress: true,
      address: '0xabc',
      canReadPrivate: true,
    });
    mocks.getTotalValue.mockRejectedValue(new Error('fetch failed'));
    mocks.getCurrentPositions.mockRejectedValue(new Error('fetch failed'));
    mocks.getActivity.mockRejectedValue(new Error('fetch failed'));
    mocks.getTrades.mockRejectedValue(new Error('fetch failed'));
    mocks.getBalanceAllowance.mockRejectedValue(new Error('fetch failed'));
    mocks.getOpenOrders.mockRejectedValue(new Error('fetch failed'));
    mocks.getAuthenticatedTrades.mockRejectedValue(new Error('fetch failed'));

    const result = await new PolymarketAccountService().getOverview();

    expect(result.status.canReadPrivate).toBe(true);
    expect(result.diagnostics).toHaveLength(7);
    expect(result.diagnostics.every((diagnostic) => !diagnostic.ok)).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.source)).toContain('data-api');
    expect(result.diagnostics.map((diagnostic) => diagnostic.source)).toContain('clob-api');
    expect(result.diagnostics[0].message).toBe('fetch failed');
  });
});
