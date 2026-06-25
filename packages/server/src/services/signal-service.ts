import type {
  DebateArgument,
  DebateInferenceResult,
  MarketBehaviorResult,
  OrderBookSnapshot,
  SignalBacktestSummary,
  SignalComparison,
  SignalSnapshot,
  SignalSource,
  SignalTuningConfig,
  SignalTuningConfigInput,
} from '@polyrader/core';
import {
  DebateInferenceEngine,
  DEFAULT_SIGNAL_TUNING_CONFIG,
  MarketBehaviorEngine,
  SignalComparisonEngine,
  SignalBacktestEngine,
  PredictionEngine,
  mergeSignalTuningConfig,
} from '@polyrader/core';
import type { PricePoint } from '@polyrader/core';
import type { OrderBookSummary, HLTVCrawler } from '@polyrader/infra';
import { cacheDelete, cacheGet, cacheKeys, cacheSet, HLTVCrawler as HLTVCrawlerClass, LLMRepository, SignalRepository, WalletFollowRepository } from '@polyrader/infra';
import { MarketService } from './market-service';
import { WhaleService } from './whale-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

export interface ArbitrageOpportunity {
  marketSlug: string;
  question: string;
  type: 'yes_no_spread' | 'cross_market_spread';
  profitPct: number;
  details: string;
}

export interface ArbitrageResult {
  opportunities: ArbitrageOpportunity[];
}

export class SignalService {
  private engine = new SignalComparisonEngine();
  private predictionEngine = new PredictionEngine();
  private marketBehaviorEngine = new MarketBehaviorEngine();
  private debateInferenceEngine = new DebateInferenceEngine();
  private backtestEngine = new SignalBacktestEngine();
  private marketService = new MarketService();
  private whaleService = new WhaleService();
  private llmRepo = new LLMRepository();
  private signalRepo = new SignalRepository();
  private walletFollowRepo = new WalletFollowRepository();
  private hltvCrawler: HLTVCrawler = new HLTVCrawlerClass();

  async getSignals(marketId: string): Promise<SignalComparison | null> {
    const cacheKey = `signals:${marketId}`;
    const cached = await cacheGet<SignalComparison>(cacheKey);
    if (cached) return cached;

    try {
      const market = await this.marketService.getMarket(marketId);
      if (!market) return null;

      const polymarketProb = parseFloat(market.outcomePrices[0] ?? '0.5');

      // Try to load real match/team data from DB
      const dbMatch = this.llmRepo.getMatch(marketId);
      const matchInfo = dbMatch ? buildMatchInfo(dbMatch) : buildFallbackMatchInfo(marketId);
      const teamA = dbMatch ? loadTeamFromDb(String(dbMatch.team_a_id ?? '')) : buildFallbackTeam('team-a', 'Team A', 10, 0.6);
      const teamB = dbMatch ? loadTeamFromDb(String(dbMatch.team_b_id ?? '')) : buildFallbackTeam('team-b', 'Team B', 20, 0.5);

      const prediction = this.predictionEngine.predict(matchInfo, teamA, teamB, polymarketProb);
      const tuningConfig = this.getActiveTuningConfig();

      const [priceHistory, orderBook, whales, holders, marketPositions] = await Promise.all([
        this.marketService.getPriceHistory(marketId).catch(() => [] as PricePoint[]),
        this.marketService.getOrderBook(marketId).catch(() => null),
        this.whaleService.getWhales({ limit: 50 }).catch(() => []),
        this.marketService.getHolders(marketId, 50).catch(() => []),
        this.marketService.getMarketPositions(marketId, 100).catch(() => []),
      ]);

      const whaleTrades = whales
        .flatMap((whale) => whale.recentTrades)
        .filter((trade) => trade.marketId === marketId);

      const marketBehavior = this.marketBehaviorEngine.analyze({
        marketId,
        marketProb: polymarketProb,
        priceHistory,
        orderBook: this.normalizeOrderBook(orderBook),
        whaleTrades,
        whales,
        holders,
        marketPositions,
        primaryOutcome: market.outcomes[0],
        marketVolume: market.volume24h || market.volume,
        liquidity: market.liquidity,
        tuningConfig,
      });

      const aiDebate = this.buildAiDebateSignal(marketId, polymarketProb);

      // HLTV community "Pick a winner" vote
      const teamAName = teamA.name || String(dbMatch?.team_a_name ?? '');
      const teamBName = teamB.name || String(dbMatch?.team_b_name ?? '');
      const hltvMatchId = dbMatch?.hltv_match_id ? String(dbMatch.hltv_match_id) : undefined;
      let hltvCommunityProb: number | undefined;
      if (teamAName && teamBName) {
        try {
          hltvCommunityProb = await this.hltvCrawler.getCommunityProbForTeams(teamAName, teamBName, hltvMatchId);
        } catch (err) {
          logger.warn('Failed to fetch HLTV community vote', { marketId, error: (err as Error).message });
        }
      }

      const extraSignals = this.buildExtraSignals(marketBehavior, aiDebate);
      const smartWallet = this.buildSmartWalletSignal(market.conditionId);
      if (smartWallet) {
        extraSignals.push(smartWallet);
      }
      const signal = this.engine.compareSignals(
        marketId,
        polymarketProb,
        prediction.winProbability.teamA,
        hltvCommunityProb,
        extraSignals,
        { marketBehavior, aiDebate, tuningConfig },
      );

      this.saveSignalSnapshot(signal, {
        question: market.question,
        resolvedOutcome: market.resolvedOutcome,
        resolvedPrice: market.resolvedPrice,
      });

      await cacheSet(cacheKey, signal, 60);
      return signal;
    } catch (err) {
      logger.warn('Failed to generate signal', { error: (err as Error).message });
      return null;
    }
  }

  async getTopDeviations(limit = 10): Promise<SignalComparison[]> {
    const cacheKey = 'signals:top-deviations';
    const cached = await cacheGet<SignalComparison[]>(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.marketService.getMarkets(50, 0);
      const signals: SignalComparison[] = [];

      for (const market of markets.slice(0, limit)) {
        const signal = await this.getSignals(market.conditionId);
        if (signal && Math.abs(signal.deviation) > 0.05) {
          signals.push(signal);
        }
      }

      signals.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
      await cacheSet(cacheKey, signals, 120);
      return signals;
    } catch (err) {
      logger.warn('Failed to get top deviations', { error: (err as Error).message });
      return [];
    }
  }

  getSignalSnapshots(marketId: string, limit = 50): SignalSnapshot[] {
    return this.signalRepo.findByMarket(marketId, limit);
  }

  getRecentSignalSnapshots(limit = 100): SignalSnapshot[] {
    return this.signalRepo.findRecent(limit);
  }

  getSignalBacktest(limit = 1000, minEdge?: number): SignalBacktestSummary {
    const tuningConfig = this.getActiveTuningConfig();
    try {
      return this.backtestEngine.run(this.signalRepo.findResolved(limit), { minEdge, tuningConfig });
    } catch (err) {
      logger.warn('Failed to load signal snapshots for backtest', { error: (err as Error).message });
      return this.backtestEngine.run([], { minEdge, tuningConfig });
    }
  }

  getTuningConfig(): SignalTuningConfig {
    return this.getActiveTuningConfig();
  }

  updateTuningConfig(config: SignalTuningConfigInput): SignalTuningConfig {
    const updated = this.signalRepo.updateTuningConfig(config);
    void this.clearSignalCaches();
    return updated;
  }

  private getActiveTuningConfig(): SignalTuningConfig {
    try {
      return this.signalRepo.getTuningConfig();
    } catch (err) {
      logger.warn('Failed to load signal tuning config, using defaults', { error: (err as Error).message });
      return mergeSignalTuningConfig(DEFAULT_SIGNAL_TUNING_CONFIG);
    }
  }

  private async clearSignalCaches(): Promise<void> {
    try {
      const keys = await cacheKeys('signals:*');
      await Promise.all(keys.map((key) => cacheDelete(key)));
    } catch (err) {
      logger.warn('Failed to clear signal caches after tuning update', { error: (err as Error).message });
    }
  }

  private saveSignalSnapshot(
    signal: SignalComparison,
    market: {
      question: string;
      resolvedOutcome?: string;
      resolvedPrice?: number;
    },
  ): void {
    try {
      this.signalRepo.insertSnapshot({
        marketId: signal.marketId,
        question: market.question,
        marketProb: signal.polymarketProb,
        predictedProb: signal.predictedProb,
        behaviorProb: signal.marketBehavior?.probability,
        aiDebateProb: signal.aiDebate?.calibratedProbability,
        finalProb: signal.finalProb ?? signal.predictedProb,
        edge: signal.edge ?? ((signal.finalProb ?? signal.predictedProb) - signal.polymarketProb),
        riskAdjustedEdge: signal.riskAdjustedEdge ?? 0,
        recommendation: signal.recommendation ?? 'skip',
        resolvedOutcome: market.resolvedOutcome,
        resolvedPrice: market.resolvedPrice,
        signals: signal.signals,
        marketBehavior: signal.marketBehavior,
        aiDebate: signal.aiDebate,
      });
    } catch (err) {
      logger.warn('Failed to save signal snapshot', {
        marketId: signal.marketId,
        error: (err as Error).message,
      });
    }
  }

  private buildExtraSignals(
    marketBehavior: MarketBehaviorResult,
    aiDebate?: DebateInferenceResult,
  ): SignalSource[] {
    const now = new Date().toISOString();
    const signals: SignalSource[] = [
      {
        source: 'capital_flow',
        probability: marketBehavior.capitalWeightedProb,
        confidence: Math.max(0.1, marketBehavior.confidence * 0.75),
        lastUpdated: now,
        details: {
          concentrationRisk: marketBehavior.concentrationRisk,
          orderBookImbalance: marketBehavior.orderBookImbalance ?? null,
          spread: marketBehavior.spread ?? null,
          slippageRisk: marketBehavior.slippageRisk ?? null,
        },
      },
      {
        source: 'mean_reversion',
        probability: marketBehavior.meanReversionProb,
        confidence: Math.max(0.1, marketBehavior.confidence * 0.8),
        lastUpdated: now,
        details: {
          zScore: marketBehavior.zScore,
          bubbleScore: marketBehavior.bubbleScore,
          meanReversionSuppressed: marketBehavior.meanReversionSuppressed ?? false,
        },
      },
      {
        source: 'whale_flow',
        probability: marketBehavior.whaleAdjustedProb,
        confidence: Math.max(0.1, marketBehavior.confidence * 0.7),
        lastUpdated: now,
        details: {
          direction: marketBehavior.direction,
          smartMoneyProb: marketBehavior.smartMoneyProb ?? null,
          holderWeightedProb: marketBehavior.holderWeightedProb ?? null,
        },
      },
      {
        source: 'market_behavior',
        probability: marketBehavior.probability,
        confidence: marketBehavior.confidence,
        lastUpdated: marketBehavior.updatedAt,
        details: {
          bubbleScore: marketBehavior.bubbleScore,
          concentrationRisk: marketBehavior.concentrationRisk,
          zScore: marketBehavior.zScore,
          orderBookImbalance: marketBehavior.orderBookImbalance ?? null,
          slippageRisk: marketBehavior.slippageRisk ?? null,
          smartMoneyProb: marketBehavior.smartMoneyProb ?? null,
          holderWeightedProb: marketBehavior.holderWeightedProb ?? null,
          holderConcentrationRisk: marketBehavior.holderConcentrationRisk ?? null,
          holderDirectionalBias: marketBehavior.holderDirectionalBias ?? null,
        },
      },
    ];

    if (aiDebate) {
      signals.push({
        source: 'ai_debate',
        probability: aiDebate.calibratedProbability,
        confidence: aiDebate.confidence,
        lastUpdated: aiDebate.generatedAt,
        details: {
          judgeProbability: aiDebate.judgeProbability,
          marketMispricing: aiDebate.marketMispricing,
          evidenceStrength: aiDebate.evidenceStrength,
          verdict: aiDebate.verdict,
        },
      });
    }

    return signals;
  }

  private buildSmartWalletSignal(conditionId: string): SignalSource | null {
    const bias = this.walletFollowRepo.getFollowedMarketBias(conditionId);
    if (!bias) return null;

    return {
      source: 'smart_wallet',
      probability: bias.probability,
      confidence: bias.confidence,
      lastUpdated: new Date().toISOString(),
      details: {
        signalCount: bias.signalCount,
        totalBuyUsd: bias.totalBuyUsd,
        scope: 'followed_leaders',
      },
    };
  }

  private buildAiDebateSignal(marketId: string, marketProb: number): DebateInferenceResult | undefined {
    try {
      const snapshots = this.llmRepo.getAnalysesByMatch(marketId, 48);
      if (snapshots.length === 0) return undefined;

      const latestByProvider = new Map<string, (typeof snapshots)[number]>();
      for (const snapshot of snapshots) {
        latestByProvider.set(snapshot.provider, snapshot);
      }

      const yesArguments: DebateArgument[] = [];
      const noArguments: DebateArgument[] = [];
      for (const snapshot of latestByProvider.values()) {
        const stance: DebateArgument['stance'] = snapshot.teamAProb >= marketProb ? 'yes' : 'no';
        const argument: DebateArgument = {
          stance,
          probability: snapshot.teamAProb,
          confidence: snapshot.confidence,
          evidence: [
            `${snapshot.provider}/${snapshot.model}: ${(snapshot.teamAProb * 100).toFixed(1)}%`,
          ],
          reasoning: `${snapshot.provider} recent analysis ${stance === 'yes' ? 'leans above' : 'leans below'} market price`,
          risks: snapshot.confidence < 0.4 ? ['Low model confidence'] : [],
        };

        if (stance === 'yes') yesArguments.push(argument);
        else noArguments.push(argument);
      }

      return this.debateInferenceEngine.infer({
        marketId,
        marketProb,
        yesArguments,
        noArguments,
        calibrationError: this.getAverageCalibrationError(),
      });
    } catch (err) {
      logger.warn('Failed to build AI debate signal', { marketId, error: (err as Error).message });
      return undefined;
    }
  }

  private getAverageCalibrationError(): number | undefined {
    const stats = this.llmRepo.getAllStats();
    if (stats.length === 0) return undefined;
    return stats.reduce((sum, stat) => sum + stat.calibrationError, 0) / stats.length;
  }

  private normalizeOrderBook(orderBook: OrderBookSummary | null): OrderBookSnapshot | undefined {
    if (!orderBook) return undefined;
    return {
      bids: orderBook.bids.map((level) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      })).filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size)),
      asks: orderBook.asks.map((level) => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      })).filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size)),
    };
  }

  async getStats(): Promise<{
    accuracy: number;
    brierScore: number;
    totalPredictions: number;
  }> {
    const cacheKey = 'signals:stats';
    const cached = await cacheGet<{ accuracy: number; brierScore: number; totalPredictions: number }>(cacheKey);
    if (cached) return cached;

    try {
      const bets = this.llmRepo.getBets(500);
      const settled = bets.filter((b) => b.result !== 'pending');

      const totalPredictions = settled.length;
      const correctPredictions = settled.filter((b) => b.result === 'won').length;
      const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

      const brierScore = totalPredictions > 0
        ? settled.reduce((sum, b) => {
            const predicted = b.odds > 0 ? 1 / b.odds : 0.5;
            const actual = b.result === 'won' ? 1 : 0;
            return sum + (predicted - actual) ** 2;
          }, 0) / totalPredictions
        : 0;

      const stats = { accuracy, brierScore, totalPredictions };
      await cacheSet(cacheKey, stats, 300);
      return stats;
    } catch (err) {
      logger.warn('Failed to compute signal stats', { error: (err as Error).message });
      return { accuracy: 0, brierScore: 0, totalPredictions: 0 };
    }
  }

  async getArbitrageOpportunities(): Promise<ArbitrageResult> {
    const cacheKey = 'signals:arbitrage';
    const cached = await cacheGet<ArbitrageResult>(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.marketService.getMarkets(100, 0);
      const opportunities: ArbitrageOpportunity[] = [];

      // 1. Detect Yes/No price sum < 1 (same-market arbitrage)
      for (const market of markets) {
        if (market.outcomePrices.length < 2) continue;
        const yesPrice = parseFloat(market.outcomePrices[0] ?? '0');
        const noPrice = parseFloat(market.outcomePrices[1] ?? '0');
        if (!Number.isFinite(yesPrice) || !Number.isFinite(noPrice)) continue;
        if (yesPrice <= 0 || noPrice <= 0) continue;

        const sum = yesPrice + noPrice;
        if (sum < 1) {
          const profitPct = (1 - sum) * 100;
          opportunities.push({
            marketSlug: market.slug,
            question: market.question,
            type: 'yes_no_spread',
            profitPct,
            details: `Yes: ${(yesPrice * 100).toFixed(1)}% + No: ${(noPrice * 100).toFixed(1)}% = ${(sum * 100).toFixed(1)}%`,
          });
        }
      }

      // 2. Detect cross-market price differences (markets sharing tags)
      const marketGroups = new Map<string, typeof markets>();
      for (const market of markets) {
        const tags = market.tags ?? [];
        for (const tag of tags) {
          if (!tag) continue;
          const key = tag.toLowerCase();
          const group = marketGroups.get(key);
          if (group) {
            group.push(market);
          } else {
            marketGroups.set(key, [market]);
          }
        }
      }

      for (const [groupKey, groupMarkets] of marketGroups) {
        if (groupMarkets.length < 2) continue;
        for (let i = 0; i < groupMarkets.length; i++) {
          for (let j = i + 1; j < groupMarkets.length; j++) {
            const m1 = groupMarkets[i];
            const m2 = groupMarkets[j];
            const p1 = parseFloat(m1.outcomePrices[0] ?? '0');
            const p2 = parseFloat(m2.outcomePrices[0] ?? '0');
            if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;

            const diff = Math.abs(p1 - p2);
            if (diff > 0.02) {
              opportunities.push({
                marketSlug: `${m1.slug} | ${m2.slug}`,
                question: `${m1.question} / ${m2.question}`,
                type: 'cross_market_spread',
                profitPct: diff * 100,
                details: `Tag: ${groupKey} | Price diff: ${(diff * 100).toFixed(1)}% (${(p1 * 100).toFixed(1)}% vs ${(p2 * 100).toFixed(1)}%)`,
              });
            }
          }
        }
      }

      opportunities.sort((a, b) => b.profitPct - a.profitPct);

      const result: ArbitrageResult = { opportunities };
      await cacheSet(cacheKey, result, 120);
      return result;
    } catch (err) {
      logger.warn('Failed to detect arbitrage opportunities', { error: (err as Error).message });
      return { opportunities: [] };
    }
  }

  /**
   * Scan for arbitrage opportunities and broadcast via WebSocket.
   * Called by cron job every 2 minutes.
   */
  async scanAndBroadcastArbitrage(): Promise<void> {
    try {
      const result = await this.getArbitrageOpportunities();
      if (result.opportunities.length > 0) {
        broadcast('arbitrage', {
          type: 'arbitrage:update',
          opportunities: result.opportunities,
          count: result.opportunities.length,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.warn('Failed to broadcast arbitrage', { error: (err as Error).message });
    }
  }

}
