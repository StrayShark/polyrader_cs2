import { describe, it, expect } from 'vitest';
import { CopySignalEngine } from './copy-signal-engine';
import type { WalletCopyConfig } from '../types/index';

const baseConfig: WalletCopyConfig = {
  enabled: true,
  mode: 'paper',
  copyRatio: 0.1,
  maxOrderUsd: 200,
  minLeaderTradeUsd: 500,
  maxSlippage: 0.05,
  cs2Only: true,
  minLeaderWinRate: 0.55,
  minLeaderSamples: 10,
  dailyCapUsd: 2000,
  requireUserConfirm: true,
  minMarketVolumeShare: 0.02,
  minMarketVolumeUsd: 5000,
};

describe('CopySignalEngine', () => {
  const engine = new CopySignalEngine();

  const baseInput = {
    config: baseConfig,
    leaderAmount: 1000,
    leaderPrice: 0.55,
    leaderWinRate: 0.65,
    leaderSettledBets: 20,
    side: 'buy' as const,
    isCs2Market: true,
    marketVolumeUsd: 20000,
    dailyCopiedUsd: 0,
  };

  it('computes mirror size from copy ratio', () => {
    const result = engine.computeMirrorSize(baseInput);
    expect(result.accepted).toBe(true);
    expect(result.amount).toBe(100);
  });

  it('rejects non-CS2 markets when cs2Only is enabled', () => {
    const result = engine.computeMirrorSize({ ...baseInput, isCs2Market: false });
    expect(result.accepted).toBe(false);
  });

  it('rejects when leader win rate is too low', () => {
    const result = engine.computeMirrorSize({ ...baseInput, leaderWinRate: 0.4 });
    expect(result.accepted).toBe(false);
  });

  it('rejects when trade share of market volume is too low', () => {
    const result = engine.computeMirrorSize({
      ...baseInput,
      leaderAmount: 600,
      marketVolumeUsd: 100000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('% of market volume');
  });

  it('accepts when trade share meets minimum threshold', () => {
    const result = engine.computeMirrorSize({
      ...baseInput,
      leaderAmount: 2000,
      marketVolumeUsd: 50000,
    });
    expect(result.accepted).toBe(true);
  });

  it('caps order at maxOrderUsd', () => {
    const result = engine.computeMirrorSize({
      ...baseInput,
      leaderAmount: 10000,
      marketVolumeUsd: 200000,
      config: { ...baseConfig, copyRatio: 0.5 },
    });
    expect(result.amount).toBe(200);
  });
});
