import { describe, it, expect } from 'vitest';
import { ResultAggregator } from './result-aggregator';
import type { LLMAnalysisResult } from '../types/index';

function makeResult(overrides: Partial<LLMAnalysisResult> = {}): LLMAnalysisResult {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    winProbability: { teamA: 0.6, teamB: 0.4 },
    confidence: 0.8,
    reasoning: 'Team A is stronger',
    keyFactors: ['Rank advantage'],
    riskAssessment: 'Low risk',
    latency: 1200,
    tokenUsage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    ...overrides,
  };
}

describe('ResultAggregator', () => {
  const aggregator = new ResultAggregator();

  it('should aggregate multiple LLM results', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.6, teamB: 0.4 } }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.55, teamB: 0.45 } }),
      makeResult({ provider: 'google', winProbability: { teamA: 0.65, teamB: 0.35 } }),
    ];

    const agg = aggregator.aggregate('match-1', results);

    expect(agg.aggregatedProbability.teamA).toBeGreaterThan(0.5);
    expect(agg.aggregatedProbability.teamB).toBeLessThan(0.5);
    expect(agg.consensus.level).toBeDefined();
  });

  it('should detect strong consensus when all agree', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.6, teamB: 0.4 }, confidence: 0.8 }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.62, teamB: 0.38 }, confidence: 0.75 }),
      makeResult({ provider: 'google', winProbability: { teamA: 0.58, teamB: 0.42 }, confidence: 0.7 }),
    ];

    const agg = aggregator.aggregate('match-1', results);

    expect(agg.consensus.level).toBe('strong');
    expect(agg.consensus.agreementRate).toBe(1);
  });

  it('should detect divergent consensus when LLMs disagree', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.7, teamB: 0.3 } }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.3, teamB: 0.7 } }),
      makeResult({ provider: 'google', winProbability: { teamA: 0.5, teamB: 0.5 } }),
    ];

    const agg = aggregator.aggregate('match-1', results);

    expect(agg.consensus.level).toBe('divergent');
  });

  it('should recommend skip for divergent consensus', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.7, teamB: 0.3 } }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.3, teamB: 0.7 } }),
    ];

    const agg = aggregator.aggregate('match-1', results);

    expect(agg.kellyAllocation.recommendedBet).toBe('skip');
  });

  it('should use market odds for Kelly allocation when market probability is provided', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.65, teamB: 0.35 }, confidence: 0.8 }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.64, teamB: 0.36 }, confidence: 0.8 }),
      makeResult({ provider: 'google', winProbability: { teamA: 0.66, teamB: 0.34 }, confidence: 0.8 }),
    ];

    const agg = aggregator.aggregate('match-1', results, undefined, 0.5);

    expect(agg.kellyAllocation.recommendedBet).toBe('team_a');
    expect(agg.kellyAllocation.kellyFraction).toBeGreaterThan(0);
  });

  it('should skip Kelly allocation when model probability has no market edge', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.55, teamB: 0.45 }, confidence: 0.8 }),
      makeResult({ provider: 'anthropic', winProbability: { teamA: 0.56, teamB: 0.44 }, confidence: 0.8 }),
    ];

    const agg = aggregator.aggregate('match-1', results, undefined, 0.6);

    expect(agg.kellyAllocation.recommendedBet).toBe('skip');
    expect(agg.kellyAllocation.kellyFraction).toBe(0);
  });

  it('should handle empty results gracefully', () => {
    const results: LLMAnalysisResult[] = [];

    const agg = aggregator.aggregate('match-1', results);

    expect(agg.aggregatedProbability.teamA).toBe(0.5);
    expect(agg.consensus.level).toBe('divergent');
  });

  it('should handle results with errors', () => {
    const results = [
      makeResult({ provider: 'openai', winProbability: { teamA: 0.6, teamB: 0.4 } }),
      makeResult({ provider: 'anthropic', error: 'Timeout', winProbability: { teamA: 0.5, teamB: 0.5 }, confidence: 0 }),
    ];

    const agg = aggregator.aggregate('match-1', results);

    // Should use only the valid result
    expect(agg.aggregatedProbability.teamA).toBe(0.6);
  });
});
