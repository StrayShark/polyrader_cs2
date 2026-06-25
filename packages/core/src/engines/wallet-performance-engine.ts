import type { Market, WhaleTrade } from '../types/index';

export interface TokenResolutionInfo {
  outcomeLabel: string;
  resolvedOutcome: string;
  conditionId: string;
}

export interface WalletPerformanceMetrics {
  address: string;
  settledBets: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalWagered: number;
  roi: number;
  pendingTrades: number;
}

export interface WalletPerformanceOptions {
  /** Minimum settled buy trades required for ranking (default 5) */
  minSettledBets?: number;
  minWinRate?: number;
}

/**
 * WalletPerformanceEngine — settle whale buy trades against resolved markets
 * and compute per-address win rate / PnL / ROI.
 */
export class WalletPerformanceEngine {
  /**
   * Map CLOB token IDs to outcome labels and the market's winning outcome.
   */
  buildTokenResolutionMap(
    markets: Array<Pick<Market, 'conditionId' | 'clobTokenIds' | 'outcomes' | 'resolvedOutcome'>>,
  ): Map<string, TokenResolutionInfo> {
    const map = new Map<string, TokenResolutionInfo>();

    for (const market of markets) {
      const resolved = market.resolvedOutcome?.trim();
      if (!resolved || !market.clobTokenIds?.length) continue;

      market.clobTokenIds.forEach((tokenId, index) => {
        if (!tokenId) return;
        map.set(tokenId, {
          outcomeLabel: market.outcomes[index] ?? 'Unknown',
          resolvedOutcome: resolved,
          conditionId: market.conditionId,
        });
      });
    }

    return map;
  }

  computeAddressPerformance(
    address: string,
    trades: WhaleTrade[],
    tokenMap: Map<string, TokenResolutionInfo>,
  ): WalletPerformanceMetrics {
    let wins = 0;
    let losses = 0;
    let totalPnl = 0;
    let totalWagered = 0;
    let pendingTrades = 0;

    for (const trade of trades) {
      if (trade.type !== 'buy') continue;

      const tokenInfo = tokenMap.get(trade.marketId);
      if (!tokenInfo) {
        pendingTrades++;
        continue;
      }

      const tradeOutcome = this.normalizeOutcome(trade.outcome);
      const heldOutcome = this.normalizeOutcome(
        tradeOutcome !== 'unknown' ? trade.outcome : tokenInfo.outcomeLabel,
      );
      const winningOutcome = this.normalizeOutcome(tokenInfo.resolvedOutcome);

      if (heldOutcome === 'unknown' || winningOutcome === 'unknown') {
        pendingTrades++;
        continue;
      }

      const wager = Math.max(0, trade.amount);
      totalWagered += wager;

      if (heldOutcome === winningOutcome) {
        wins++;
        totalPnl += this.pnlForWinningBuy(trade);
      } else {
        losses++;
        totalPnl -= wager;
      }
    }

    const settledBets = wins + losses;
    const winRate = settledBets > 0 ? wins / settledBets : 0;
    const roi = totalWagered > 0 ? totalPnl / totalWagered : 0;

    return {
      address,
      settledBets,
      wins,
      losses,
      winRate: round4(winRate),
      totalPnl: round2(totalPnl),
      totalWagered: round2(totalWagered),
      roi: round4(roi),
      pendingTrades,
    };
  }

  rankByWinRate(
    metrics: WalletPerformanceMetrics[],
    options: WalletPerformanceOptions = {},
  ): WalletPerformanceMetrics[] {
    const minSettled = options.minSettledBets ?? 5;
    const minWinRate = options.minWinRate ?? 0;

    return [...metrics]
      .filter((m) => m.settledBets >= minSettled && m.winRate >= minWinRate)
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.settledBets !== a.settledBets) return b.settledBets - a.settledBets;
        return b.totalPnl - a.totalPnl;
      });
  }

  private pnlForWinningBuy(trade: WhaleTrade): number {
    const wager = Math.max(0, trade.amount);
    const price = clamp(trade.price, 0.01, 0.99);
    return wager * (1 - price) / price;
  }

  private normalizeOutcome(value: string | undefined): string {
    if (!value) return 'unknown';
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'unknown') return 'unknown';
    return normalized;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
