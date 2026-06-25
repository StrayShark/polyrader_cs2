import {
  WalletPerformanceEngine,
  WhaleScoringEngine,
  type WalletPerformanceMetrics,
  type Whale,
  type WhaleTrade,
} from '@polyrader/core';
import { WhaleRepository, MarketRepository } from '@polyrader/infra';
import { logger } from '../utils/logger';

export interface WhaleLeaderboardOptions {
  limit?: number;
  minSamples?: number;
  minWinRate?: number;
}

export class WalletPerformanceService {
  private engine = new WalletPerformanceEngine();
  private scoringEngine = new WhaleScoringEngine();
  private whaleRepo = new WhaleRepository();
  private marketRepo = new MarketRepository();

  /**
   * Recompute win rate / PnL for every address with whale trades
   * and persist results to the whales table.
   */
  async recalculateAll(): Promise<{ addressesUpdated: number }> {
    const markets = this.marketRepo.findResolvedMarkets()
      .filter((market) => this.marketRepo.isCs2MarketRecord(market));
    const tokenMap = this.engine.buildTokenResolutionMap(markets);
    const cs2TokenIds = new Set(tokenMap.keys());
    const addresses = this.whaleRepo.findDistinctAddresses();

    let addressesUpdated = 0;
    for (const address of addresses) {
      try {
        const trades = this.whaleRepo.getAllTrades(address)
          .filter((trade) => cs2TokenIds.has(trade.marketId));
        if (trades.length === 0) continue;

        this.ensureWhaleRow(address, trades);
        const metrics = this.engine.computeAddressPerformance(address, trades, tokenMap);
        this.whaleRepo.updatePerformance(address, {
          winRate: metrics.winRate,
          totalPnl: metrics.totalPnl,
          settledBets: metrics.settledBets,
          wins: metrics.wins,
          losses: metrics.losses,
          totalWagered: metrics.totalWagered,
          roi: metrics.roi,
        });
        addressesUpdated++;
      } catch (err) {
        logger.warn('[WalletPerformance] Failed to recalculate address', {
          address,
          error: (err as Error).message,
        });
      }
    }

    logger.info('[WalletPerformance] Recalculation complete', {
      addressesUpdated,
      resolvedMarkets: markets.length,
    });

    return { addressesUpdated };
  }

  getLeaderboard(options: WhaleLeaderboardOptions = {}): Whale[] {
    const limit = options.limit ?? 50;
    const minSamples = options.minSamples ?? 5;
    const minWinRate = options.minWinRate ?? 0;

    const whales = this.whaleRepo.findByWinRate(limit, minSamples, minWinRate);
    return whales.map((w) => this.rescoreSuspicious(w));
  }

  getAddressPerformance(address: string): WalletPerformanceMetrics | null {
    const markets = this.marketRepo.findResolvedMarkets();
    const tokenMap = this.engine.buildTokenResolutionMap(markets);
    const trades = this.whaleRepo.getAllTrades(address);
    if (trades.length === 0) return null;
    return this.engine.computeAddressPerformance(address, trades, tokenMap);
  }

  private ensureWhaleRow(address: string, trades: WhaleTrade[]): void {
    if (this.whaleRepo.findByAddress(address)) return;

    const totalVolume = trades.reduce((sum, t) => sum + t.amount, 0);
    const activePositions = new Set(trades.map((t) => t.marketId)).size;
    const scored = this.scoringEngine.scoreWhale(
      address,
      trades.slice(-100),
      totalVolume,
      activePositions,
      0,
      0,
    );

    this.whaleRepo.upsert({
      address,
      totalVolume,
      totalPositions: trades.length,
      activePositions,
      winRate: 0,
      pnl: 0,
      suspiciousScore: scored.suspiciousScore,
      recentTrades: trades.slice(-10),
      lastActive: trades.at(-1)?.timestamp ?? new Date().toISOString(),
    });
  }

  private rescoreSuspicious(whale: Whale): Whale {
    const trades = this.whaleRepo.getTrades(whale.address, 100);
    const correlationData = this.whaleRepo.findCorrelationData(whale.address);
    return this.scoringEngine.scoreWhale(
      whale.address,
      trades,
      whale.totalVolume,
      whale.activePositions,
      whale.winRate,
      whale.pnl,
      correlationData,
    );
  }
}
