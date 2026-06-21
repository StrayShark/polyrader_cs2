import type {
  BankrollState,
  AllocationOpportunity,
  AllocationPlan,
  MatchAllocation,
} from '../types/index';
import {
  RISK_MULTIPLIERS,
  DEFAULT_MAX_BET_FRACTION,
  DEFAULT_MAX_TOTAL_EXPOSURE,
  MIN_ALLOCATION_KELLY,
} from '../scoring/weights';

/**
 * BetAllocationEngine — Allocates capital across betting opportunities
 * based on remaining bankroll and target return rate.
 *
 * Two modes:
 *   1. `allocateAlgorithmic()` — Deterministic Kelly-scaled allocation
 *      that respects bankroll constraints, risk tolerance, and target ROI.
 *   2. `allocateWithLLM()` — Delegates to an LLM with a structured prompt
 *      so the AI decides allocation considering qualitative factors.
 *
 * Algorithmic strategy:
 *   - Filter opportunities by minimum Kelly threshold
 *   - Scale each Kelly fraction by the risk-tolerance multiplier
 *   - Normalize so total exposure ≤ maxTotalExposure × availableCapital
 *   - Cap each bet at maxBetFraction × availableCapital
 *   - If target return is aggressive, boost allocation toward higher-EV bets
 */
export class BetAllocationEngine {
  /**
   * Deterministic allocation using modified Kelly + bankroll constraints.
   */
  allocateAlgorithmic(
    bankroll: BankrollState,
    opportunities: AllocationOpportunity[],
    options?: {
      maxBetFraction?: number;
      maxTotalExposure?: number;
    },
  ): AllocationPlan {
    const maxBetFraction = options?.maxBetFraction ?? DEFAULT_MAX_BET_FRACTION;
    const maxTotalExposure = options?.maxTotalExposure ?? DEFAULT_MAX_TOTAL_EXPOSURE;
    const riskMultiplier = RISK_MULTIPLIERS[bankroll.riskTolerance] ?? RISK_MULTIPLIERS.balanced;

    // 1. Filter: only opportunities with sufficient Kelly edge
    const candidates = opportunities.filter((o) => o.kellyFraction >= MIN_ALLOCATION_KELLY);

    if (candidates.length === 0 || bankroll.availableCapital <= 0) {
      return this.emptyPlan(bankroll, 'algorithmic');
    }

    // 2. Raw allocation: Kelly × risk multiplier, scaled to available capital
    const maxTotalAmount = bankroll.availableCapital * maxTotalExposure;

    let rawAllocations = candidates.map((o) => {
      const rawFraction = o.kellyFraction * riskMultiplier;
      return { opportunity: o, rawFraction };
    });

    // 3. If target return is high, skew toward higher-EV opportunities
    const targetBoost = this.targetBoostFactor(bankroll.targetReturnRate);
    rawAllocations = rawAllocations.map((a) => ({
      opportunity: a.opportunity,
      rawFraction: a.rawFraction * (1 + targetBoost * a.opportunity.expectedValue),
    }));

    // 4. Normalize so sum of raw fractions ≤ maxTotalExposure
    const totalRaw = rawAllocations.reduce((s, a) => s + a.rawFraction, 0);
    const scale = totalRaw > maxTotalExposure ? maxTotalExposure / totalRaw : 1;

    // 5. Build allocations with per-bet cap
    const allocations: MatchAllocation[] = [];
    let totalAllocated = 0;

    for (const { opportunity, rawFraction } of rawAllocations) {
      const scaledFraction = Math.min(rawFraction * scale, maxBetFraction);
      if (scaledFraction < MIN_ALLOCATION_KELLY) continue;

      const amount = Math.round(scaledFraction * bankroll.availableCapital * 100) / 100;
      if (amount < 1) continue;

      const expectedReturn = this.calculateExpectedReturn(amount, opportunity);

      allocations.push({
        matchId: opportunity.matchId,
        matchLabel: opportunity.matchLabel,
        team: opportunity.team,
        amount,
        fraction: Math.round(scaledFraction * 10000) / 10000,
        winProbability: opportunity.winProbability,
        odds: opportunity.odds,
        expectedReturn: Math.round(expectedReturn * 100) / 100,
        kellyFraction: opportunity.kellyFraction,
      });

      totalAllocated += amount;
    }

    // 6. Enforce hard cap on total allocation
    if (totalAllocated > maxTotalAmount) {
      const ratio = maxTotalAmount / totalAllocated;
      for (const a of allocations) {
        a.amount = Math.round(a.amount * ratio * 100) / 100;
        a.expectedReturn = Math.round(a.expectedReturn * ratio * 100) / 100;
      }
      totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    }

    const expectedReturn = allocations.reduce((s, a) => s + a.expectedReturn, 0);
    const portfolioRisk = this.estimatePortfolioRisk(allocations, candidates);
    const expectedROI = totalAllocated > 0 ? expectedReturn / totalAllocated : 0;

    return {
      allocations: allocations.sort((a, b) => b.amount - a.amount),
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      remainingCapital: Math.round((bankroll.availableCapital - totalAllocated) * 100) / 100,
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      expectedROI: Math.round(expectedROI * 10000) / 10000,
      portfolioRisk: Math.round(portfolioRisk * 10000) / 10000,
      reasoning: this.buildAlgorithmicReasoning(bankroll, allocations, expectedROI),
      generatedAt: new Date().toISOString(),
      source: 'algorithmic',
    };
  }

  /**
   * LLM-driven allocation — parses an LLM response into an AllocationPlan.
   *
   * The caller is responsible for sending the prompt and receiving the raw
   * text; this method validates and constrains the LLM output to ensure
   * it respects bankroll limits.
   */
  parseLLMAllocation(
    bankroll: BankrollState,
    opportunities: AllocationOpportunity[],
    llmResponse: string,
    options?: {
      maxBetFraction?: number;
      maxTotalExposure?: number;
    },
  ): AllocationPlan {
    const maxBetFraction = options?.maxBetFraction ?? DEFAULT_MAX_BET_FRACTION;
    const maxTotalExposure = options?.maxTotalExposure ?? DEFAULT_MAX_TOTAL_EXPOSURE;
    const maxTotalAmount = bankroll.availableCapital * maxTotalExposure;
    const maxPerBet = bankroll.availableCapital * maxBetFraction;

    let parsed: { allocations: Array<{ matchId: string; amount: number; reasoning?: string }>; reasoning?: string };

    try {
      const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        llmResponse.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : llmResponse;
      parsed = JSON.parse(jsonStr);
    } catch {
      return this.emptyPlan(bankroll, 'llm');
    }

    const oppMap = new Map(opportunities.map((o) => [o.matchId, o]));
    const allocations: MatchAllocation[] = [];
    let totalAllocated = 0;

    for (const item of parsed.allocations ?? []) {
      const opp = oppMap.get(item.matchId);
      if (!opp) continue;

      // Clamp amount to per-bet cap and available capital
      const amount = Math.max(0, Math.min(item.amount, maxPerBet, maxTotalAmount - totalAllocated));
      if (amount < 1) continue;

      const expectedReturn = this.calculateExpectedReturn(amount, opp);
      allocations.push({
        matchId: opp.matchId,
        matchLabel: opp.matchLabel,
        team: opp.team,
        amount: Math.round(amount * 100) / 100,
        fraction: Math.round((amount / bankroll.availableCapital) * 10000) / 10000,
        winProbability: opp.winProbability,
        odds: opp.odds,
        expectedReturn: Math.round(expectedReturn * 100) / 100,
        kellyFraction: opp.kellyFraction,
      });
      totalAllocated += amount;
    }

    const expectedReturn = allocations.reduce((s, a) => s + a.expectedReturn, 0);
    const portfolioRisk = this.estimatePortfolioRisk(allocations, opportunities);

    return {
      allocations: allocations.sort((a, b) => b.amount - a.amount),
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      remainingCapital: Math.round((bankroll.availableCapital - totalAllocated) * 100) / 100,
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      expectedROI: totalAllocated > 0 ? Math.round((expectedReturn / totalAllocated) * 10000) / 10000 : 0,
      portfolioRisk: Math.round(portfolioRisk * 10000) / 10000,
      reasoning: parsed.reasoning ?? 'LLM-driven allocation',
      generatedAt: new Date().toISOString(),
      source: 'llm',
    };
  }

  /**
   * Build the prompt context string for LLM-driven allocation.
   * Returns the user-message content describing bankroll + opportunities.
   */
  buildAllocationPrompt(bankroll: BankrollState, opportunities: AllocationOpportunity[]): string {
    let prompt = `## 资金状态 (Bankroll State)\n`;
    prompt += `- 总资金: $${bankroll.totalCapital.toFixed(2)}\n`;
    prompt += `- 已占用资金 (pending bets): $${bankroll.usedCapital.toFixed(2)}\n`;
    prompt += `- 可用资金: $${bankroll.availableCapital.toFixed(2)}\n`;
    prompt += `- 已实现盈亏: $${bankroll.realizedPnL.toFixed(2)}\n`;
    prompt += `- 净资金: $${bankroll.netCapital.toFixed(2)}\n`;
    prompt += `- 目标收益率: ${(bankroll.targetReturnRate * 100).toFixed(1)}%\n`;
    prompt += `- 目标利润: $${bankroll.targetProfit.toFixed(2)}\n`;
    prompt += `- 风险偏好: ${bankroll.riskTolerance}\n\n`;

    prompt += `## 可投注机会 (Available Opportunities)\n`;
    prompt += `| # | 比赛 | 推荐方 | 胜率 | 赔率 | Kelly | 置信度 | 期望值 | 共识 |\n`;
    prompt += `|---|------|--------|------|------|-------|--------|--------|------|\n`;

    opportunities.forEach((o, i) => {
      prompt += `| ${i + 1} | ${o.matchLabel} | ${o.team} | ${(o.winProbability * 100).toFixed(1)}% | ${o.odds.toFixed(2)} | ${(o.kellyFraction * 100).toFixed(1)}% | ${(o.confidence * 100).toFixed(0)}% | ${(o.expectedValue * 100).toFixed(1)}% | ${o.consensusLevel} |\n`;
    });

    prompt += `\n## 任务\n`;
    prompt += `你是专业资金管理者。基于以上可用资金和目标收益率，为每个有价值的投注机会分配金额。\n`;
    prompt += `约束条件:\n`;
    prompt += `- 单场比赛最大投注不超过可用资金的 ${(DEFAULT_MAX_BET_FRACTION * 100).toFixed(0)}%\n`;
    prompt += `- 总投注不超过可用资金的 ${(DEFAULT_MAX_TOTAL_EXPOSURE * 100).toFixed(0)}%\n`;
    prompt += `- 优先分配给高期望值和高共识的比赛\n`;
    prompt += `- 考虑风险分散，不要将所有资金集中在一两场比赛\n`;
    prompt += `- 如果目标收益率较高，可以适当提高投注比例，但不要突破上限\n\n`;
    prompt += `输出 JSON:\n`;
    prompt += `{\n  "allocations": [\n    { "matchId": "xxx", "amount": 100, "reasoning": "..." }\n  ],\n  "reasoning": "整体分配策略说明"\n}`;

    return prompt;
  }

  // ============================================================
  // Helpers
  // ============================================================

  private calculateExpectedReturn(amount: number, opp: AllocationOpportunity): number {
    // EV = amount × (winProb × (odds - 1) - (1 - winProb))
    return amount * (opp.winProbability * (opp.odds - 1) - (1 - opp.winProbability));
  }

  /**
   * Higher target return → larger boost toward high-EV opportunities.
   * Returns a multiplier in [0, 1] added to the base allocation.
   */
  private targetBoostFactor(targetReturnRate: number): number {
    // 0% target → 0 boost, 30%+ target → 1.0 boost (capped)
    return Math.min(1, Math.max(0, targetReturnRate / 0.3));
  }

  /**
   * Estimate portfolio risk as a weighted average of individual bet risks,
   * adjusted for diversification (more bets = lower concentration risk).
   */
  private estimatePortfolioRisk(
    allocations: MatchAllocation[],
    opportunities: AllocationOpportunity[],
  ): number {
    if (allocations.length === 0) return 0;

    const oppMap = new Map(opportunities.map((o) => [o.matchId, o]));
    const totalAmount = allocations.reduce((s, a) => s + a.amount, 0);

    let weightedRisk = 0;
    for (const a of allocations) {
      const opp = oppMap.get(a.matchId);
      // Risk per bet = (1 - winProb) weighted by bet size
      const lossProb = opp ? 1 - opp.winProbability : 0.5;
      const weight = a.amount / totalAmount;
      weightedRisk += lossProb * weight;
    }

    // Diversification discount: more bets reduce concentration risk
    const diversificationFactor = Math.max(0.5, 1 - (allocations.length - 1) * 0.05);
    return weightedRisk * diversificationFactor;
  }

  private buildAlgorithmicReasoning(
    bankroll: BankrollState,
    allocations: MatchAllocation[],
    expectedROI: number,
  ): string {
    if (allocations.length === 0) {
      return `可用资金 $${bankroll.availableCapital.toFixed(2)}，但没有符合最小 Kelly 阈值的投注机会。建议等待更好的机会。`;
    }

    const topBet = allocations[0];
    return `基于 ${bankroll.riskTolerance} 风险偏好，分配 ${allocations.length} 场比赛，` +
      `总投注 $${allocations.reduce((s, a) => s + a.amount, 0).toFixed(2)}，` +
      `预期收益率 ${(expectedROI * 100).toFixed(1)}%。` +
      `最大单注: ${topBet.matchLabel} $${topBet.amount.toFixed(2)}。` +
      `目标收益率 ${(bankroll.targetReturnRate * 100).toFixed(1)}%。`;
  }

  private emptyPlan(bankroll: BankrollState, source: 'algorithmic' | 'llm'): AllocationPlan {
    return {
      allocations: [],
      totalAllocated: 0,
      remainingCapital: bankroll.availableCapital,
      expectedReturn: 0,
      expectedROI: 0,
      portfolioRisk: 0,
      reasoning: bankroll.availableCapital <= 0
        ? '可用资金不足，无法分配。'
        : '没有符合条件的投注机会。',
      generatedAt: new Date().toISOString(),
      source,
    };
  }
}
