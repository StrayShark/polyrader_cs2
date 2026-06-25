/**
 * LLM 连通性测试 CLI 脚本
 *
 * 用法:
 *   cd packages/infra && npx tsx src/clients/llm/scripts/llm-connectivity-test.ts
 *
 * 需要在 globel_env/.env 或环境变量中配置对应的 API Key。
 * 仅测试已配置 Key 的提供商，未配置的自动跳过。
 */

import { LLMClientFactory } from '../llm-client-factory.js';
import type { LLMProvider } from '@polyrader/core';

interface ProviderConfig {
  name: LLMProvider;
  key: string;
  label: string;
  model: string;
}

const providers: ProviderConfig[] = [
  { name: 'qwen', key: process.env.QWEN_API_KEY ?? '', label: '通义千问 Qwen', model: 'qwen3.7-max' },
  { name: 'moonshot', key: process.env.MOONSHOT_API_KEY ?? '', label: '月之暗面 Kimi', model: 'kimi-k2.7-code' },
  { name: 'zhipu', key: process.env.ZHIPU_API_KEY ?? '', label: '智谱 GLM', model: 'glm-5.2' },
  { name: 'doubao', key: process.env.DOUBAO_API_KEY ?? '', label: '字节豆包 Doubao', model: 'doubao-seed-2-0-pro-260215' },
  { name: 'minimax', key: process.env.MINIMAX_API_KEY ?? '', label: 'MiniMax', model: 'MiniMax-M3' },
  { name: 'hunyuan', key: process.env.HUNYUAN_API_KEY ?? '', label: '腾讯混元 Hunyuan', model: 'hy3-preview' },
  { name: 'openai', key: process.env.OPENAI_API_KEY ?? '', label: 'OpenAI', model: 'gpt-5.5' },
  { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY ?? '', label: 'Anthropic', model: 'claude-sonnet-4-6' },
  { name: 'google', key: process.env.GOOGLE_API_KEY ?? '', label: 'Google Gemini', model: 'gemini-3.5-flash' },
  { name: 'deepseek', key: process.env.DEEPSEEK_API_KEY ?? '', label: 'DeepSeek', model: 'deepseek-v4-flash' },
  { name: 'xai', key: process.env.XAI_API_KEY ?? '', label: 'xAI Grok', model: 'grok-4.3' },
];

const testPrompt = {
  system: '你是一个预测分析助手。请返回简单的 JSON 分析结果。',
  context: '当前事件: 测试连通性。',
  outputSchema: '{"winProbability":{"yes":0.5,"no":0.5},"confidence":50,"reasoning":"测试","keyFactors":["测试"],"riskAssessment":"低风险"}',
};

interface TestResult {
  provider: string;
  model: string;
  status: 'pass' | 'fail' | 'skip';
  latency?: number;
  thinkingProcess?: string;
  error?: string;
}

async function testProvider(config: ProviderConfig): Promise<TestResult> {
  if (!config.key) {
    return { provider: config.label, model: config.model, status: 'skip' };
  }

  const startTime = Date.now();
  try {
    const client = LLMClientFactory.create(config.name, config.key);
    const result = await client.analyze(testPrompt);
    const latency = Date.now() - startTime;

    if (result.error) {
      return { provider: config.label, model: config.model, status: 'fail', latency, error: result.error };
    }

    return {
      provider: config.label,
      model: config.model,
      status: 'pass',
      latency,
      thinkingProcess: result.thinkingProcess ? `${result.thinkingProcess.substring(0, 100)}...` : undefined,
    };
  } catch (err) {
    return {
      provider: config.label,
      model: config.model,
      status: 'fail',
      latency: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  LLM 连通性测试');
  console.log('═══════════════════════════════════════════\n');

  const results: TestResult[] = [];
  for (const config of providers) {
    process.stdout.write(`测试 ${config.label}...`);
    const result = await testProvider(config);
    results.push(result);

    if (result.status === 'pass') {
      console.log(` ✅ (${result.latency}ms)`);
      if (result.thinkingProcess) {
        console.log(`    思考: ${result.thinkingProcess}`);
      }
    } else if (result.status === 'skip') {
      console.log(' ⏭️  跳过 (未配置 API Key)');
    } else {
      console.log(` ❌ (${result.latency}ms)`);
      console.log(`    错误: ${result.error}`);
    }
  }

  // 汇总
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log('\n═══════════════════════════════════════════');
  console.log(`  汇总: ${passed} 通过 / ${failed} 失败 / ${skipped} 跳过`);
  console.log('═══════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试脚本异常:', err);
  process.exit(1);
});
