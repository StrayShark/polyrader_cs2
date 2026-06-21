import type { LLMAnalysisResult } from '@polyrader/core';
import { PromptEngine } from '@polyrader/core';
import type { LLMClient } from './llm-client-factory';

export class GoogleClient implements LLMClient {
  provider = 'google' as const;
  private apiKey: string;
  private model: string;
  private baseUrl = process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult> {
    const startTime = Date.now();
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${prompt.system}\n\nOutput format:\n${prompt.outputSchema}` }] },
          contents: [{ parts: [{ text: prompt.context }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const latency = Date.now() - startTime;
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const text = String(parts?.[0]?.text ?? '');

    const usageMeta = data.usageMetadata as Record<string, number> | undefined;

    const engine = new PromptEngine();
    return engine.parseResponse('google', this.model, text, latency, {
      promptTokens: usageMeta?.promptTokenCount ?? 0,
      completionTokens: usageMeta?.candidatesTokenCount ?? 0,
      totalTokens: usageMeta?.totalTokenCount ?? 0,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models`,
        { headers: { 'x-goog-api-key': this.apiKey } },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt.system }] },
          contents: [{ parts: [{ text: prompt.user }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API error: ${response.status} - ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    return String(parts?.[0]?.text ?? '');
  }

  async getQuota(): Promise<{ used: number; limit: number }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models`,
        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey } },
      );
      if (!response.ok) return { used: 0, limit: 1000000 };

      const data = await response.json() as { models?: Array<{ name: string; displayName: string; supportedGenerationMethods?: string[] }> };
      const modelCount = data.models?.length ?? 0;
      return { used: 0, limit: modelCount > 0 ? 1500000 : 1000000 };
    } catch {
      return { used: 0, limit: 1000000 };
    }
  }
}
