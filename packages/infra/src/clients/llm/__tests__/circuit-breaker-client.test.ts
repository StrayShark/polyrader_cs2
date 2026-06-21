import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker';
import { CircuitBreakerLLMClient } from '../circuit-breaker-client';
import type { LLMProvider } from '@polyrader/core';

function mockClient() {
  return {
    analyze: vi.fn().mockResolvedValue({
      provider: 'openai' as const,
      model: 'test-model',
      winProbability: { teamA: 0.6, teamB: 0.4 },
      confidence: 0.8,
      reasoning: 'test',
      keyFactors: [],
      riskAssessment: '',
      latency: 100,
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    complete: vi.fn().mockResolvedValue('{"allocations":[]}'),
    testConnection: vi.fn().mockResolvedValue(true),
    getQuota: vi.fn().mockResolvedValue({ used: 500, limit: 1000 }),
  };
}

const TEST_PROVIDER = 'openai' as LLMProvider;

describe('CircuitBreakerLLMClient', () => {
  it('passes through analyze when breaker is closed', async () => {
    const inner = mockClient();
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner);
    const result = await wrapped.analyze({ system: '', context: '', outputSchema: '' });
    expect(result.winProbability.teamA).toBe(0.6);
    expect(inner.analyze).toHaveBeenCalledTimes(1);
  });

  it('returns fallback when breaker is open', async () => {
    const inner = mockClient();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner, breaker);

    breaker.onFailure();
    const result = await wrapped.analyze({ system: '', context: '', outputSchema: '' });
    expect(result.winProbability.teamA).toBe(0.5);
    expect(result.confidence).toBe(0);
    expect(inner.analyze).not.toHaveBeenCalled();
  });

  it('returns fallback on analyze failure', async () => {
    const inner = mockClient();
    inner.analyze.mockRejectedValue(new Error('Network error'));
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner);
    const result = await wrapped.analyze({ system: '', context: '', outputSchema: '' });
    expect(result.winProbability.teamA).toBe(0.5);
    expect(result.confidence).toBe(0);
  });

  it('passes through testConnection when closed', async () => {
    const inner = mockClient();
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner);
    const ok = await wrapped.testConnection();
    expect(ok).toBe(true);
  });

  it('returns false from testConnection when open', async () => {
    const inner = mockClient();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner, breaker);
    breaker.onFailure();
    const ok = await wrapped.testConnection();
    expect(ok).toBe(false);
    expect(inner.testConnection).not.toHaveBeenCalled();
  });

  it('returns zero quota when open', async () => {
    const inner = mockClient();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner, breaker);
    breaker.onFailure();
    const quota = await wrapped.getQuota();
    expect(quota).toEqual({ used: 0, limit: 0 });
  });

  it('exposes breaker state', () => {
    const inner = mockClient();
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner);
    expect(wrapped.getState().state).toBe('CLOSED');
  });

  it('can reset breaker', () => {
    const inner = mockClient();
    const wrapped = new CircuitBreakerLLMClient(TEST_PROVIDER, inner);
    wrapped.getState(); // no-op read
    wrapped.reset();
    expect(wrapped.getState().state).toBe('CLOSED');
  });
});
