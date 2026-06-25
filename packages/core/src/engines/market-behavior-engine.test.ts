import { describe, expect, it } from 'vitest';
import { MarketBehaviorEngine } from './market-behavior-engine';

describe('MarketBehaviorEngine', () => {
  const engine = new MarketBehaviorEngine();

  it('keeps probability near market consensus with no extra data', () => {
    const result = engine.analyze({
      marketProb: 0.55,
      priceHistory: [],
    });

    expect(result.probability).toBeCloseTo(0.55, 2);
    expect(result.direction).toBe('neutral');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('lowers probability when price is overbought versus the rolling mean', () => {
    const result = engine.analyze({
      marketProb: 0.8,
      priceHistory: [
        { timestamp: '2026-01-01T00:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T01:00:00Z', price: 0.51 },
        { timestamp: '2026-01-01T02:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T03:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T04:00:00Z', price: 0.51 },
        { timestamp: '2026-01-01T05:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T06:00:00Z', price: 0.8 },
      ],
    });

    expect(result.zScore).toBeGreaterThan(1);
    expect(result.meanReversionProb).toBeLessThan(0.8);
  });

  it('raises probability when whale flow strongly buys the primary outcome', () => {
    const result = engine.analyze({
      marketProb: 0.5,
      priceHistory: [],
      primaryOutcome: 'Team A',
      whaleTrades: [
        {
          txHash: '0x1',
          marketId: 'm1',
          outcome: 'Team A',
          amount: 10_000,
          price: 0.5,
          timestamp: '2026-01-01T00:00:00Z',
          type: 'buy',
        },
      ],
    });

    expect(result.whaleAdjustedProb).toBeGreaterThan(0.5);
  });

  it('detects order book concentration risk', () => {
    const result = engine.analyze({
      marketProb: 0.5,
      priceHistory: [],
      orderBook: {
        bids: [{ price: 0.5, size: 10_000 }],
        asks: [{ price: 0.51, size: 50 }],
      },
    });

    expect(result.concentrationRisk).toBeGreaterThan(0.5);
  });

  it('computes order book pressure metrics', () => {
    const result = engine.analyze({
      marketProb: 0.5,
      priceHistory: [],
      orderBook: {
        bids: [
          { price: 0.52, size: 5_000 },
          { price: 0.51, size: 4_000 },
        ],
        asks: [
          { price: 0.54, size: 500 },
          { price: 0.55, size: 500 },
        ],
      },
    });

    expect(result.orderBookImbalance).toBeGreaterThan(0);
    expect(result.spread).toBeCloseTo(0.02, 2);
    expect(result.topDepth).toBeGreaterThan(0);
  });

  it('weights profitable low-suspicion whales as smart money', () => {
    const result = engine.analyze({
      marketId: 'm1',
      marketProb: 0.5,
      priceHistory: [],
      primaryOutcome: 'Team A',
      whales: [
        {
          address: '0xsmart',
          totalVolume: 250_000,
          totalPositions: 20,
          activePositions: 8,
          winRate: 0.68,
          pnl: 45_000,
          suspiciousScore: {
            total: 5,
            volumeAnomaly: 5,
            timingAnomaly: 5,
            patternAnomaly: 5,
            correlationAnomaly: 5,
          },
          recentTrades: [
            {
              txHash: '0x2',
              marketId: 'm1',
              outcome: 'Team A',
              amount: 20_000,
              price: 0.5,
              timestamp: '2026-01-01T00:00:00Z',
              type: 'buy',
            },
          ],
          lastActive: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(result.smartMoneyProb).toBeGreaterThan(0.5);
    expect(result.whaleAdjustedProb).toBeGreaterThan(0.5);
  });

  it('suppresses mean reversion when capital flow confirms the move', () => {
    const result = engine.analyze({
      marketProb: 0.8,
      liquidity: 20_000,
      marketVolume: 50_000,
      priceHistory: [
        { timestamp: '2026-01-01T00:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T01:00:00Z', price: 0.51 },
        { timestamp: '2026-01-01T02:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T03:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T04:00:00Z', price: 0.51 },
        { timestamp: '2026-01-01T05:00:00Z', price: 0.5 },
        { timestamp: '2026-01-01T06:00:00Z', price: 0.8 },
      ],
      orderBook: {
        bids: [{ price: 0.79, size: 20_000 }],
        asks: [{ price: 0.81, size: 1_000 }],
      },
    });

    expect(result.meanReversionSuppressed).toBe(true);
    expect(result.meanReversionProb).toBeGreaterThan(0.7);
  });

  it('uses holder concentration and directional bias as a behavior signal', () => {
    const result = engine.analyze({
      marketProb: 0.5,
      priceHistory: [],
      primaryOutcome: 'Yes',
      holders: [
        { address: '0x1', outcome: 'Yes', shares: 10_000, value: 6_000 },
        { address: '0x2', outcome: 'Yes', shares: 5_000, value: 3_000 },
        { address: '0x3', outcome: 'No', shares: 500, value: 300 },
      ],
    });

    expect(result.holderWeightedProb).toBeGreaterThan(0.5);
    expect(result.holderDirectionalBias).toBeGreaterThan(0);
    expect(result.holderConcentrationRisk).toBeGreaterThan(0);
    expect(result.topHolders).toHaveLength(3);
  });
});
