import { describe, it, expect } from 'vitest';
import { WhaleScoringEngine } from './whale-scoring-engine';
import type { WhaleTrade, CorrelationData } from '../types/index';

function makeTrade(overrides: Partial<WhaleTrade> = {}): WhaleTrade {
  return {
    txHash: '0x' + Math.random().toString(16).slice(2, 10),
    marketId: 'market-1',
    outcome: 'Yes',
    amount: 1000,
    price: 0.55,
    timestamp: new Date().toISOString(),
    type: 'buy',
    ...overrides,
  };
}

describe('WhaleScoringEngine', () => {
  const engine = new WhaleScoringEngine();

  describe('scoreWhale', () => {
    it('should return a Whale with all score dimensions', () => {
      const trades = Array.from({ length: 10 }, (_, i) =>
        makeTrade({ amount: 1000 + i * 100, timestamp: new Date(Date.now() - i * 3600000).toISOString() }),
      );

      const whale = engine.scoreWhale('0xabc', trades, 50000, 5, 0.6, 2500);

      expect(whale.address).toBe('0xabc');
      expect(whale.totalVolume).toBe(50000);
      expect(whale.totalPositions).toBe(10);
      expect(whale.activePositions).toBe(5);
      expect(whale.winRate).toBe(0.6);
      expect(whale.pnl).toBe(2500);
      expect(whale.suspiciousScore.total).toBeGreaterThanOrEqual(0);
      expect(whale.suspiciousScore.total).toBeLessThanOrEqual(100);
      expect(whale.suspiciousScore.volumeAnomaly).toBeGreaterThanOrEqual(0);
      expect(whale.suspiciousScore.timingAnomaly).toBeGreaterThanOrEqual(0);
      expect(whale.suspiciousScore.patternAnomaly).toBeGreaterThanOrEqual(0);
      expect(whale.suspiciousScore.correlationAnomaly).toBe(0); // no correlation data provided
      expect(whale.recentTrades.length).toBeLessThanOrEqual(20);
    });

    it('should detect volume anomaly from large trades', () => {
      const trades = [
        makeTrade({ amount: 100 }),
        makeTrade({ amount: 100 }),
        makeTrade({ amount: 100 }),
        makeTrade({ amount: 100 }),
        makeTrade({ amount: 50000 }), // huge spike
      ];

      const whale = engine.scoreWhale('0xabc', trades, 50000, 1, 0.5, 0);

      expect(whale.suspiciousScore.volumeAnomaly).toBeGreaterThan(0);
    });

    it('should return low volume anomaly for consistent trading', () => {
      const trades = Array.from({ length: 20 }, () => makeTrade({ amount: 100 }));

      const whale = engine.scoreWhale('0xabc', trades, 2000, 1, 0.5, 0);

      // Consistent small trades → moderate volume anomaly (not zero due to spike ratio formula)
      expect(whale.suspiciousScore.volumeAnomaly).toBeLessThanOrEqual(60);
    });

    it('should detect timing anomaly from clustered trades', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ timestamp: new Date(now).toISOString() }),
        makeTrade({ timestamp: new Date(now + 10000).toISOString() }),
        makeTrade({ timestamp: new Date(now + 20000).toISOString() }),
        makeTrade({ timestamp: new Date(now + 30000).toISOString() }),
        makeTrade({ timestamp: new Date(now + 40000).toISOString() }),
      ];

      const whale = engine.scoreWhale('0xabc', trades, 5000, 1, 0.5, 0);

      expect(whale.suspiciousScore.timingAnomaly).toBeGreaterThan(0);
    });

    it('should return low timing anomaly for spread-out trades', () => {
      const trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ timestamp: new Date(Date.now() - i * 86400000).toISOString() }),
      );

      const whale = engine.scoreWhale('0xabc', trades, 5000, 1, 0.5, 0);

      expect(whale.suspiciousScore.timingAnomaly).toBe(0);
    });

    it('should detect pattern anomaly from alternating buy/sell', () => {
      const trades = [
        makeTrade({ type: 'buy' }),
        makeTrade({ type: 'sell' }),
        makeTrade({ type: 'buy' }),
        makeTrade({ type: 'sell' }),
        makeTrade({ type: 'buy' }),
        makeTrade({ type: 'sell' }),
      ];

      const whale = engine.scoreWhale('0xabc', trades, 6000, 1, 0.5, 0);

      expect(whale.suspiciousScore.patternAnomaly).toBeGreaterThan(0);
    });

    it('should detect pattern anomaly from repeated same amounts', () => {
      const trades = Array.from({ length: 10 }, () => makeTrade({ amount: 1000 }));

      const whale = engine.scoreWhale('0xabc', trades, 10000, 1, 0.5, 0);

      expect(whale.suspiciousScore.patternAnomaly).toBeGreaterThan(0);
    });

    it('should return low pattern anomaly for diverse trading', () => {
      const trades = Array.from({ length: 10 }, (_, i) =>
        makeTrade({ amount: 1000 + i * 137, type: i % 3 === 0 ? 'sell' : 'buy' }),
      );

      const whale = engine.scoreWhale('0xabc', trades, 15000, 1, 0.5, 0);

      // Some pattern anomaly from alternating types, but less than heavy wash trading
      expect(whale.suspiciousScore.patternAnomaly).toBeLessThanOrEqual(50);
    });

    it('should handle empty trades array', () => {
      const whale = engine.scoreWhale('0xabc', [], 0, 0, 0, 0);

      expect(whale.suspiciousScore.total).toBe(0);
      expect(whale.suspiciousScore.volumeAnomaly).toBe(0);
      expect(whale.suspiciousScore.timingAnomaly).toBe(0);
      expect(whale.suspiciousScore.patternAnomaly).toBe(0);
    });

    it('should cap all scores at 100', () => {
      const trades = Array.from({ length: 100 }, () =>
        makeTrade({ amount: 1000000, type: 'buy' }),
      );

      const whale = engine.scoreWhale('0xabc', trades, 100000000, 50, 0.8, 100000);

      expect(whale.suspiciousScore.total).toBeLessThanOrEqual(100);
      expect(whale.suspiciousScore.volumeAnomaly).toBeLessThanOrEqual(100);
      expect(whale.suspiciousScore.timingAnomaly).toBeLessThanOrEqual(100);
      expect(whale.suspiciousScore.patternAnomaly).toBeLessThanOrEqual(100);
    });
  });

  describe('scoreWhale — correlation anomaly', () => {
    const trades = [makeTrade()];

    it('returns 0 when no correlation data is provided (backward compat)', () => {
      const whale = engine.scoreWhale('0xabc', trades, 1000, 1, 0.5, 0);
      expect(whale.suspiciousScore.correlationAnomaly).toBe(0);
    });

    it('returns 0 when correlation data has 0 correlated addresses', () => {
      const data: CorrelationData = {
        correlatedAddressCount: 0,
        marketOverlapRatio: 0.5,
        avgCorrelatedSuspicion: 50,
      };
      const whale = engine.scoreWhale('0xabc', trades, 1000, 1, 0.5, 0, data);
      expect(whale.suspiciousScore.correlationAnomaly).toBe(0);
    });

    it('scores above 0 when correlated addresses exist', () => {
      const data: CorrelationData = {
        correlatedAddressCount: 3,
        marketOverlapRatio: 0.5,
        avgCorrelatedSuspicion: 0,
      };
      const whale = engine.scoreWhale('0xabc', trades, 1000, 1, 0.5, 0, data);
      expect(whale.suspiciousScore.correlationAnomaly).toBeGreaterThan(0);
    });

    it('increases score with more correlated addresses', () => {
      const few: CorrelationData = {
        correlatedAddressCount: 2,
        marketOverlapRatio: 0,
        avgCorrelatedSuspicion: 0,
      };
      const many: CorrelationData = {
        correlatedAddressCount: 8,
        marketOverlapRatio: 0,
        avgCorrelatedSuspicion: 0,
      };
      const w1 = engine.scoreWhale('0x1', trades, 1000, 1, 0.5, 0, few);
      const w2 = engine.scoreWhale('0x2', trades, 1000, 1, 0.5, 0, many);
      expect(w2.suspiciousScore.correlationAnomaly).toBeGreaterThan(w1.suspiciousScore.correlationAnomaly);
    });

    it('increases score with higher market overlap', () => {
      const lowOverlap: CorrelationData = {
        correlatedAddressCount: 3,
        marketOverlapRatio: 0.2,
        avgCorrelatedSuspicion: 0,
      };
      const highOverlap: CorrelationData = {
        correlatedAddressCount: 3,
        marketOverlapRatio: 1.0,
        avgCorrelatedSuspicion: 0,
      };
      const w1 = engine.scoreWhale('0x1', trades, 1000, 1, 0.5, 0, lowOverlap);
      const w2 = engine.scoreWhale('0x2', trades, 1000, 1, 0.5, 0, highOverlap);
      expect(w2.suspiciousScore.correlationAnomaly).toBeGreaterThan(w1.suspiciousScore.correlationAnomaly);
    });

    it('increases score when correlated addresses are themselves suspicious', () => {
      const clean: CorrelationData = {
        correlatedAddressCount: 3,
        marketOverlapRatio: 0,
        avgCorrelatedSuspicion: 0,
      };
      const suspicious: CorrelationData = {
        correlatedAddressCount: 3,
        marketOverlapRatio: 0,
        avgCorrelatedSuspicion: 80,
      };
      const w1 = engine.scoreWhale('0x1', trades, 1000, 1, 0.5, 0, clean);
      const w2 = engine.scoreWhale('0x2', trades, 1000, 1, 0.5, 0, suspicious);
      expect(w2.suspiciousScore.correlationAnomaly).toBeGreaterThan(w1.suspiciousScore.correlationAnomaly);
    });

    it('caps correlation anomaly at 100', () => {
      const max: CorrelationData = {
        correlatedAddressCount: 50,
        marketOverlapRatio: 1.0,
        avgCorrelatedSuspicion: 100,
      };
      const whale = engine.scoreWhale('0xabc', trades, 1000, 1, 0.5, 0, max);
      expect(whale.suspiciousScore.correlationAnomaly).toBeLessThanOrEqual(100);
    });
  });

  describe('rankWhales', () => {
    it('should sort whales by suspicious score descending', () => {
      const trades = [makeTrade()];
      const whale1 = engine.scoreWhale('0x111', trades, 1000, 1, 0.5, 0);
      const whale2 = engine.scoreWhale('0x222', trades, 1000, 1, 0.5, 0);
      const whale3 = engine.scoreWhale('0x333', trades, 1000, 1, 0.5, 0);

      // Manually set scores for deterministic test
      whale1.suspiciousScore.total = 80;
      whale2.suspiciousScore.total = 30;
      whale3.suspiciousScore.total = 95;

      const ranked = engine.rankWhales([whale1, whale2, whale3]);

      expect(ranked[0].address).toBe('0x333');
      expect(ranked[1].address).toBe('0x111');
      expect(ranked[2].address).toBe('0x222');
    });
  });

  describe('getHighRiskWhales', () => {
    it('should filter whales above threshold', () => {
      const trades = [makeTrade()];
      const whale1 = engine.scoreWhale('0x111', trades, 1000, 1, 0.5, 0);
      const whale2 = engine.scoreWhale('0x222', trades, 1000, 1, 0.5, 0);
      const whale3 = engine.scoreWhale('0x333', trades, 1000, 1, 0.5, 0);

      whale1.suspiciousScore.total = 80;
      whale2.suspiciousScore.total = 30;
      whale3.suspiciousScore.total = 55;

      const highRisk = engine.getHighRiskWhales([whale1, whale2, whale3], 50);

      expect(highRisk).toHaveLength(2);
      expect(highRisk.map((w) => w.address)).toContain('0x111');
      expect(highRisk.map((w) => w.address)).toContain('0x333');
    });

    it('should use default threshold of 50', () => {
      const trades = [makeTrade()];
      const whale1 = engine.scoreWhale('0x111', trades, 1000, 1, 0.5, 0);
      whale1.suspiciousScore.total = 60;

      const highRisk = engine.getHighRiskWhales([whale1]);

      expect(highRisk).toHaveLength(1);
    });

    it('should return empty array when no whales meet threshold', () => {
      const trades = [makeTrade()];
      const whale1 = engine.scoreWhale('0x111', trades, 1000, 1, 0.5, 0);
      whale1.suspiciousScore.total = 20;

      const highRisk = engine.getHighRiskWhales([whale1], 50);

      expect(highRisk).toHaveLength(0);
    });
  });
});
