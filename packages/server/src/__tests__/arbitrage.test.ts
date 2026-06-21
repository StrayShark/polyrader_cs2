import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@polyrader/infra', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  LLMRepository: vi.fn().mockImplementation(() => ({
    getMatch: vi.fn(),
    getBets: vi.fn(),
  })),
}));

vi.mock('../services/market-service', () => ({
  MarketService: vi.fn().mockImplementation(() => ({
    getMarkets: vi.fn(),
    getMarket: vi.fn(),
  })),
}));

vi.mock('@polyrader/core', () => ({
  SignalComparisonEngine: vi.fn().mockImplementation(() => ({
    compareSignals: vi.fn(),
    rankByDeviation: vi.fn(),
    getSignificantDeviations: vi.fn(),
  })),
  PredictionEngine: vi.fn().mockImplementation(() => ({
    predict: vi.fn(),
  })),
}));

import { SignalService } from '../services/signal-service';
import { cacheGet, cacheSet } from '@polyrader/infra';
import type { Market } from '@polyrader/core';

function makeMarket(overrides: Partial<Market>): Market {
  return {
    conditionId: overrides.conditionId ?? 'c1',
    slug: overrides.slug ?? 'slug-1',
    question: overrides.question ?? 'Test Market?',
    description: overrides.description ?? '',
    outcomes: overrides.outcomes ?? ['Yes', 'No'],
    outcomePrices: overrides.outcomePrices ?? ['0.5', '0.5'],
    clobTokenIds: overrides.clobTokenIds,
    volume: overrides.volume ?? 1000,
    volume24h: overrides.volume24h ?? 500,
    liquidity: overrides.liquidity ?? 100,
    endDate: overrides.endDate ?? '',
    startDate: overrides.startDate ?? '',
    status: overrides.status ?? 'active',
    tags: overrides.tags ?? [],
    match: overrides.match,
  };
}

describe('SignalService.getArbitrageOpportunities', () => {
  let service: SignalService;
  let marketService: { getMarkets: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SignalService();
    marketService = (service as unknown as { marketService: typeof marketService }).marketService;
  });

  it('returns cached result when available', async () => {
    const cached = { opportunities: [{ marketSlug: 's1', question: 'Q', type: 'yes_no_spread' as const, profitPct: 5, details: 'd' }] };
    vi.mocked(cacheGet).mockResolvedValue(cached as never);

    const result = await service.getArbitrageOpportunities();

    expect(result).toBe(cached);
    expect(marketService.getMarkets).not.toHaveBeenCalled();
  });

  it('detects yes_no_spread arbitrage when Yes+No < 1', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'arb-1', outcomePrices: ['0.4', '0.5'] }),  // sum = 0.9 → arb
      makeMarket({ slug: 'normal-1', outcomePrices: ['0.6', '0.5'] }), // sum = 1.1 → no arb
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].type).toBe('yes_no_spread');
    expect(result.opportunities[0].marketSlug).toBe('arb-1');
    expect(result.opportunities[0].profitPct).toBeCloseTo(10, 1); // (1 - 0.9) * 100
  });

  it('detects cross_market_spread when same-tag markets have price difference > 2%', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'm1', outcomePrices: ['0.7', '0.3'], tags: ['IEM Katowice'] }),
      makeMarket({ slug: 'm2', outcomePrices: ['0.5', '0.5'], tags: ['IEM Katowice'] }),
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    const crossMarket = result.opportunities.find((o) => o.type === 'cross_market_spread');
    expect(crossMarket).toBeDefined();
    expect(crossMarket!.profitPct).toBeCloseTo(20, 1); // |0.7 - 0.5| * 100
  });

  it('does not detect cross_market_spread when price difference <= 2%', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'm1', outcomePrices: ['0.51', '0.49'], tags: ['event'] }),
      makeMarket({ slug: 'm2', outcomePrices: ['0.50', '0.50'], tags: ['event'] }),
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    const crossMarket = result.opportunities.find((o) => o.type === 'cross_market_spread');
    expect(crossMarket).toBeUndefined();
  });

  it('returns empty opportunities when no arbitrage exists', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'm1', outcomePrices: ['0.6', '0.4'] }),  // sum = 1.0 → no arb
      makeMarket({ slug: 'm2', outcomePrices: ['0.5', '0.5'], tags: ['event'] }),
      makeMarket({ slug: 'm3', outcomePrices: ['0.5', '0.5'], tags: ['event'] }),
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    expect(result.opportunities).toHaveLength(0);
  });

  it('sorts opportunities by profitPct descending', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'small', outcomePrices: ['0.47', '0.5'], tags: ['event'] }),  // sum = 0.97 → 3% arb
      makeMarket({ slug: 'big', outcomePrices: ['0.3', '0.5'], tags: ['event2'] }),    // sum = 0.8 → 20% arb
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    expect(result.opportunities.length).toBeGreaterThanOrEqual(2);
    expect(result.opportunities[0].profitPct).toBeGreaterThanOrEqual(result.opportunities[1].profitPct);
  });

  it('caches the result', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    marketService.getMarkets.mockResolvedValue([makeMarket({ outcomePrices: ['0.4', '0.5'] })]);

    await service.getArbitrageOpportunities();

    expect(cacheSet).toHaveBeenCalled();
  });

  it('returns empty array on error', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    marketService.getMarkets.mockRejectedValue(new Error('API down'));

    const result = await service.getArbitrageOpportunities();

    expect(result.opportunities).toEqual([]);
  });

  it('skips markets with fewer than 2 outcome prices', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    const markets = [
      makeMarket({ slug: 'm1', outcomePrices: ['0.4'] }),  // only 1 price → skipped
    ];
    marketService.getMarkets.mockResolvedValue(markets);

    const result = await service.getArbitrageOpportunities();

    expect(result.opportunities).toHaveLength(0);
  });
});
