import type { CopyTrade, CopyTradeSettlementStatus } from '../types/index';
import type { TokenResolutionInfo } from './wallet-performance-engine';

export interface CopyTradeSettlement {
  pnl: number;
  settlementStatus: CopyTradeSettlementStatus;
  resolvedAt?: string;
}

/**
 * Settle paper copy trades against resolved markets.
 */
export class CopyTradeSettlementEngine {
  settleTrade(
    trade: CopyTrade,
    tokenMap: Map<string, TokenResolutionInfo>,
    outcomeHint?: string,
  ): CopyTradeSettlement {
    if (trade.status !== 'filled' || trade.side !== 'buy') {
      return { pnl: 0, settlementStatus: 'pending' };
    }

    const tokenInfo = tokenMap.get(trade.tokenId);
    if (!tokenInfo) {
      return { pnl: 0, settlementStatus: 'pending' };
    }

    const heldOutcome = this.normalizeOutcome(outcomeHint ?? tokenInfo.outcomeLabel);
    const winningOutcome = this.normalizeOutcome(tokenInfo.resolvedOutcome);
    if (heldOutcome === 'unknown' || winningOutcome === 'unknown') {
      return { pnl: 0, settlementStatus: 'pending' };
    }

    const wager = Math.max(0, trade.amount);
    const won = heldOutcome === winningOutcome;
    const pnl = won ? this.pnlForWinningBuy(trade) : -wager;

    return {
      pnl: round2(pnl),
      settlementStatus: won ? 'won' : 'lost',
      resolvedAt: new Date().toISOString(),
    };
  }

  private pnlForWinningBuy(trade: CopyTrade): number {
    const wager = Math.max(0, trade.amount);
    const price = clamp(trade.price, 0.01, 0.99);
    return round2(wager * (1 - price) / price);
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
