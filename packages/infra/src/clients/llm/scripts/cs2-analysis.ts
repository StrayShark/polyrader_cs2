/**
 * CS2 比赛胜率分析脚本
 *
 * 从 Polymarket 分页扫描获取所有活跃 CS2 市场，使用已配置的 LLM 分析胜率。
 *
 * 用法:
 *   cd packages/infra && npx tsx src/clients/llm/scripts/cs2-analysis.ts
 */

import { PolymarketGammaClient } from '../../polymarket/gamma-client.js';
import { LLMClientFactory } from '../llm-client-factory.js';
import type { LLMProvider, Market } from '@polyrader/core';

function selectLLMProvider(): { provider: LLMProvider; apiKey: string } | null {
  const providers: Array<{ provider: LLMProvider; envKey: string }> = [
    { provider: 'doubao', envKey: 'DOUBAO_API_KEY' },
    { provider: 'qwen', envKey: 'QWEN_API_KEY' },
    { provider: 'moonshot', envKey: 'MOONSHOT_API_KEY' },
    { provider: 'zhipu', envKey: 'ZHIPU_API_KEY' },
    { provider: 'minimax', envKey: 'MINIMAX_API_KEY' },
    { provider: 'hunyuan', envKey: 'HUNYUAN_API_KEY' },
    { provider: 'openai', envKey: 'OPENAI_API_KEY' },
    { provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
    { provider: 'google', envKey: 'GOOGLE_API_KEY' },
    { provider: 'deepseek', envKey: 'DEEPSEEK_API_KEY' },
    { provider: 'xai', envKey: 'XAI_API_KEY' },
  ];
  for (const p of providers) {
    const key = process.env[p.envKey];
    if (key && key.length > 0) return { provider: p.provider, apiKey: key };
  }
  return null;
}

function parseTeams(question: string): { teamA: string; teamB: string } | null {
  // "Counter-Strike: TeamA vs TeamB (BO3) - Event Name"
  const match = question.match(/:\s*(.+?)\s+vs\.?\s+(.+?)(?:\s*\(|\s*-\s|$)/i);
  if (!match) return null;
  return { teamA: match[1].trim(), teamB: match[2].trim() };
}

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  CS2 比赛胜率分析 (Polymarket 实时市场)');
  console.log('═══════════════════════════════════════════\n');

  // 1. 获取 Polymarket CS2 市场
  console.log('正在分页扫描 Polymarket 活跃 CS2 市场...');
  const gammaClient = new PolymarketGammaClient();
  const markets = await gammaClient.getMarkets(50, 20);

  if (markets.length === 0) {
    console.log('⚠️ 当前 Polymarket 无活跃 CS2 市场');
    process.exit(0);
  }

  console.log(`找到 ${markets.length} 个活跃 CS2 市场:\n`);
  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    const prob = parseFloat(m.outcomePrices?.[0] ?? '0.5');
    const probStr = Number.isFinite(prob) ? `${(prob * 100).toFixed(1)}%` : 'N/A';
    const vol = m.volume24h ?? m.volume ?? 0;
    console.log(`  ${i + 1}. ${m.question.substring(0, 70)}`);
    console.log(`     市场概率: ${probStr} | 24h交易量: $${vol.toFixed(0)} | 结束: ${m.endDate}`);
  }
  console.log('');

  // 2. 选择 LLM
  const llmConfig = selectLLMProvider();
  if (!llmConfig) {
    console.error('❌ 未找到已配置的 LLM API Key');
    process.exit(1);
  }
  console.log(`使用 LLM: ${llmConfig.provider}\n`);

  const client = LLMClientFactory.create(llmConfig.provider, llmConfig.apiKey);

  // 3. 逐场分析
  const results: Array<{ market: Market; analysis: Awaited<ReturnType<typeof client.analyze>> | null; error?: string }> = [];

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    console.log(`分析 [${i + 1}/${markets.length}] ${market.question.substring(0, 50)}...`);

    try {
      const teams = parseTeams(market.question);
      const marketProb = parseFloat(market.outcomePrices?.[0] ?? '0.5');

      const analysis = await client.analyze({
        system: `你是一位专业的 CS2 电竞分析师。请分析以下比赛的胜率。输出 JSON: {"winProbability":{"teamA":0.6,"teamB":0.4},"confidence":75,"reasoning":"分析","keyFactors":["因素"],"riskAssessment":"风险"}`,
        context: `比赛: ${market.question}
${teams ? `队伍 A: ${teams.teamA}\n队伍 B: ${teams.teamB}` : ''}
Polymarket 市场概率: ${Number.isFinite(marketProb) ? (marketProb * 100).toFixed(1) + '%' : '未知'}
24h 交易量: $${(market.volume24h ?? market.volume ?? 0).toFixed(0)}
结束时间: ${market.endDate}

请分析胜率。考虑: 排名、地图池、交锋记录、选手状态、赛事重要性。`,
        outputSchema: '{"winProbability":{"teamA":"0-1","teamB":"0-1"},"confidence":"0-100","reasoning":"分析","keyFactors":["因素"],"riskAssessment":"风险"}',
      });
      results.push({ market, analysis });

      const teamAWin = (analysis.winProbability.teamA * 100).toFixed(1);
      const teamBWin = (analysis.winProbability.teamB * 100).toFixed(1);
      console.log(`  ✅ ${teamAWin}% vs ${teamBWin}% (信心: ${analysis.confidence})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ 失败: ${errorMsg}`);
      results.push({ market, analysis: null, error: errorMsg });
    }
  }

  // 4. 汇总报告
  console.log('\n═══════════════════════════════════════════');
  console.log('  分析汇总');
  console.log('═══════════════════════════════════════════\n');
  console.log('市场                              | LLM胜率A | 市场概率 | 偏差    | 信心');
  console.log('─────────────────────────────────|----------|----------|---------|-----');

  for (const r of results) {
    const teams = parseTeams(r.market.question);
    const teamA = teams ? (teams.teamA.length > 15 ? teams.teamA.substring(0, 15) : teams.teamA.padEnd(15)) : r.market.question.substring(0, 15).padEnd(15);
    const teamB = teams ? (teams.teamB.length > 15 ? teams.teamB.substring(0, 15) : teams.teamB.padEnd(15)) : '';

    if (r.analysis) {
      const llmA = (r.analysis.winProbability.teamA * 100).toFixed(1) + '%';
      const marketProb = parseFloat(r.market.outcomePrices?.[0] ?? '0.5');
      const marketA = Number.isFinite(marketProb) ? (marketProb * 100).toFixed(1) + '%' : 'N/A';
      const deviation = Number.isFinite(marketProb)
        ? ((r.analysis.winProbability.teamA - marketProb) * 100).toFixed(1) + '%'
        : 'N/A';
      const confidence = r.analysis.confidence.toString();
      console.log(`${teamA} vs ${teamB} | ${llmA.padStart(8)} | ${marketA.padStart(8)} | ${deviation.padStart(7)} | ${confidence.padStart(3)}`);
    } else {
      console.log(`${teamA} vs ${teamB} | ${'N/A'.padStart(8)} | ${'N/A'.padStart(8)} | ${'N/A'.padStart(7)} | N/A`);
    }
  }

  // 5. 详细分析
  console.log('\n═══════════════════════════════════════════');
  console.log('  详细分析');
  console.log('═══════════════════════════════════════════\n');

  for (const r of results) {
    console.log(`┌─ ${r.market.question}`);
    console.log(`│  结束时间: ${r.market.endDate}`);
    console.log(`│  24h交易量: $${(r.market.volume24h ?? r.market.volume ?? 0).toFixed(0)}`);

    if (r.analysis) {
      const teams = parseTeams(r.market.question);
      const marketProb = parseFloat(r.market.outcomePrices?.[0] ?? '0.5');
      if (teams) {
        console.log(`│  LLM 胜率: ${teams.teamA} ${(r.analysis.winProbability.teamA * 100).toFixed(1)}% vs ${teams.teamB} ${(r.analysis.winProbability.teamB * 100).toFixed(1)}%`);
      }
      if (Number.isFinite(marketProb)) {
        console.log(`│  市场概率: ${(marketProb * 100).toFixed(1)}% vs ${((1 - marketProb) * 100).toFixed(1)}%`);
        const dev = (r.analysis.winProbability.teamA - marketProb) * 100;
        console.log(`│  偏差: ${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%`);
      }
      console.log(`│  信心度: ${r.analysis.confidence}/100`);
      console.log(`│  分析: ${r.analysis.reasoning}`);
      if (r.analysis.keyFactors?.length) console.log(`│  关键因素: ${r.analysis.keyFactors.join(', ')}`);
      console.log(`│  风险: ${r.analysis.riskAssessment}`);
      if (r.analysis.thinkingProcess) {
        const t = r.analysis.thinkingProcess.length > 500 ? r.analysis.thinkingProcess.substring(0, 500) + '...' : r.analysis.thinkingProcess;
        console.log(`│  思考过程: ${t}`);
      }
    } else {
      console.log(`│  ❌ 分析失败: ${r.error ?? '未知'}`);
    }
    console.log('┘\n');
  }

  const ok = results.filter((r) => r.analysis).length;
  console.log(`═══════════════════════════════════════════`);
  console.log(`  完成: ${ok}/${results.length} 场分析成功`);
  console.log(`═══════════════════════════════════════════\n`);
}

main().catch((err) => { console.error('脚本异常:', err); process.exit(1); });
