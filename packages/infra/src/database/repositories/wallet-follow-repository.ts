import { query, queryOne, getDb } from '../connection';
import type {
  FollowedWallet,
  WalletCopyConfig,
  WalletCopySignal,
  CopyTrade,
} from '@polyrader/core';
import { randomUUID } from 'crypto';

export class WalletFollowRepository {
  listFollowed(): FollowedWallet[] {
    const rows = query<Record<string, unknown>>(
      `SELECT fw.*, w.win_rate, w.settled_bets, w.pnl
       FROM followed_wallets fw
       LEFT JOIN whales w ON w.address = fw.address
       ORDER BY fw.created_at DESC`,
    );
    return rows.map(this.mapFollowedRow);
  }

  isFollowed(address: string): boolean {
    const row = queryOne<{ address: string }>(
      `SELECT address FROM followed_wallets WHERE address = ?`,
      address.toLowerCase(),
    );
    return Boolean(row);
  }

  follow(wallet: FollowedWallet): FollowedWallet {
    query(
      `INSERT INTO followed_wallets (address, label, min_trade_usd, alerts_enabled, auto_copy_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
       ON CONFLICT(address) DO UPDATE SET
         label = COALESCE(excluded.label, followed_wallets.label),
         min_trade_usd = excluded.min_trade_usd,
         alerts_enabled = excluded.alerts_enabled,
         auto_copy_enabled = excluded.auto_copy_enabled`,
      wallet.address.toLowerCase(),
      wallet.label ?? null,
      wallet.minTradeUsd,
      wallet.alertsEnabled ? 1 : 0,
      wallet.autoCopyEnabled ? 1 : 0,
      wallet.createdAt ?? null,
    );
    return this.getFollowed(wallet.address)!;
  }

  getFollowed(address: string): FollowedWallet | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT fw.*, w.win_rate, w.settled_bets, w.pnl
       FROM followed_wallets fw
       LEFT JOIN whales w ON w.address = fw.address
       WHERE fw.address = ?`,
      address.toLowerCase(),
    );
    return row ? this.mapFollowedRow(row) : null;
  }

  unfollow(address: string): boolean {
    const result = getDb().prepare(`DELETE FROM followed_wallets WHERE address = ?`).run(address.toLowerCase());
    return result.changes > 0;
  }

  updateFollow(
    address: string,
    partial: Partial<Pick<FollowedWallet, 'label' | 'minTradeUsd' | 'alertsEnabled' | 'autoCopyEnabled'>>,
  ): FollowedWallet | null {
    const current = this.getFollowed(address);
    if (!current) return null;

    return this.follow({
      ...current,
      label: partial.label ?? current.label,
      minTradeUsd: partial.minTradeUsd ?? current.minTradeUsd,
      alertsEnabled: partial.alertsEnabled ?? current.alertsEnabled,
      autoCopyEnabled: partial.autoCopyEnabled ?? current.autoCopyEnabled,
    });
  }

  /**
   * Aggregate recent copy signals from followed wallets for signal fusion (Phase 4).
   */
  getFollowedMarketBias(conditionId: string, hours = 72): {
    probability: number;
    confidence: number;
    signalCount: number;
    totalBuyUsd: number;
  } | null {
    const rows = query<Record<string, unknown>>(
      `SELECT s.leader_amount, s.leader_price, s.leader_win_rate, s.side
       FROM wallet_copy_signals s
       INNER JOIN followed_wallets fw ON fw.address = s.leader_address
       WHERE s.condition_id = ?
         AND s.status IN ('pending', 'executed')
         AND s.side = 'buy'
         AND s.created_at >= datetime('now', ?)
       ORDER BY s.created_at DESC
       LIMIT 20`,
      conditionId,
      `-${hours} hours`,
    );
    if (rows.length === 0) return null;

    let weightedProb = 0;
    let weightSum = 0;
    let totalBuyUsd = 0;

    for (const row of rows) {
      const amount = Number(row.leader_amount);
      const price = Number(row.leader_price);
      const winRate = Number(row.leader_win_rate ?? 0.5);
      const weight = Math.max(amount, 1) * Math.max(winRate, 0.35);
      weightedProb += price * weight;
      weightSum += weight;
      totalBuyUsd += amount;
    }

    if (weightSum <= 0) return null;

    const probability = weightedProb / weightSum;
    const signalCount = rows.length;
    const confidence = Math.min(0.85, 0.25 + signalCount * 0.08);

    return { probability, confidence, signalCount, totalBuyUsd };
  }

  listRecentFollowedSignals(limit = 10): WalletCopySignal[] {
    const rows = query<Record<string, unknown>>(
      `SELECT s.*
       FROM wallet_copy_signals s
       INNER JOIN followed_wallets fw ON fw.address = s.leader_address
       WHERE s.status IN ('pending', 'executed')
       ORDER BY s.created_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map(this.mapSignalRow);
  }

  getConfig(): WalletCopyConfig {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM wallet_copy_config WHERE id = 'default'`,
    );
    return row ? this.mapConfigRow(row) : defaultConfig();
  }

  updateConfig(partial: Partial<WalletCopyConfig>): WalletCopyConfig {
    const current = this.getConfig();
    const next = { ...current, ...partial, mode: 'paper' as const };
    query(
      `UPDATE wallet_copy_config SET
         enabled = ?,
         mode = ?,
         copy_ratio = ?,
         max_order_usd = ?,
         min_leader_trade_usd = ?,
         max_slippage = ?,
         cs2_only = ?,
         min_leader_win_rate = ?,
         min_leader_samples = ?,
         daily_cap_usd = ?,
         require_user_confirm = ?,
         min_market_volume_share = ?,
         min_market_volume_usd = ?,
         updated_at = datetime('now')
       WHERE id = 'default'`,
      next.enabled ? 1 : 0,
      next.mode,
      next.copyRatio,
      next.maxOrderUsd,
      next.minLeaderTradeUsd,
      next.maxSlippage,
      next.cs2Only ? 1 : 0,
      next.minLeaderWinRate,
      next.minLeaderSamples,
      next.dailyCapUsd,
      next.requireUserConfirm ? 1 : 0,
      next.minMarketVolumeShare,
      next.minMarketVolumeUsd,
    );
    return this.getConfig();
  }

  insertSignal(signal: Omit<WalletCopySignal, 'id' | 'createdAt'>): WalletCopySignal | null {
    const id = randomUUID();
    const result = getDb().prepare(
      `INSERT OR IGNORE INTO wallet_copy_signals (
         id, leader_address, leader_tx_hash, token_id, condition_id, market_question,
         outcome, side, leader_amount, leader_price, suggested_amount,
         leader_win_rate, leader_settled_bets, leader_volume_share, status, skip_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      signal.leaderAddress.toLowerCase(),
      signal.leaderTxHash,
      signal.tokenId,
      signal.conditionId ?? null,
      signal.marketQuestion ?? null,
      signal.outcome ?? null,
      signal.side,
      signal.leaderAmount,
      signal.leaderPrice,
      signal.suggestedAmount ?? null,
      signal.leaderWinRate ?? null,
      signal.leaderSettledBets ?? null,
      signal.leaderVolumeShare ?? null,
      signal.status,
      signal.skipReason ?? null,
    );
    if (result.changes === 0) return null;
    return this.getSignal(id);
  }

  getSignal(id: string): WalletCopySignal | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM wallet_copy_signals WHERE id = ?`,
      id,
    );
    return row ? this.mapSignalRow(row) : null;
  }

  listSignals(limit = 50, status?: WalletCopySignal['status']): WalletCopySignal[] {
    if (status) {
      const rows = query<Record<string, unknown>>(
        `SELECT * FROM wallet_copy_signals WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
        status,
        limit,
      );
      return rows.map(this.mapSignalRow);
    }
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM wallet_copy_signals ORDER BY created_at DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapSignalRow);
  }

  updateSignalStatus(id: string, status: WalletCopySignal['status'], skipReason?: string): void {
    query(
      `UPDATE wallet_copy_signals SET status = ?, skip_reason = COALESCE(?, skip_reason) WHERE id = ?`,
      status,
      skipReason ?? null,
      id,
    );
  }

  insertCopyTrade(trade: Omit<CopyTrade, 'id' | 'createdAt'>): CopyTrade {
    const id = randomUUID();
    query(
      `INSERT INTO copy_trades (
         id, signal_id, mode, token_id, side, amount, price, status,
         error_message, clob_order_id, executed_at, market_question, outcome
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      trade.signalId,
      trade.mode,
      trade.tokenId,
      trade.side,
      trade.amount,
      trade.price,
      trade.status,
      trade.errorMessage ?? null,
      trade.clobOrderId ?? null,
      trade.executedAt ?? null,
      trade.marketQuestion ?? null,
      trade.outcome ?? null,
    );
    return this.getCopyTrade(id)!;
  }

  getCopyTrade(id: string): CopyTrade | null {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM copy_trades WHERE id = ?`, id);
    return row ? this.mapCopyTradeRow(row) : null;
  }

  listCopyTrades(limit = 50): CopyTrade[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM copy_trades ORDER BY created_at DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapCopyTradeRow);
  }

  listUnsettledCopyTrades(limit = 500): CopyTrade[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM copy_trades
       WHERE status = 'filled'
         AND COALESCE(settlement_status, 'pending') = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`,
      limit,
    );
    return rows.map(this.mapCopyTradeRow);
  }

  updateCopyTradeSettlement(
    id: string,
    settlement: Pick<CopyTrade, 'pnl' | 'settlementStatus' | 'resolvedAt'>,
  ): void {
    query(
      `UPDATE copy_trades
       SET pnl = ?, settlement_status = ?, resolved_at = ?
       WHERE id = ?`,
      settlement.pnl ?? null,
      settlement.settlementStatus ?? 'pending',
      settlement.resolvedAt ?? null,
      id,
    );
  }

  getCopyTradeSummary(): { totalPnl: number; settled: number; wins: number; losses: number } {
    const row = queryOne<{ total_pnl: number; settled: number; wins: number; losses: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN settlement_status IN ('won', 'lost') THEN pnl ELSE 0 END), 0) AS total_pnl,
         COALESCE(SUM(CASE WHEN settlement_status IN ('won', 'lost') THEN 1 ELSE 0 END), 0) AS settled,
         COALESCE(SUM(CASE WHEN settlement_status = 'won' THEN 1 ELSE 0 END), 0) AS wins,
         COALESCE(SUM(CASE WHEN settlement_status = 'lost' THEN 1 ELSE 0 END), 0) AS losses
       FROM copy_trades
       WHERE status = 'filled'`,
    );
    return {
      totalPnl: row?.total_pnl ?? 0,
      settled: row?.settled ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
    };
  }

  getDailyCopiedUsd(): number {
    const row = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM copy_trades
       WHERE status = 'filled'
         AND date(created_at) = date('now')`,
    );
    return row?.total ?? 0;
  }

  private mapFollowedRow(row: Record<string, unknown>): FollowedWallet {
    return {
      address: row.address as string,
      label: row.label as string | undefined,
      minTradeUsd: Number(row.min_trade_usd ?? 500),
      alertsEnabled: Boolean(row.alerts_enabled),
      autoCopyEnabled: Boolean(row.auto_copy_enabled),
      createdAt: row.created_at as string,
      winRate: row.win_rate === null || row.win_rate === undefined ? undefined : Number(row.win_rate),
      settledBets: row.settled_bets === null || row.settled_bets === undefined ? undefined : Number(row.settled_bets),
      pnl: row.pnl === null || row.pnl === undefined ? undefined : Number(row.pnl),
    };
  }

  private mapConfigRow(row: Record<string, unknown>): WalletCopyConfig {
    return {
      enabled: Boolean(row.enabled),
      mode: row.mode === 'live' ? 'paper' : (row.mode as WalletCopyConfig['mode']),
      copyRatio: Number(row.copy_ratio),
      maxOrderUsd: Number(row.max_order_usd),
      minLeaderTradeUsd: Number(row.min_leader_trade_usd),
      maxSlippage: Number(row.max_slippage),
      cs2Only: Boolean(row.cs2_only),
      minLeaderWinRate: Number(row.min_leader_win_rate),
      minLeaderSamples: Number(row.min_leader_samples),
      dailyCapUsd: Number(row.daily_cap_usd),
      requireUserConfirm: Boolean(row.require_user_confirm),
      minMarketVolumeShare: Number(row.min_market_volume_share ?? 0.02),
      minMarketVolumeUsd: Number(row.min_market_volume_usd ?? 5000),
      updatedAt: row.updated_at as string | undefined,
    };
  }

  private mapSignalRow(row: Record<string, unknown>): WalletCopySignal {
    return {
      id: row.id as string,
      leaderAddress: row.leader_address as string,
      leaderTxHash: row.leader_tx_hash as string,
      tokenId: row.token_id as string,
      conditionId: row.condition_id as string | undefined,
      marketQuestion: row.market_question as string | undefined,
      outcome: row.outcome as string | undefined,
      side: row.side as 'buy' | 'sell',
      leaderAmount: Number(row.leader_amount),
      leaderPrice: Number(row.leader_price),
      suggestedAmount: row.suggested_amount === null ? undefined : Number(row.suggested_amount),
      leaderWinRate: row.leader_win_rate === null ? undefined : Number(row.leader_win_rate),
      leaderSettledBets: row.leader_settled_bets === null ? undefined : Number(row.leader_settled_bets),
      leaderVolumeShare: row.leader_volume_share === null ? undefined : Number(row.leader_volume_share),
      status: row.status as WalletCopySignal['status'],
      skipReason: row.skip_reason as string | undefined,
      createdAt: row.created_at as string,
    };
  }

  private mapCopyTradeRow(row: Record<string, unknown>): CopyTrade {
    return {
      id: row.id as string,
      signalId: row.signal_id as string,
      mode: row.mode as CopyTrade['mode'],
      tokenId: row.token_id as string,
      side: row.side as 'buy' | 'sell',
      amount: Number(row.amount),
      price: Number(row.price),
      status: row.status as CopyTrade['status'],
      errorMessage: row.error_message as string | undefined,
      clobOrderId: row.clob_order_id as string | undefined,
      executedAt: row.executed_at as string | undefined,
      createdAt: row.created_at as string,
      pnl: row.pnl === null || row.pnl === undefined ? undefined : Number(row.pnl),
      settlementStatus: row.settlement_status as CopyTrade['settlementStatus'],
      marketQuestion: row.market_question as string | undefined,
      outcome: row.outcome as string | undefined,
      resolvedAt: row.resolved_at as string | undefined,
    };
  }
}

function defaultConfig(): WalletCopyConfig {
  return {
    enabled: false,
    mode: 'paper',
    copyRatio: 0.1,
    maxOrderUsd: 200,
    minLeaderTradeUsd: 500,
    maxSlippage: 0.05,
    cs2Only: true,
    minLeaderWinRate: 0.55,
    minLeaderSamples: 10,
    dailyCapUsd: 2000,
    requireUserConfirm: true,
    minMarketVolumeShare: 0.02,
    minMarketVolumeUsd: 5000,
  };
}
