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

export interface WinRateTimelinePoint {
  date: string;
  winRate: number;
  settledBets: number;
  cumulativePnl: number;
}

export interface MarketPerformanceBreakdown {
  marketId: string;
  marketQuestion: string;
  settledBets: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  totalWagered: number;
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

  /**
   * Cumulative win-rate curve over settled buy trades (chronological).
   */
  computeWinRateTimeline(
    trades: WhaleTrade[],
    tokenMap: Map<string, TokenResolutionInfo>,
  ): WinRateTimelinePoint[] {
    const settled = trades
      .filter((trade) => trade.type === 'buy')
      .map((trade) => ({ trade, result: this.settleBuyTrade(trade, tokenMap) }))
      .filter((entry): entry is { trade: WhaleTrade; result: { won: boolean; pnl: number } } => entry.result !== null)
      .sort((a, b) => a.trade.timestamp.localeCompare(b.trade.timestamp));

    let wins = 0;
    let cumulativePnl = 0;
    const points: WinRateTimelinePoint[] = [];

    for (const { trade, result } of settled) {
      if (result.won) wins += 1;
      cumulativePnl += result.pnl;
      const settledBets = points.length + 1;
      points.push({
        date: trade.timestamp.slice(0, 10),
        winRate: round4(wins / settledBets),
        settledBets,
        cumulativePnl: round2(cumulativePnl),
      });
    }

    return points;
  }

  /**
   * Per-market settled performance (top markets by wagered amount).
   */
  computeMarketBreakdown(
    trades: WhaleTrade[],
    tokenMap: Map<string, TokenResolutionInfo>,
    marketLabels: Map<string, string> = new Map(),
    limit = 8,
  ): MarketPerformanceBreakdown[] {
    const buckets = new Map<string, MarketPerformanceBreakdown>();

    for (const trade of trades) {
      if (trade.type !== 'buy') continue;
      const result = this.settleBuyTrade(trade, tokenMap);
      if (!result) continue;

      const tokenInfo = tokenMap.get(trade.marketId)!;
      const key = tokenInfo.conditionId || trade.marketId;
      const existing = buckets.get(key) ?? {
        marketId: key,
        marketQuestion: marketLabels.get(key) ?? marketLabels.get(trade.marketId) ?? `Market ${key.slice(0, 8)}…`,
        settledBets: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pnl: 0,
        totalWagered: 0,
      };

      existing.settledBets += 1;
      existing.totalWagered += Math.max(0, trade.amount);
      existing.pnl = round2(existing.pnl + result.pnl);
      if (result.won) existing.wins += 1;
      else existing.losses += 1;
      existing.winRate = round4(existing.wins / existing.settledBets);
      buckets.set(key, existing);
    }

    return [...buckets.values()]
      .sort((a, b) => b.totalWagered - a.totalWagered)
      .slice(0, limit);
  }

  private settleBuyTrade(
    trade: WhaleTrade,
    tokenMap: Map<string, TokenResolutionInfo>,
  ): { won: boolean; pnl: number } | null {
    const tokenInfo = tokenMap.get(trade.marketId);
    if (!tokenInfo) return null;

    const tradeOutcome = this.normalizeOutcome(trade.outcome);
    const heldOutcome = this.normalizeOutcome(
      tradeOutcome !== 'unknown' ? trade.outcome : tokenInfo.outcomeLabel,
    );
    const winningOutcome = this.normalizeOutcome(tokenInfo.resolvedOutcome);
    if (heldOutcome === 'unknown' || winningOutcome === 'unknown') return null;

    const wager = Math.max(0, trade.amount);
    const won = heldOutcome === winningOutcome;
    const pnl = won ? this.pnlForWinningBuy(trade) : -wager;
    return { won, pnl };
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
