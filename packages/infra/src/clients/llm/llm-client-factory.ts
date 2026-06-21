import type { LLMProvider, LLMAnalysisResult } from '@polyrader/core';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { GoogleClient } from './google-client';
import { DeepSeekClient } from './deepseek-client';
import { XAIClient } from './xai-client';
import { GroqClient } from './groq-client';

export interface LLMClient {
  provider: LLMProvider;
  analyze(prompt: { system: string; context: string; outputSchema: string }): Promise<LLMAnalysisResult>;
  complete(prompt: { system: string; user: string }): Promise<string>;
  testConnection(): Promise<boolean>;
  getQuota(): Promise<{ used: number; limit: number }>;
}

export class LLMClientFactory {
  static create(provider: LLMProvider, apiKey: string, model?: string): LLMClient {
    switch (provider) {
      case 'openai':
        return new OpenAIClient(apiKey, model ?? 'gpt-4o');
      case 'anthropic':
        return new AnthropicClient(apiKey, model ?? 'claude-3-5-sonnet-20241022');
      case 'google':
        return new GoogleClient(apiKey, model ?? 'gemini-2.0-flash');
      case 'deepseek':
        return new DeepSeekClient(apiKey, model ?? 'deepseek-chat');
      case 'xai':
        return new XAIClient(apiKey, model ?? 'grok-2');
      case 'groq':
        return new GroqClient(apiKey, model ?? 'llama-3.3-70b-versatile');
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}
