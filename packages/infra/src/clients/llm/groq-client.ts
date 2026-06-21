import type { LLMAnalysisResult } from '@polyrader/core';
import { PromptEngine } from '@polyrader/core';
import type { LLMClient } from './llm-client-factory';

export class GroqClient implements LLMClient {
  provider = 'groq' as const;
  private apiKey: string;
  private model: string;
  private baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

  constructor(apiKey: string, model = 'llama-3.3-70b-versatile') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult> {
    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: `${prompt.system}\n\nOutput format:\n${prompt.outputSchema}` },
          { role: 'user', content: prompt.context },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latency = Date.now() - startTime;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = String(message?.content ?? '');

    const engine = new PromptEngine();
    return engine.parseResponse('groq', this.model, content, latency, {
      promptTokens: Number((data.usage as Record<string, unknown>)?.prompt_tokens ?? 0),
      completionTokens: Number((data.usage as Record<string, unknown>)?.completion_tokens ?? 0),
      totalTokens: Number((data.usage as Record<string, unknown>)?.total_tokens ?? 0),
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    return String(message?.content ?? '');
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') ?? '1000', 10);
      const limit = parseInt(response.headers.get('x-ratelimit-limit-requests') ?? '1000', 10);
      const tokensRemaining = parseInt(response.headers.get('x-ratelimit-remaining-tokens') ?? '100000', 10);
      const tokensLimit = parseInt(response.headers.get('x-ratelimit-limit-tokens') ?? '100000', 10);
      return {
        used: Math.max(0, limit - remaining) * 1000 + Math.max(0, tokensLimit - tokensRemaining),
        limit: limit * 1000,
      };
    } catch {
      return { used: 0, limit: 1000000 };
    }
  }
}
