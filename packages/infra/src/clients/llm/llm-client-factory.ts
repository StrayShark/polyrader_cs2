import type { LLMProvider, LLMAnalysisResult } from '@polyrader/core';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { GoogleClient } from './google-client';
import { DeepSeekClient } from './deepseek-client';
import { XAIClient } from './xai-client';
import { GroqClient } from './groq-client';
import { QwenClient } from './qwen-client';
import { MoonshotClient } from './moonshot-client';
import { ZhipuClient } from './zhipu-client';
import { DoubaoClient } from './doubao-client';
import { MinimaxClient } from './minimax-client';
import { HunyuanClient } from './hunyuan-client';

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
      case 'qwen':
        return new QwenClient(apiKey, model ?? 'qwen-max');
      case 'moonshot':
        return new MoonshotClient(apiKey, model ?? 'moonshot-v1-128k');
      case 'zhipu':
        return new ZhipuClient(apiKey, model ?? 'glm-4-plus');
      case 'doubao':
        return new DoubaoClient(apiKey, model ?? 'doubao-1.5-pro-256k');
      case 'minimax':
        return new MinimaxClient(apiKey, model ?? 'abab6.5s-chat');
      case 'hunyuan':
        return new HunyuanClient(apiKey, model ?? 'hunyuan-large');
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}
