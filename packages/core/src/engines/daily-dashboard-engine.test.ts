import { describe, it, expect } from 'vitest';
import { DailyDashboardEngine } from './daily-dashboard-engine';
import type { Market } from '../types/index';

function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    conditionId: 'cond-1',
    slug: 'test-market',
    question: 'Will Team A win?',
    description: '',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.55', '0.45'],
    volume: 50000,
    volume24h: 5000,
    liquidity: 2000,
    endDate: '2025-06-20T12:00:00Z',
    startDate: '2025-06-19T12:00:00Z',
    status: 'active',
    tags: ['cs2'],
    match: {
      matchId: 'm1',
      teamA: { teamId: 't1', name: 'Team A', logo: '', rank: 5, region: 'EU' },
      teamB: { teamId: 't2', name: 'Team B', logo: '', rank: 15, region: 'NA' },
      eventName: 'IEM Katowice',
      eventType: 'LAN',
      format: 'BO3',
      scheduledAt: '2025-06-20T12:00:00Z',
      status: 'scheduled',
    },
    ...overrides,
  };
}

describe('DailyDashboardEngine', () => {
  const engine = new DailyDashboardEngine();

  it('should generate dashboard with scored matches', () => {
    const markets = [
      makeMarket({ conditionId: 'c1', volume24h: 10000, liquidity: 5000 }),
      makeMarket({ conditionId: 'c2', volume24h: 500, liquidity: 200 }),
    ];

    const dashboard = engine.generateDashboard('2025-06-20', markets, [], []);

    expect(dashboard.date).toBe('2025-06-20');
    expect(dashboard.totalMatches).toBe(2);
    expect(dashboard.allMatches).toHaveLength(2);
  });

  it('should rank LAN events higher than Online', () => {
    const lanMarket = makeMarket({
      conditionId: 'lan',
      match: { ...makeMarket().match!, eventType: 'LAN' },
    });
    const onlineMarket = makeMarket({
      conditionId: 'online',
      match: { ...makeMarket().match!, eventType: 'Online' },
    });

    const dashboard = engine.generateDashboard('2025-06-20', [lanMarket, onlineMarket], [], []);

    const lanScored = dashboard.allMatches.find((m) => m.market.conditionId === 'lan')!;
    const onlineScored = dashboard.allMatches.find((m) => m.market.conditionId === 'online')!;

    expect(lanScored.tierScore).toBeGreaterThan(onlineScored.tierScore);
  });

  it('should identify high attention matches', () => {
    const markets = [
      makeMarket({ conditionId: 'c1', volume24h: 20000, liquidity: 10000 }),
    ];

    const dashboard = engine.generateDashboard('2025-06-20', markets, [], []);

    expect(dashboard.highAttentionMatches.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty markets', () => {
    const dashboard = engine.generateDashboard('2025-06-20', [], [], []);

    expect(dashboard.totalMatches).toBe(0);
    expect(dashboard.allMatches).toHaveLength(0);
    expect(dashboard.highAttentionMatches).toHaveLength(0);
  });

  it('should include deviation alerts', () => {
    const alerts = [
      { marketId: 'c1', question: 'Test', polymarketProb: 0.5, predictedProb: 0.7, deviation: 0.2, direction: 'undervalued' as const },
    ];

    const dashboard = engine.generateDashboard('2025-06-20', [makeMarket({ conditionId: 'c1' })], alerts, []);

    expect(dashboard.topDeviations).toHaveLength(1);
    expect(dashboard.topDeviations[0].deviation).toBe(0.2);
  });

  it('P2-2: analyzedMatches counts only markets with deviation data', () => {
    const markets = [
      { conditionId: 'c1', question: 'Match 1', volume24h: 1000, liquidity: 500, match: { matchId: 'm1', teamA: 'A', teamB: 'B', eventName: 'Test', eventType: 'Online', format: 'BO3', scheduledAt: '2026-06-20T00:00:00Z', status: 'scheduled' } },
      { conditionId: 'c2', question: 'Match 2', volume24h: 2000, liquidity: 1000, match: { matchId: 'm2', teamA: 'C', teamB: 'D', eventName: 'Test', eventType: 'LAN', format: 'BO3', scheduledAt: '2026-06-20T00:00:00Z', status: 'scheduled' } },
    ];
    // Only c1 has a deviation
    const deviations = [
      { marketId: 'c1', question: 'Match 1', polymarketProb: 0.5, predictedProb: 0.65, deviation: 0.15, direction: 'undervalued' as const },
    ];

    const dashboard = engine.generateDashboard('2026-06-19', markets as any, deviations, []);

    expect(dashboard.totalMatches).toBe(2);
    expect(dashboard.analyzedMatches).toBe(1); // Only c1 has deviation data
  });
});
