import type { LLMProvider } from '../types/index';

/**
 * LLM pricing per 1 million tokens (USD).
 * Prices sourced from official provider pricing pages.
 * Used for cost estimation in the usage monitoring module (PRD §7.4).
 */
export const LLM_PRICING: Record<LLMProvider, { inputPricePerM: number; outputPricePerM: number }> = {
  openai:    { inputPricePerM: 2.50, outputPricePerM: 10.00 },  // GPT-4o
  anthropic: { inputPricePerM: 3.00, outputPricePerM: 15.00 },  // Claude 3.5 Sonnet
  google:    { inputPricePerM: 0.10, outputPricePerM: 0.40 },   // Gemini 2.0 Flash
  deepseek:  { inputPricePerM: 0.27, outputPricePerM: 1.10 },   // DeepSeek V3
  xai:       { inputPricePerM: 2.00, outputPricePerM: 10.00 },  // Grok 2
  groq:      { inputPricePerM: 0.59, outputPricePerM: 0.79 },   // Llama 3.3 70B
  qwen:      { inputPricePerM: 0.45, outputPricePerM: 1.80 },   // Qwen3.7-Max
  moonshot:  { inputPricePerM: 0.95, outputPricePerM: 4.00 },   // K2.7-Code
  zhipu:     { inputPricePerM: 0.50, outputPricePerM: 2.00 },   // GLM-5.2
  doubao:    { inputPricePerM: 0.47, outputPricePerM: 2.37 },   // Seed 2.0 Pro
  minimax:   { inputPricePerM: 0.60, outputPricePerM: 2.40 },   // M3
  hunyuan:   { inputPricePerM: 0.50, outputPricePerM: 2.00 },   // Hy3-Preview
  user:      { inputPricePerM: 0,    outputPricePerM: 0 },       // Manual — no cost
};

/** Get pricing for a provider, defaulting to zero. */
export function getLLMPricing(provider: LLMProvider): { inputPricePerM: number; outputPricePerM: number } {
  return LLM_PRICING[provider] ?? { inputPricePerM: 0, outputPricePerM: 0 };
}
