import {
  CopySignalEngine,
  CopyTradeSettlementEngine,
  WalletPerformanceEngine,
  type WhaleTrade,
  type WalletCopySignal,
  type FollowedWallet,
  type WalletCopyConfig,
  type CopyTrade,
} from '@polyrader/core';
import {
  WalletFollowRepository,
  WhaleRepository,
  MarketRepository,
  PolymarketClobClient,
} from '@polyrader/infra';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

export class WalletFollowService {
  private repo = new WalletFollowRepository();
  private whaleRepo = new WhaleRepository();
  private marketRepo = new MarketRepository();
  private engine = new CopySignalEngine();
  private settlementEngine = new CopyTradeSettlementEngine();
  private clobClient = new PolymarketClobClient();

  listFollowed(): FollowedWallet[] {
    return this.repo.listFollowed();
  }

  follow(input: {
    address: string;
    label?: string;
    minTradeUsd?: number;
    alertsEnabled?: boolean;
    autoCopyEnabled?: boolean;
  }): FollowedWallet {
    return this.repo.follow({
      address: input.address.toLowerCase(),
      label: input.label,
      minTradeUsd: input.minTradeUsd ?? 500,
      alertsEnabled: input.alertsEnabled ?? true,
      autoCopyEnabled: input.autoCopyEnabled ?? false,
      createdAt: new Date().toISOString(),
    });
  }

  unfollow(address: string): boolean {
    return this.repo.unfollow(address);
  }

  updateFollow(
    address: string,
    partial: Partial<Pick<FollowedWallet, 'label' | 'minTradeUsd' | 'alertsEnabled' | 'autoCopyEnabled'>>,
  ): FollowedWallet {
    const wallet = this.repo.updateFollow(address, partial);
    if (!wallet) {
      throw new Error('Wallet not followed');
    }
    return wallet;
  }

  getConfig(): WalletCopyConfig {
    return this.repo.getConfig();
  }

  updateConfig(partial: Partial<WalletCopyConfig>): WalletCopyConfig {
    return this.repo.updateConfig({ ...partial, mode: 'paper' });
  }

  listSignals(limit = 50, status?: WalletCopySignal['status']): WalletCopySignal[] {
    return this.repo.listSignals(limit, status).map((signal) => this.enrichSignal(signal));
  }

  private enrichSignal(signal: WalletCopySignal): WalletCopySignal {
    const market =
      this.marketRepo.findByTokenId(signal.tokenId)
      ?? (signal.conditionId ? this.marketRepo.findByConditionId(signal.conditionId) : null);
    return market?.slug ? { ...signal, marketSlug: market.slug } : signal;
  }

  listCopyTrades(limit = 50): CopyTrade[] {
    return this.repo.listCopyTrades(limit);
  }

  getCopyTradeSummary(): { totalPnl: number; settled: number; wins: number; losses: number } {
    return this.repo.getCopyTradeSummary();
  }

  /**
   * Settle filled paper copy trades against resolved markets.
   */
  settleCopyTrades(): { settled: number } {
    const markets = this.marketRepo.findResolvedMarkets()
      .filter((market) => this.marketRepo.isCs2MarketRecord(market));
    const performanceEngine = new WalletPerformanceEngine();
    const resolutionMap = performanceEngine.buildTokenResolutionMap(markets);

    const pending = this.repo.listUnsettledCopyTrades();
    let settled = 0;

    for (const trade of pending) {
      const signal = this.repo.getSignal(trade.signalId);
      const result = this.settlementEngine.settleTrade(
        trade,
        resolutionMap,
        trade.outcome ?? signal?.outcome,
      );
      if (result.settlementStatus === 'pending') continue;

      this.repo.updateCopyTradeSettlement(trade.id, {
        pnl: result.pnl,
        settlementStatus: result.settlementStatus,
        resolvedAt: result.resolvedAt,
      });
      settled += 1;
    }

    if (settled > 0) {
      logger.info('[CopyTrade] Settlement complete', { settled });
    }

    return { settled };
  }

  /**
   * Called when a new whale trade is ingested from chain.
   */
  async processNewWhaleTrade(address: string, trade: WhaleTrade): Promise<WalletCopySignal | null> {
    const normalized = address.toLowerCase();
    const followed = this.repo.getFollowed(normalized);
    if (!followed) return null;

    if (trade.amount < followed.minTradeUsd) return null;

    const market = this.marketRepo.findByTokenId(trade.marketId);
    const config = this.repo.getConfig();

    if (config.cs2Only && !this.marketRepo.isCs2MarketRecord(market)) {
      return null;
    }

    if (!market) return null;

    const marketVolumeUsd = this.marketRepo.getMarketVolumeUsd(market);
    const whale = this.whaleRepo.findByAddress(normalized);
    const leaderWinRate = whale?.winRate ?? 0;
    const leaderSettledBets = whale?.settledBets ?? 0;

    let currentMid: number | undefined;
    try {
      currentMid = await this.clobClient.getMidpoint(trade.marketId);
    } catch {
      // midpoint optional for signal creation
    }

    const sizingInput = {
      config,
      leaderAmount: trade.amount,
      leaderPrice: trade.price,
      leaderWinRate,
      leaderSettledBets,
      side: trade.type,
      isCs2Market: this.marketRepo.isCs2MarketRecord(market),
      marketVolumeUsd,
      currentMidPrice: currentMid,
      dailyCopiedUsd: this.repo.getDailyCopiedUsd(),
    };

    const volumeShare = this.engine.computeLeaderVolumeShare(trade.amount, marketVolumeUsd);
    const sizing = this.engine.computeMirrorSize(sizingInput, { forSignalPreview: true });
    const signal = this.repo.insertSignal({
      leaderAddress: normalized,
      leaderTxHash: trade.txHash,
      tokenId: trade.marketId,
      conditionId: market.conditionId,
      marketQuestion: market.question,
      outcome: trade.outcome,
      side: trade.type,
      leaderAmount: trade.amount,
      leaderPrice: trade.price,
      suggestedAmount: sizing.accepted ? sizing.amount : undefined,
      leaderWinRate,
      leaderSettledBets,
      leaderVolumeShare: volumeShare,
      status: sizing.accepted ? 'pending' : 'skipped',
      skipReason: sizing.accepted ? undefined : sizing.reason,
    });

    if (!signal) return null;

    const enriched = this.enrichSignal(signal);

    if (followed.alertsEnabled) {
      broadcast('copy-signals', {
        type: 'copy-signal:new',
        signal: enriched,
        sizingReason: sizing.reason,
      });
    }

    const shouldAutoCopy =
      config.enabled &&
      followed.autoCopyEnabled &&
      sizing.accepted &&
      !config.requireUserConfirm;

    if (shouldAutoCopy) {
      await this.executeSignal(enriched.id);
    }

    return enriched;
  }

  async executeSignal(signalId: string): Promise<CopyTrade> {
    const signal = this.repo.getSignal(signalId);
    if (!signal) {
      throw new Error('Signal not found');
    }
    if (signal.status === 'executed') {
      throw new Error('Signal already executed');
    }
    if (signal.status === 'skipped') {
      throw new Error(signal.skipReason ?? 'Signal was skipped');
    }

    const config = this.repo.getConfig();
    const amount = signal.suggestedAmount ?? 0;
    if (amount <= 0) {
      this.repo.updateSignalStatus(signalId, 'failed', 'No suggested copy size');
      throw new Error('No suggested copy size');
    }

    const market = this.marketRepo.findByTokenId(signal.tokenId);
    const whale = this.whaleRepo.findByAddress(signal.leaderAddress);
    const executeRisk = this.engine.evaluateRisk({
      config,
      leaderAmount: signal.leaderAmount,
      leaderPrice: signal.leaderPrice,
      leaderWinRate: whale?.winRate ?? signal.leaderWinRate ?? 0,
      leaderSettledBets: whale?.settledBets ?? signal.leaderSettledBets ?? 0,
      side: signal.side,
      isCs2Market: market
        ? this.marketRepo.isCs2MarketRecord(market)
        : this.marketRepo.isCs2Market(signal.marketQuestion),
      marketVolumeUsd: this.marketRepo.getMarketVolumeUsd(market),
      dailyCopiedUsd: this.repo.getDailyCopiedUsd(),
    });
    if (!executeRisk.allowed) {
      this.repo.updateSignalStatus(signalId, 'failed', executeRisk.reason);
      throw new Error(executeRisk.reason);
    }

    const trade = this.repo.insertCopyTrade({
      signalId,
      mode: 'paper',
      tokenId: signal.tokenId,
      side: signal.side,
      amount,
      price: signal.leaderPrice,
      status: 'filled',
      executedAt: new Date().toISOString(),
      marketQuestion: signal.marketQuestion ?? market?.question,
      outcome: signal.outcome,
    });

    this.repo.updateSignalStatus(signalId, 'executed');
    broadcast('copy-signals', { type: 'copy-trade:executed', trade, signalId });
    logger.info('[CopyTrade] Paper fill', { signalId, amount, tokenId: signal.tokenId });
    return trade;
  }
}
