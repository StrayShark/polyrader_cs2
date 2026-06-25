import { randomUUID } from 'crypto';
import type {
  SimulatedBet,
  LLMProvider,
  SimulationConfig,
  LLMAnalysisResult,
  ProviderSimulationStats,
} from '../types/index';

/**
 * SimulatedBettingEngine — factory for simulated bet records.
 *
 * Creating a bet does NOT persist it; the caller is responsible for saving
 * the returned record to the database via LLMRepository.upsertBet().
 */
export class SimulatedBettingEngine {
  /**
   * Create a simulated bet record based on an LLM recommendation.
   * Does NOT persist — caller must save via LLMRepository.upsertBet().
   */
  placeBet(
    matchId: string,
    provider: LLMProvider,
    team: string,
    odds: number,
    amount = 100,
  ): SimulatedBet {
    const id = `bet-${randomUUID()}`;
    return {
      id,
      matchId,
      provider,
      team,
      odds,
      amount,
      result: 'pending',
      profitLoss: 0,
      placedAt: new Date().toISOString(),
    };
  }

  /**
   * 根据 LLM 分析结果和模拟盘配置生成下注。
   * 返回 null 表示不满足下注条件（置信度/edge不足）。
   */
  placeBetFromAnalysis(
    matchId: string,
    analysis: LLMAnalysisResult,
    config: SimulationConfig,
    marketProb: number,  // 市场隐含概率（1/odds 或 Polymarket价格）
    teamAName: string,
    teamBName: string,
  ): SimulatedBet | null {
    // 跳过有错误的LLM
    if (analysis.error) return null;

    // 检查置信度门槛
    if (analysis.confidence < config.minConfidence) return null;

    // 选择下注的队伍（概率更高的那边）
    const betTeamA = analysis.winProbability.teamA >= analysis.winProbability.teamB;
    const llmProb = betTeamA ? analysis.winProbability.teamA : analysis.winProbability.teamB;
    const team = betTeamA ? teamAName : teamBName;

    const sideMarketProb = betTeamA ? marketProb : 1 - marketProb;

    // 计算 edge (LLM概率 vs 对应投注方向的市场概率)
    const edge = llmProb - sideMarketProb;
    if (edge < config.minEdge) return null;

    // 计算赔率
    const odds = config.oddsSource === 'llm_inverse'
      ? (llmProb > 0 ? 1 / llmProb : 2.0)
      : (sideMarketProb > 0 ? 1 / sideMarketProb : 2.0);

    // 计算下注金额
    let amount: number;
    if (config.betStrategy === 'fixed') {
      amount = config.betAmount;
    } else if (config.betStrategy === 'kelly') {
      // 简化 Kelly: f = (p * odds - 1) / (odds - 1)
      const kellyFraction = (llmProb * odds - 1) / (odds - 1);
      const safeKelly = Math.max(0, Math.min(kellyFraction, config.maxBetFraction));
      amount = Math.max(10, Math.round(config.initialCapital * safeKelly));
    } else {
      // proportional
      amount = Math.max(10, Math.round(config.initialCapital * config.maxBetFraction));
    }

    return this.placeBet(matchId, analysis.provider, team, odds, amount);
  }

  /**
   * 计算单个 provider 的模拟统计
   */
  calculateProviderStats(
    provider: LLMProvider,
    bets: SimulatedBet[],
    initialCapital: number,
  ): ProviderSimulationStats {
    const providerBets = bets.filter((b) => b.provider === provider);
    const settled = providerBets.filter((b) => b.result !== 'pending');
    const won = settled.filter((b) => b.result === 'won');
    const lost = settled.filter((b) => b.result === 'lost');
    const pending = providerBets.filter((b) => b.result === 'pending');

    const totalStaked = providerBets.reduce((s, b) => s + b.amount, 0);
    const totalPnl = settled.reduce((s, b) => s + b.profitLoss, 0);
    const winRate = settled.length > 0 ? won.length / settled.length : 0;
    const roi = totalStaked > 0 ? totalPnl / totalStaked : 0;

    // Sharpe ratio
    const pnlSeries = settled
      .filter((b) => b.settledAt)
      .sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : 1))
      .map((b) => b.profitLoss);
    const sharpeRatio = this.calculateSharpe(pnlSeries);

    // Max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(pnlSeries, initialCapital);

    return {
      provider,
      totalBets: providerBets.length,
      settledBets: settled.length,
      wonBets: won.length,
      lostBets: lost.length,
      pendingBets: pending.length,
      winRate: Math.round(winRate * 10000) / 10000,
      totalStaked: Math.round(totalStaked * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      roi: Math.round(roi * 10000) / 10000,
      currentEquity: Math.round((initialCapital + totalPnl) * 100) / 100,
      initialCapital,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
    };
  }

  private calculateSharpe(pnlSeries: number[]): number {
    if (pnlSeries.length < 2) return 0;
    const mean = pnlSeries.reduce((a, b) => a + b, 0) / pnlSeries.length;
    const variance = pnlSeries.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnlSeries.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (mean / stdDev) * Math.sqrt(252);
  }

  private calculateMaxDrawdown(pnlSeries: number[], initialCapital: number): number {
    if (pnlSeries.length === 0) return 0;
    let cumulative = initialCapital;
    let peak = initialCapital;
    let maxDrawdown = 0;
    for (const pnl of pnlSeries) {
      cumulative += pnl;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown * 100;
  }
}
