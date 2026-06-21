import type { LLMAnalysisResult } from '@polyrader/core';
import { PromptEngine } from '@polyrader/core';
import type { LLMClient } from './llm-client-factory';

export class AnthropicClient implements LLMClient {
  provider = 'anthropic' as const;
  private apiKey: string;
  private model: string;
  private baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';

  constructor(apiKey: string, model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult> {
    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: `${prompt.system}\n\nOutput format:\n${prompt.outputSchema}`,
        messages: [{ role: 'user', content: prompt.context }],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latency = Date.now() - startTime;
    const contentArr = data.content as Array<Record<string, unknown>> | undefined;
    const content = String(contentArr?.[0]?.text ?? '');

    const usage = data.usage as Record<string, number> | undefined;

    const engine = new PromptEngine();
    return engine.parseResponse('anthropic', this.model, content, latency, {
      promptTokens: usage?.input_tokens ?? 0,
      completionTokens: usage?.output_tokens ?? 0,
      totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const contentArr = data.content as Array<Record<string, unknown>> | undefined;
    return String(contentArr?.[0]?.text ?? '');
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    try {
      // Anthropic doesn't have a public usage API.
      // Use the rate-limit headers from a lightweight request to infer quota.
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      const remaining = parseInt(response.headers.get('anthropic-ratelimit-requests-remaining') ?? '1000', 10);
      const limit = parseInt(response.headers.get('anthropic-ratelimit-requests-limit') ?? '1000', 10);
      const tokensRemaining = parseInt(response.headers.get('anthropic-ratelimit-tokens-remaining') ?? '100000', 10);
      const tokensLimit = parseInt(response.headers.get('anthropic-ratelimit-tokens-limit') ?? '100000', 10);

      return {
        used: Math.max(0, limit - remaining) * 1000 + Math.max(0, tokensLimit - tokensRemaining),
        limit: limit * 1000,
      };
    } catch {
      return { used: 0, limit: 1000000 };
    }
  }
}
