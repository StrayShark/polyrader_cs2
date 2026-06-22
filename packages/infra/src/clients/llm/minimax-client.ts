import type { LLMAnalysisResult } from '@polyrader/core';
import { PromptEngine } from '@polyrader/core';
import type { LLMClient } from './llm-client-factory';

export class MinimaxClient implements LLMClient {
  provider = 'minimax' as const;
  private apiKey: string;
  private model: string;
  private baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1';

  constructor(apiKey: string, model = 'abab6.5s-chat') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult> {
    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
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
      throw new Error(`MiniMax API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latency = Date.now() - startTime;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = String(message?.content ?? '');

    const engine = new PromptEngine();
    return engine.parseResponse('minimax', this.model, content, latency, {
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
    const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
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
      throw new Error(`MiniMax API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    return String(message?.content ?? '');
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    return { used: 0, limit: 1000000 };
  }
}
