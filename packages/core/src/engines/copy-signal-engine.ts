import type { WalletCopyConfig, CopyTradeSizingResult } from '../types/index';

export interface CopySignalRiskInput {
  config: WalletCopyConfig;
  leaderAmount: number;
  leaderPrice: number;
  leaderWinRate: number;
  leaderSettledBets: number;
  side: 'buy' | 'sell';
  isCs2Market: boolean;
  marketVolumeUsd: number;
  currentMidPrice?: number;
  dailyCopiedUsd: number;
}

/**
 * CopySignalEngine — size mirror orders and run pre-trade risk checks.
 */
export class CopySignalEngine {
  evaluateRisk(input: CopySignalRiskInput, options?: { skipEnabledCheck?: boolean }): { allowed: boolean; reason: string } {
    const { config } = input;

    if (!options?.skipEnabledCheck && !config.enabled) {
      return { allowed: false, reason: 'Copy trading is disabled' };
    }

    if (input.side !== 'buy') {
      return { allowed: false, reason: 'Only leader buy trades are mirrored in Phase 3' };
    }

    if (config.cs2Only && !input.isCs2Market) {
      return { allowed: false, reason: 'Non-CS2 markets are excluded' };
    }

    if (input.leaderAmount < config.minLeaderTradeUsd) {
      return { allowed: false, reason: `Leader trade below minimum $${config.minLeaderTradeUsd}` };
    }

    const marketVolume = Math.max(0, input.marketVolumeUsd);
    if (config.minMarketVolumeUsd > 0 && marketVolume < config.minMarketVolumeUsd) {
      return {
        allowed: false,
        reason: `Market volume $${marketVolume.toFixed(0)} below minimum $${config.minMarketVolumeUsd}`,
      };
    }

    if (marketVolume > 0 && config.minMarketVolumeShare > 0) {
      const share = input.leaderAmount / marketVolume;
      if (share < config.minMarketVolumeShare) {
        return {
          allowed: false,
          reason: `Trade is ${(share * 100).toFixed(2)}% of market volume; need >= ${(config.minMarketVolumeShare * 100).toFixed(1)}%`,
        };
      }
    } else if (config.minMarketVolumeShare > 0) {
      return { allowed: false, reason: 'Market volume unknown — cannot verify relative size' };
    }

    if (input.leaderSettledBets < config.minLeaderSamples) {
      return { allowed: false, reason: `Leader sample size ${input.leaderSettledBets} < ${config.minLeaderSamples}` };
    }

    if (input.leaderWinRate < config.minLeaderWinRate) {
      return { allowed: false, reason: `Leader win rate ${(input.leaderWinRate * 100).toFixed(0)}% below threshold` };
    }

    if (input.dailyCopiedUsd >= config.dailyCapUsd) {
      return { allowed: false, reason: 'Daily copy cap reached' };
    }

    if (input.currentMidPrice !== undefined && input.leaderPrice > 0) {
      const drift = Math.abs(input.currentMidPrice - input.leaderPrice) / input.leaderPrice;
      if (drift > config.maxSlippage) {
        return { allowed: false, reason: `Price drift ${(drift * 100).toFixed(1)}% exceeds slippage limit` };
      }
    }

    return { allowed: true, reason: 'ok' };
  }

  computeLeaderVolumeShare(leaderAmount: number, marketVolumeUsd: number): number {
    if (marketVolumeUsd <= 0) return 0;
    return round4(leaderAmount / marketVolumeUsd);
  }

  computeMirrorSize(input: CopySignalRiskInput, options?: { forSignalPreview?: boolean }): CopyTradeSizingResult {
    const risk = this.evaluateRisk(input, { skipEnabledCheck: options?.forSignalPreview });
    if (!risk.allowed) {
      return { amount: 0, price: input.leaderPrice, accepted: false, reason: risk.reason };
    }

    const raw = input.leaderAmount * input.config.copyRatio;
    const remainingDaily = Math.max(0, input.config.dailyCapUsd - input.dailyCopiedUsd);
    const capped = Math.min(raw, input.config.maxOrderUsd, remainingDaily);
    const amount = round2(Math.max(0, capped));

    if (amount < 1) {
      return { amount: 0, price: input.leaderPrice, accepted: false, reason: 'Computed copy size below $1' };
    }

    const sharePct = (this.computeLeaderVolumeShare(input.leaderAmount, input.marketVolumeUsd) * 100).toFixed(1);
    return {
      amount,
      price: input.leaderPrice,
      accepted: true,
      reason: `Mirror ${(input.config.copyRatio * 100).toFixed(0)}% of leader (${sharePct}% of market vol)`,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
