import { SimulatedBettingEngine } from './simulated-betting-engine';
import type { SimulationConfig, ProviderSimulationStats, LLMAnalysisResult, LLMProvider, SimulatedBet } from '../types/index';

/**
 * BacktestEngine — replays historical LLM analyses through the simulation betting engine.
 *
 * Given a set of historical analyses and settled bet outcomes, it re-simulates
 * betting with a given SimulationConfig and returns per-provider performance metrics.
 */
export class BacktestEngine {
  private bettingEngine = new SimulatedBettingEngine();

  /**
   * Run a backtest on historical analyses.
   *
   * @param historicalAnalyses - Past LLM analysis records (ordered by time)
   * @param settledBets - Past settled bets (for determining match outcomes)
   * @param config - Simulation config to test
   * @param marketProb - Default market probability (fallback)
   * @returns Per-provider backtest statistics
   */
  runBacktest(
    historicalAnalyses: Array<{
      matchId: string;
      provider: LLMProvider;
      model: string;
      teamAProb: number;
      teamBProb: number;
      confidence: number;
      variantId: string;
      createdAt: string;
    }>,
    settledBets: SimulatedBet[],
    config: SimulationConfig,
    marketProb = 0.5,
  ): {
    providerStats: ProviderSimulationStats[];
    totalBets: number;
    simBets: SimulatedBet[];
  } {
    // Build a lookup of match outcomes from settled bets
    const matchOutcomes = new Map<string, { winner: string; odds: number }>();
    for (const bet of settledBets) {
      if (bet.result === 'won') {
        matchOutcomes.set(bet.matchId, { winner: bet.team, odds: bet.odds });
      } else if (bet.result === 'lost') {
        // If the bet lost, the winner is the other team — but we don't know the other team name.
        // We can infer: if bet.team was 'Team A' and lost, winner is 'Team B', and vice versa.
        const winner = bet.team.startsWith('Team A') ? 'Team B' : 'Team A';
        matchOutcomes.set(bet.matchId, { winner, odds: bet.odds });
      }
    }

    const simBets: SimulatedBet[] = [];

    // Group analyses by matchId to process per-match
    const matchGroups = new Map<string, typeof historicalAnalyses>();
    for (const analysis of historicalAnalyses) {
      const group = matchGroups.get(analysis.matchId);
      if (group) {
        group.push(analysis);
      } else {
        matchGroups.set(analysis.matchId, [analysis]);
      }
    }

    // Replay each match's analyses through the betting engine
    for (const [matchId, analyses] of matchGroups) {
      for (const histAnalysis of analyses) {
        // Check if provider is in participating list
        if (config.participatingProviders.length > 0 &&
            !config.participatingProviders.includes(histAnalysis.provider)) {
          continue;
        }

        // Reconstruct LLMAnalysisResult from historical data
        const analysisResult: LLMAnalysisResult = {
          provider: histAnalysis.provider,
          model: histAnalysis.model,
          winProbability: {
            teamA: histAnalysis.teamAProb,
            teamB: histAnalysis.teamBProb,
          },
          confidence: histAnalysis.confidence,
          reasoning: '',
          keyFactors: [],
          riskAssessment: '',
          latency: 0,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          variantId: histAnalysis.variantId,
        };

        const bet = this.bettingEngine.placeBetFromAnalysis(
          matchId, analysisResult, config, marketProb, 'Team A', 'Team B',
        );

        if (bet) {
          // Settle immediately using known outcome
          const outcome = matchOutcomes.get(matchId);
          if (outcome) {
            bet.result = bet.team === outcome.winner ? 'won' : 'lost';
            bet.profitLoss = bet.result === 'won' ? bet.amount * (bet.odds - 1) : -bet.amount;
            bet.settledAt = histAnalysis.createdAt;
          }
          simBets.push(bet);
        }
      }
    }

    // Calculate per-provider stats
    const providers = config.participatingProviders.length > 0
      ? config.participatingProviders
      : ['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan'] as LLMProvider[];

    const providerStats = providers.map(p =>
      this.bettingEngine.calculateProviderStats(p, simBets, config.initialCapital),
    );

    return {
      providerStats,
      totalBets: simBets.length,
      simBets,
    };
  }
}
