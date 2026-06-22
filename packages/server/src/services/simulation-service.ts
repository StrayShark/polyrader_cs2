import { SimulatedBettingEngine, BacktestEngine } from '@polyrader/core';
import type { SimulationConfig, ProviderSimulationStats, EquityCurvePoint, SimulatedBet, LLMAnalysisResult, LLMProvider } from '@polyrader/core';
import { SimulationRepository, LLMRepository } from '@polyrader/infra';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

export class SimulationService {
  private simRepo = new SimulationRepository();
  private llmRepo = new LLMRepository();
  private bettingEngine = new SimulatedBettingEngine();
  private backtestEngine = new BacktestEngine();

  getConfig(): SimulationConfig {
    return this.simRepo.getConfig();
  }

  updateConfig(config: Partial<SimulationConfig>): SimulationConfig {
    return this.simRepo.updateConfig(config);
  }

  /**
   * 根据LLM分析结果自动下注。在 analyze() 完成后调用。
   * 为每个参与模拟盘的LLM各生成一条 simulated_bet。
   */
  autoBetFromAnalysis(
    matchId: string,
    analysisResults: LLMAnalysisResult[],
    marketProb: number,
    teamAName: string,
    teamBName: string,
  ): SimulatedBet[] {
    const config = this.getConfig();
    if (!config.enabled) return [];

    const bets: SimulatedBet[] = [];
    for (const analysis of analysisResults) {
      // 检查该 provider 是否在参与列表中
      if (config.participatingProviders.length > 0 &&
          !config.participatingProviders.includes(analysis.provider)) {
        continue;
      }

      const bet = this.bettingEngine.placeBetFromAnalysis(
        matchId, analysis, config, marketProb, teamAName, teamBName,
      );
      if (bet) {
        this.llmRepo.upsertBet(bet);
        bets.push(bet);
      }
    }

    if (bets.length > 0) {
      logger.info('Simulation: auto bets placed', {
        matchId, count: bets.length,
        providers: bets.map(b => b.provider),
      });
      broadcast('simulation', {
        type: 'simulation:bets_placed',
        matchId,
        bets: bets.map(b => ({
          id: b.id, provider: b.provider, team: b.team,
          amount: b.amount, odds: b.odds,
        })),
        count: bets.length,
        timestamp: Date.now(),
      });
    }
    return bets;
  }

  /**
   * 获取所有参与provider的模拟统计
   */
  getProviderStats(): ProviderSimulationStats[] {
    const config = this.getConfig();
    const providers = config.participatingProviders.length > 0
      ? config.participatingProviders
      : ['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan'] as LLMProvider[];

    const allBets = this.llmRepo.getBetsByProviders(providers, 1000);
    return providers.map(p =>
      this.bettingEngine.calculateProviderStats(p, allBets, config.initialCapital),
    );
  }

  /**
   * 获取指定provider的权益曲线
   */
  getEquityCurve(provider: LLMProvider): EquityCurvePoint[] {
    const config = this.getConfig();
    return this.llmRepo.getEquityCurveByProvider(provider, config.initialCapital);
  }

  /**
   * 获取所有参与provider的权益曲线（用于多线对比）
   */
  getAllEquityCurves(): Record<string, EquityCurvePoint[]> {
    const config = this.getConfig();
    const providers = config.participatingProviders.length > 0
      ? config.participatingProviders
      : ['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan'] as LLMProvider[];

    const result: Record<string, EquityCurvePoint[]> = {};
    for (const p of providers) {
      result[p] = this.llmRepo.getEquityCurveByProvider(p, config.initialCapital);
    }
    return result;
  }

  /**
   * 获取指定provider的下注历史
   */
  getBetHistory(provider: LLMProvider, limit = 50): SimulatedBet[] {
    return this.llmRepo.getBetsByProvider(provider, limit);
  }

  /**
   * 回测：使用历史分析数据重放模拟盘
   */
  runBacktest(): {
    providerStats: ProviderSimulationStats[];
    totalBets: number;
  } {
    const config = this.getConfig();
    const historicalAnalyses = this.llmRepo.getHistoricalAnalyses(1000);
    const settledBets = this.llmRepo.getBets(500).filter(b => b.result !== 'pending');

    const result = this.backtestEngine.runBacktest(
      historicalAnalyses, settledBets, config,
    );

    logger.info('Simulation: backtest completed', {
      analyses: historicalAnalyses.length,
      totalBets: result.totalBets,
    });

    return {
      providerStats: result.providerStats,
      totalBets: result.totalBets,
    };
  }
}
