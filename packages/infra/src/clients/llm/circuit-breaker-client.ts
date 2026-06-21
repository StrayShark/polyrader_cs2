import type { LLMProvider, LLMAnalysisResult } from '@polyrader/core';
import { CircuitBreaker } from './circuit-breaker';

/**
 * Wraps an LLMClient with circuit breaker protection.
 *
 * After 5 consecutive failures, the breaker opens for 60 seconds.
 * During OPEN state, all calls fail fast with a CircuitOpenError.
 */
export class CircuitBreakerLLMClient {
  constructor(
    public readonly provider: LLMProvider,
    private readonly inner: {
      analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult>;
      complete(prompt: { system: string; user: string }): Promise<string>;
      testConnection(): Promise<boolean>;
      getQuota(): Promise<{ used: number; limit: number }>;
    },
    private readonly breaker: CircuitBreaker = new CircuitBreaker(),
  ) {}

  async analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult> {
    if (!this.breaker.beforeRequest()) {
      return {
        provider: this.provider,
        model: '',
        winProbability: { teamA: 0.5, teamB: 0.5 },
        confidence: 0,
        reasoning: `Circuit breaker open for ${this.provider}. Skipping analysis.`,
        keyFactors: [],
        riskAssessment: '',
        latency: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    try {
      const result = await this.inner.analyze(prompt);
      this.breaker.onSuccess();
      return result;
    } catch (err) {
      this.breaker.onFailure();
      return {
        provider: this.provider,
        model: '',
        winProbability: { teamA: 0.5, teamB: 0.5 },
        confidence: 0,
        reasoning: `Analysis failed for ${this.provider}: ${(err as Error).message}`,
        keyFactors: [],
        riskAssessment: '',
        latency: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.breaker.beforeRequest()) return false;
    try {
      const ok = await this.inner.testConnection();
      if (ok) this.breaker.onSuccess();
      else this.breaker.onFailure();
      return ok;
    } catch {
      this.breaker.onFailure();
      return false;
    }
  }

  async complete(prompt: { system: string; user: string }): Promise<string> {
    if (!this.breaker.beforeRequest()) {
      throw new Error(`Circuit breaker open for ${this.provider}.`);
    }
    try {
      const result = await this.inner.complete(prompt);
      this.breaker.onSuccess();
      return result;
    } catch (err) {
      this.breaker.onFailure();
      throw err;
    }
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    if (!this.breaker.beforeRequest()) return { used: 0, limit: 0 };
    try {
      const quota = await this.inner.getQuota();
      this.breaker.onSuccess();
      return quota;
    } catch {
      this.breaker.onFailure();
      return { used: 0, limit: 0 };
    }
  }

  getState(): { state: string; failureCount: number } {
    return this.breaker.getState();
  }

  reset(): void {
    this.breaker.reset();
  }
}
