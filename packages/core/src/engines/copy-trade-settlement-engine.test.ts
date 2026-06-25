import { describe, expect, it } from 'vitest';
import { CopyTradeSettlementEngine } from './copy-trade-settlement-engine';
import type { CopyTrade } from '../types/index';

describe('CopyTradeSettlementEngine', () => {
  const engine = new CopyTradeSettlementEngine();
  const tokenMap = new Map([
    ['token-yes', { outcomeLabel: 'Yes', resolvedOutcome: 'Yes', conditionId: 'cond-1' }],
  ]);

  const baseTrade: CopyTrade = {
    id: 't1',
    signalId: 's1',
    mode: 'paper',
    tokenId: 'token-yes',
    side: 'buy',
    amount: 100,
    price: 0.5,
    status: 'filled',
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('returns pending when market is unresolved', () => {
    const result = engine.settleTrade(baseTrade, new Map());
    expect(result.settlementStatus).toBe('pending');
    expect(result.pnl).toBe(0);
  });

  it('settles winning buy with positive pnl', () => {
    const result = engine.settleTrade(baseTrade, tokenMap, 'Yes');
    expect(result.settlementStatus).toBe('won');
    expect(result.pnl).toBe(100);
  });

  it('settles losing buy with negative pnl', () => {
    const losingMap = new Map([
      ['token-yes', { outcomeLabel: 'Yes', resolvedOutcome: 'No', conditionId: 'cond-1' }],
    ]);
    const result = engine.settleTrade(baseTrade, losingMap, 'Yes');
    expect(result.settlementStatus).toBe('lost');
    expect(result.pnl).toBe(-100);
  });
});
