import type { LLMAnalysisResult } from '@polyrader/core';
import { PromptEngine } from '@polyrader/core';
import type { LLMClient } from './llm-client-factory';

export class OpenAIClient implements LLMClient {
  provider = 'openai' as const;
  private apiKey: string;
  private model: string;
  private baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  constructor(apiKey: string, model = 'gpt-4o') {
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
      throw new Error(`OpenAI API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latency = Date.now() - startTime;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = String(message?.content ?? '');

    const usage = data.usage as Record<string, number> | undefined;

    const engine = new PromptEngine();
    return engine.parseResponse('openai', this.model, content, latency, {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
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
      throw new Error(`OpenAI API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    return String(message?.content ?? '');
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    try {
      // Fetch usage for current billing period
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

      const response = await fetch(
        `${this.baseUrl}/usage?date=${startDate}`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
      );

      if (!response.ok) {
        // Fallback: try the dashboard billing endpoint
        return this.getQuotaFromBilling();
      }

      const data = await response.json() as { total_usage?: number; daily_costs?: Array<{ line_items: Array<{ cost: number }> }> };
      const totalCost = data.total_usage ?? 0;

      return { used: Math.round(totalCost * 1000), limit: 1000000 };
    } catch {
      return { used: 0, limit: 1000000 };
    }
  }

  private async getQuotaFromBilling(): Promise<{ used: number; limit: number }> {
    try {
      const response = await fetch('https://api.openai.com/dashboard/billing/usage', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return { used: 0, limit: 1000000 };

      const data = await response.json() as { total_usage?: number; hard_limit_usd?: number };
      return {
        used: Math.round((data.total_usage ?? 0) * 100),
        limit: Math.round((data.hard_limit_usd ?? 100) * 100),
      };
    } catch {
      return { used: 0, limit: 1000000 };
    }
  }
}
