import { query, queryOne, getDb } from '../connection';
import type { Whale, WhaleTrade, CorrelationData } from '@polyrader/core';

export class WhaleRepository {
  findAll(limit = 50): Whale[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM whales ORDER BY total_volume DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapRow);
  }

  findByAddress(address: string): Whale | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM whales WHERE address = ?`,
      address,
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Find correlation data for a given address: how many other whale
   * addresses traded on the same markets, the market overlap ratio,
   * and the average suspicious score of those correlated addresses.
   */
  findCorrelationData(address: string): CorrelationData {
    // Get this address's market IDs
    const ownMarkets = query<{ market_id: string }>(
      `SELECT DISTINCT market_id FROM whale_trades WHERE address = ?`,
      address,
    );
    if (ownMarkets.length === 0) {
      return { correlatedAddressCount: 0, marketOverlapRatio: 0, avgCorrelatedSuspicion: 0 };
    }

    const marketIds = ownMarkets.map((r) => r.market_id);
    const placeholders = marketIds.map(() => '?').join(',');

    // Find other addresses that traded on the same markets
    const correlated = query<{ address: string; shared_markets: number; suspicious_score: string }>(
      `SELECT wt.address,
              COUNT(DISTINCT wt.market_id) as shared_markets,
              w.suspicious_score
       FROM whale_trades wt
       LEFT JOIN whales w ON w.address = wt.address
       WHERE wt.market_id IN (${placeholders})
         AND wt.address != ?
       GROUP BY wt.address`,
      ...marketIds,
      address,
    );

    if (correlated.length === 0) {
      return { correlatedAddressCount: 0, marketOverlapRatio: 0, avgCorrelatedSuspicion: 0 };
    }

    // Overlap ratio: average shared markets / total own markets
    const totalOwnMarkets = marketIds.length;
    const avgSharedMarkets = correlated.reduce((s, r) => s + r.shared_markets, 0) / correlated.length;
    const marketOverlapRatio = Math.min(1, avgSharedMarkets / Math.max(1, totalOwnMarkets));

    // Average suspicious score of correlated addresses
    let suspicionSum = 0;
    let suspicionCount = 0;
    for (const row of correlated) {
      if (row.suspicious_score) {
        try {
          const parsed = JSON.parse(row.suspicious_score) as { total?: number };
          if (typeof parsed.total === 'number') {
            suspicionSum += parsed.total;
            suspicionCount++;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    const avgCorrelatedSuspicion = suspicionCount > 0 ? suspicionSum / suspicionCount : 0;

    return {
      correlatedAddressCount: correlated.length,
      marketOverlapRatio,
      avgCorrelatedSuspicion,
    };
  }

  upsert(whale: Whale): void {
    query(
      `INSERT INTO whales (address, label, total_volume, total_positions, active_positions, win_rate, pnl, suspicious_score, recent_trades, last_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(address) DO UPDATE SET
         total_volume = excluded.total_volume,
         total_positions = excluded.total_positions,
         active_positions = excluded.active_positions,
         win_rate = excluded.win_rate,
         pnl = excluded.pnl,
         suspicious_score = excluded.suspicious_score,
         recent_trades = excluded.recent_trades,
         last_active = excluded.last_active,
         updated_at = datetime('now')`,
      whale.address,
      whale.label ?? null,
      whale.totalVolume,
      whale.totalPositions,
      whale.activePositions,
      whale.winRate,
      whale.pnl,
      JSON.stringify(whale.suspiciousScore),
      JSON.stringify(whale.recentTrades),
      whale.lastActive,
    );
  }

  getTrades(address: string, limit = 50): WhaleTrade[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM whale_trades WHERE address = ? ORDER BY timestamp ASC LIMIT ?`,
      address,
      limit,
    );
    return rows.map((row) => ({
      txHash: row.tx_hash as string,
      marketId: row.market_id as string,
      outcome: row.outcome as string,
      amount: row.amount as number,
      price: row.price as number,
      timestamp: row.timestamp as string,
      type: row.type as 'buy' | 'sell',
    }));
  }

  insertTrade(trade: WhaleTrade & { address: string }): boolean {
    const result = getDb().prepare(
      `INSERT OR IGNORE INTO whale_trades (address, tx_hash, market_id, outcome, amount, price, timestamp, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      trade.address,
      trade.txHash,
      trade.marketId,
      trade.outcome,
      trade.amount,
      trade.price,
      trade.timestamp,
      trade.type,
    );
    // changes === 0 means the INSERT OR IGNORE was a no-op (duplicate tx_hash)
    return result.changes > 0;
  }

  private mapRow(row: Record<string, unknown>): Whale {
    return {
      address: row.address as string,
      label: row.label as string | undefined,
      totalVolume: row.total_volume as number,
      totalPositions: row.total_positions as number,
      activePositions: row.active_positions as number,
      winRate: row.win_rate as number,
      pnl: row.pnl as number,
      suspiciousScore: this.parseJson(row.suspicious_score) as Whale['suspiciousScore'],
      recentTrades: (this.parseJson(row.recent_trades) as Whale['recentTrades']) ?? [],
      lastActive: row.last_active as string,
    };
  }

  private parseJson(val: unknown): unknown {
    if (typeof val === 'string') {
      try { return JSON.parse(val) as unknown; } catch { return null; }
    }
    if (typeof val === 'object' && val !== null) {
      return val;
    }
    return null;
  }
}
