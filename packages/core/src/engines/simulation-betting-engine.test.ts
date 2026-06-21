import { describe, it, expect } from 'vitest';
import { SimulatedBettingEngine } from './simulated-betting-engine';
import type {
  LLMAnalysisResult,
  SimulationConfig,
  SimulatedBet,
  LLMProvider,
} from '../types/index';

function makeConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    id: 'default',
    enabled: true,
    initialCapital: 10000,
    betStrategy: 'fixed',
    betAmount: 100,
    maxBetFraction: 0.05,
    minConfidence: 0.6,
    minEdge: 0.05,
    oddsSource: 'market',
    participatingProviders: ['openai', 'anthropic'],
    autoSettle: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<LLMAnalysisResult> = {}): LLMAnalysisResult {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    winProbability: { teamA: 0.7, teamB: 0.3 },
    confidence: 0.8,
    reasoning: 'Team A is stronger',
    keyFactors: ['rank', 'form'],
    riskAssessment: 'low',
    latency: 500,
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    ...overrides,
  };
}

describe('SimulatedBettingEngine.placeBetFromAnalysis', () => {
  const engine = new SimulatedBettingEngine();
  const teamA = 'Natus Vincere';
  const teamB = 'FaZe Clan';

  it('returns null when confidence is below threshold', () => {
    const config = makeConfig({ minConfidence: 0.9 });
    const analysis = makeAnalysis({ confidence: 0.5 });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).toBeNull();
  });

  it('returns null when edge is below threshold', () => {
    const config = makeConfig({ minEdge: 0.3 });
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.6, teamB: 0.4 },
      confidence: 0.8,
    });
    // marketProb = 0.55, llmProb = 0.6, edge = 0.05 < 0.3
    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.55, teamA, teamB);
    expect(bet).toBeNull();
  });

  it('returns null when analysis has an error', () => {
    const config = makeConfig();
    const analysis = makeAnalysis({ error: 'API timeout' });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).toBeNull();
  });

  it('generates correct amount with fixed strategy', () => {
    const config = makeConfig({ betStrategy: 'fixed', betAmount: 250 });
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.7, teamB: 0.3 },
      confidence: 0.85,
    });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).not.toBeNull();
    expect(bet!.amount).toBe(250);
    expect(bet!.team).toBe(teamA);
    expect(bet!.provider).toBe('openai');
    expect(bet!.result).toBe('pending');
  });

  it('generates reasonable amount with kelly strategy', () => {
    const config = makeConfig({
      betStrategy: 'kelly',
      initialCapital: 10000,
      maxBetFraction: 0.1,
    });
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.7, teamB: 0.3 },
      confidence: 0.85,
    });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).not.toBeNull();
    // kelly fraction = (0.7 * 2 - 1) / (2 - 1) = 0.4, capped at 0.1
    // amount = max(10, round(10000 * 0.1)) = 1000
    expect(bet!.amount).toBe(1000);
    expect(bet!.amount).toBeGreaterThanOrEqual(10);
  });

  it('calculates odds correctly with market odds source', () => {
    const config = makeConfig({ oddsSource: 'market' });
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.7, teamB: 0.3 },
      confidence: 0.85,
    });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).not.toBeNull();
    // market odds = 1 / 0.5 = 2.0
    expect(bet!.odds).toBeCloseTo(2.0, 5);
  });

  it('calculates odds correctly with llm_inverse odds source', () => {
    const config = makeConfig({ oddsSource: 'llm_inverse' });
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.7, teamB: 0.3 },
      confidence: 0.85,
    });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.5, teamA, teamB);
    expect(bet).not.toBeNull();
    // llm_inverse odds = 1 / 0.7 ≈ 1.4286
    expect(bet!.odds).toBeCloseTo(1 / 0.7, 5);
  });

  it('bets on team B when team B has higher probability', () => {
    const config = makeConfig();
    const analysis = makeAnalysis({
      winProbability: { teamA: 0.3, teamB: 0.7 },
      confidence: 0.85,
      provider: 'anthropic',
    });

    const bet = engine.placeBetFromAnalysis('match-1', analysis, config, 0.4, teamA, teamB);
    expect(bet).not.toBeNull();
    expect(bet!.team).toBe(teamB);
    expect(bet!.provider).toBe('anthropic');
  });
});

describe('SimulatedBettingEngine.calculateProviderStats', () => {
  const engine = new SimulatedBettingEngine();
  const provider: LLMProvider = 'openai';

  function makeBet(overrides: Partial<SimulatedBet> = {}): SimulatedBet {
    return {
      id: 'bet-1',
      matchId: 'match-1',
      provider: 'openai',
      team: 'Team A',
      amount: 100,
      odds: 2.0,
      result: 'pending',
      profitLoss: 0,
      placedAt: '2025-06-20T10:00:00Z',
      ...overrides,
    };
  }

  it('correctly calculates win rate, PnL, and ROI', () => {
    const bets: SimulatedBet[] = [
      makeBet({ id: 'b1', amount: 100, result: 'won', profitLoss: 100, settledAt: '2025-06-20T12:00:00Z' }),
      makeBet({ id: 'b2', amount: 100, result: 'won', profitLoss: 100, settledAt: '2025-06-21T12:00:00Z' }),
      makeBet({ id: 'b3', amount: 100, result: 'lost', profitLoss: -100, settledAt: '2025-06-22T12:00:00Z' }),
    ];

    const stats = engine.calculateProviderStats(provider, bets, 10000);

    expect(stats.totalBets).toBe(3);
    expect(stats.settledBets).toBe(3);
    expect(stats.wonBets).toBe(2);
    expect(stats.lostBets).toBe(1);
    expect(stats.pendingBets).toBe(0);
    expect(stats.winRate).toBeCloseTo(2 / 3, 4);
    expect(stats.totalStaked).toBe(300);
    expect(stats.totalPnl).toBe(100);
    expect(stats.roi).toBeCloseTo(100 / 300, 4);
    expect(stats.currentEquity).toBe(10100);
    expect(stats.initialCapital).toBe(10000);
  });

  it('returns zero values for empty data', () => {
    const stats = engine.calculateProviderStats(provider, [], 10000);

    expect(stats.totalBets).toBe(0);
    expect(stats.settledBets).toBe(0);
    expect(stats.wonBets).toBe(0);
    expect(stats.lostBets).toBe(0);
    expect(stats.pendingBets).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.totalStaked).toBe(0);
    expect(stats.totalPnl).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.currentEquity).toBe(10000);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.sharpeRatio).toBe(0);
  });

  it('handles mixed pending and settled bets', () => {
    const bets: SimulatedBet[] = [
      makeBet({ id: 'b1', amount: 100, result: 'won', profitLoss: 100, settledAt: '2025-06-20T12:00:00Z' }),
      makeBet({ id: 'b2', amount: 200, result: 'pending', profitLoss: 0 }),
      makeBet({ id: 'b3', amount: 150, result: 'lost', profitLoss: -150, settledAt: '2025-06-21T12:00:00Z' }),
      makeBet({ id: 'b4', amount: 300, result: 'pending', profitLoss: 0 }),
    ];

    const stats = engine.calculateProviderStats(provider, bets, 10000);

    expect(stats.totalBets).toBe(4);
    expect(stats.settledBets).toBe(2);
    expect(stats.wonBets).toBe(1);
    expect(stats.lostBets).toBe(1);
    expect(stats.pendingBets).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5, 4);
    // totalStaked includes ALL bets (pending + settled)
    expect(stats.totalStaked).toBe(750);
    // totalPnl only from settled
    expect(stats.totalPnl).toBe(-50);
    expect(stats.roi).toBeCloseTo(-50 / 750, 4);
    expect(stats.currentEquity).toBe(9950);
  });

  it('isolates stats by provider', () => {
    const bets: SimulatedBet[] = [
      makeBet({ id: 'b1', provider: 'openai', amount: 100, result: 'won', profitLoss: 100, settledAt: '2025-06-20T12:00:00Z' }),
      makeBet({ id: 'b2', provider: 'anthropic', amount: 100, result: 'lost', profitLoss: -100, settledAt: '2025-06-20T12:00:00Z' }),
    ];

    const openaiStats = engine.calculateProviderStats('openai', bets, 10000);
    const anthropicStats = engine.calculateProviderStats('anthropic', bets, 10000);

    expect(openaiStats.totalBets).toBe(1);
    expect(openaiStats.wonBets).toBe(1);
    expect(openaiStats.totalPnl).toBe(100);

    expect(anthropicStats.totalBets).toBe(1);
    expect(anthropicStats.lostBets).toBe(1);
    expect(anthropicStats.totalPnl).toBe(-100);
  });
});
