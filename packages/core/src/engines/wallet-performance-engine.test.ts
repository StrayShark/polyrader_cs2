import { describe, it, expect } from 'vitest';
import { WalletPerformanceEngine } from './wallet-performance-engine';
import type { WhaleTrade } from '../types/index';

describe('WalletPerformanceEngine', () => {
  const engine = new WalletPerformanceEngine();

  const tokenMap = engine.buildTokenResolutionMap([
    {
      conditionId: '0xmarket1',
      clobTokenIds: ['token-yes', 'token-no'],
      outcomes: ['Yes', 'No'],
      resolvedOutcome: 'Yes',
    },
  ]);

  it('builds token resolution map from resolved markets', () => {
    expect(tokenMap.get('token-yes')?.outcomeLabel).toBe('Yes');
    expect(tokenMap.get('token-no')?.outcomeLabel).toBe('No');
    expect(tokenMap.get('token-yes')?.resolvedOutcome).toBe('Yes');
  });

  it('computes win rate and pnl for settled buys', () => {
    const trades: WhaleTrade[] = [
      {
        txHash: '0x1',
        marketId: 'token-yes',
        outcome: 'Yes',
        amount: 100,
        price: 0.5,
        timestamp: '2026-06-01T00:00:00Z',
        type: 'buy',
      },
      {
        txHash: '0x2',
        marketId: 'token-no',
        outcome: 'No',
        amount: 50,
        price: 0.4,
        timestamp: '2026-06-02T00:00:00Z',
        type: 'buy',
      },
    ];

    const metrics = engine.computeAddressPerformance('0xabc', trades, tokenMap);
    expect(metrics.settledBets).toBe(2);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.totalWagered).toBe(150);
    expect(metrics.totalPnl).toBeCloseTo(50, 0); // +100 win pnl, -50 loss
  });

  it('ignores sells and unresolved markets', () => {
    const trades: WhaleTrade[] = [
      {
        txHash: '0x3',
        marketId: 'token-yes',
        outcome: 'Yes',
        amount: 100,
        price: 0.6,
        timestamp: '2026-06-03T00:00:00Z',
        type: 'sell',
      },
      {
        txHash: '0x4',
        marketId: 'unknown-token',
        outcome: 'Yes',
        amount: 80,
        price: 0.55,
        timestamp: '2026-06-04T00:00:00Z',
        type: 'buy',
      },
    ];

    const metrics = engine.computeAddressPerformance('0xdef', trades, tokenMap);
    expect(metrics.settledBets).toBe(0);
    expect(metrics.pendingTrades).toBe(1);
  });

  it('ranks wallets by win rate with minimum sample filter', () => {
    const ranked = engine.rankByWinRate(
      [
        { address: 'a', settledBets: 3, wins: 2, losses: 1, winRate: 0.67, totalPnl: 10, totalWagered: 100, roi: 0.1, pendingTrades: 0 },
        { address: 'b', settledBets: 10, wins: 7, losses: 3, winRate: 0.7, totalPnl: 50, totalWagered: 500, roi: 0.1, pendingTrades: 0 },
        { address: 'c', settledBets: 8, wins: 6, losses: 2, winRate: 0.75, totalPnl: 30, totalWagered: 200, roi: 0.15, pendingTrades: 0 },
      ],
      { minSettledBets: 5 },
    );

    expect(ranked.map((m) => m.address)).toEqual(['c', 'b']);
  });
});
