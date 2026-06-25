/**
 * 国产 LLM 连通性测试
 *
 * 验证 thinking 参数不会导致 400 错误。
 * 需要 API Key 才能运行，无 Key 时自动跳过。
 *
 * 运行方式:
 *   1. 在 globel_env/.env 中配置对应的 API Key
 *   2. cd packages/infra && npx vitest run src/clients/llm/__tests__/connectivity.test.ts
 */

import { describe, it, expect } from 'vitest';
import { LLMClientFactory } from '../llm-client-factory';

// 读取环境变量（支持 globel_env/.env 加载后的场景）
const env = process.env;

/** 构建最小化测试 prompt */
const testPrompt = {
  system: '你是一个预测分析助手。',
  context: '当前事件: 测试连通性。请返回简单的 JSON 分析结果。',
  outputSchema: '{"winProbability":{"yes":0.5,"no":0.5},"confidence":50,"reasoning":"测试","keyFactors":["测试"],"riskAssessment":"低风险"}',
};

/** 6 个国产 LLM 提供商配置 */
const providers = [
  { name: 'qwen', key: env.QWEN_API_KEY, label: '通义千问 Qwen3.7-Max' },
  { name: 'moonshot', key: env.MOONSHOT_API_KEY, label: '月之暗面 Kimi K2.6' },
  { name: 'zhipu', key: env.ZHIPU_API_KEY, label: '智谱 GLM-5.2' },
  { name: 'doubao', key: env.DOUBAO_API_KEY, label: '豆包 Seed-2.0-Pro' },
  { name: 'minimax', key: env.MINIMAX_API_KEY, label: 'MiniMax-M3' },
  { name: 'hunyuan', key: env.HUNYUAN_API_KEY, label: '腾讯混元 Turbo S' },
] as const;

// 逐个测试每个提供商
for (const { name, key, label } of providers) {
  const hasKey = Boolean(key && key.length > 0);

  describe(`${label} 连通性测试`, { timeout: 30_000 }, () => {
    it.skipIf(!hasKey)(`应成功调用 ${label} API 且不返回 400 错误`, async () => {
      const client = LLMClientFactory.create(name as never, key!);
      const result = await client.analyze(testPrompt);

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.tokenUsage.totalTokens).toBeGreaterThan(0);
    });

    it.skipIf(!hasKey)(`应成功调用 ${label} complete() 方法`, async () => {
      const client = LLMClientFactory.create(name as never, key!);
      const result = await client.complete({
        system: '你是一个助手。',
        user: '请回复"连通性测试通过"。',
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it.skipIf(hasKey)(`${label} 跳过: 未配置 API Key`, () => {
      // 占位测试，显示跳过原因
      expect(true).toBe(true);
    });
  });
}
