import { query, queryOne, getDb } from '../connection';
import type { Whale, WhaleTrade, CorrelationData, AddressGraph } from '@polyrader/core';

export class WhaleRepository {
  findAll(limit = 50): Whale[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM whales ORDER BY total_volume DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapRow);
  }

  findByWinRate(limit = 50, minSettledBets = 5, minWinRate = 0): Whale[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM whales
       WHERE settled_bets >= ? AND win_rate >= ?
       ORDER BY win_rate DESC, settled_bets DESC, pnl DESC
       LIMIT ?`,
      minSettledBets,
      minWinRate,
      limit,
    );
    return rows.map(this.mapRow);
  }

  findDistinctAddresses(): string[] {
    const rows = query<{ address: string }>(
      `SELECT DISTINCT address FROM whale_trades ORDER BY address`,
    );
    return rows.map((row) => row.address);
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
    return rows.map((row) => this.mapTradeRow(row));
  }

  getAllTrades(address: string): WhaleTrade[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM whale_trades WHERE address = ? ORDER BY timestamp ASC`,
      address,
    );
    return rows.map((row) => this.mapTradeRow(row));
  }

  updatePerformance(
    address: string,
    metrics: {
      winRate: number;
      totalPnl: number;
      settledBets: number;
      wins: number;
      losses: number;
      totalWagered: number;
      roi: number;
    },
  ): void {
    query(
      `UPDATE whales SET
         win_rate = ?,
         pnl = ?,
         settled_bets = ?,
         wins = ?,
         losses = ?,
         total_wagered = ?,
         roi = ?,
         performance_updated_at = datetime('now'),
         updated_at = datetime('now')
       WHERE address = ?`,
      metrics.winRate,
      metrics.totalPnl,
      metrics.settledBets,
      metrics.wins,
      metrics.losses,
      metrics.totalWagered,
      metrics.roi,
      address,
    );
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

  /**
   * Build an address association graph: find address pairs where one address
   * bought an outcome while another sold the same outcome on the same market.
   * Returns nodes (addresses) sorted by volume desc (max 50) and links (max 100).
   */
  getAddressGraph(): AddressGraph {
    // Find interacting address pairs (buyer vs seller on the same market + outcome)
    const linkRows = query<{ buyer: string; seller: string; value: number }>(
      `SELECT buyer.address AS buyer,
              seller.address AS seller,
              SUM(buyer.amount) AS value
       FROM whale_trades buyer
       JOIN whale_trades seller
         ON buyer.market_id = seller.market_id
        AND buyer.outcome = seller.outcome
        AND buyer.address != seller.address
        AND buyer.type = 'buy'
        AND seller.type = 'sell'
       GROUP BY buyer.address, seller.address`,
    );

    if (linkRows.length === 0) {
      return { nodes: [], links: [] };
    }

    // Collect every address that participates in at least one interaction
    const interactingIds = new Set<string>();
    for (const row of linkRows) {
      interactingIds.add(row.buyer);
      interactingIds.add(row.seller);
    }

    // Aggregate per-address volume and trade count for interacting addresses
    const placeholders = Array.from(interactingIds).map(() => '?').join(',');
    const nodeRows = query<{ address: string; label: string | null; volume: number; trade_count: number }>(
      `SELECT wt.address,
              w.label,
              SUM(wt.amount) AS volume,
              COUNT(*) AS trade_count
       FROM whale_trades wt
       LEFT JOIN whales w ON w.address = wt.address
       WHERE wt.address IN (${placeholders})
       GROUP BY wt.address`,
      ...interactingIds,
    );

    const nodeMap = new Map<string, { id: string; label: string; volume: number; tradeCount: number }>();
    for (const row of nodeRows) {
      const volume = Number.isFinite(row.volume) ? row.volume : 0;
      const tradeCount = Number.isFinite(row.trade_count) ? row.trade_count : 0;
      nodeMap.set(row.address, {
        id: row.address,
        label: row.label ?? `${row.address.slice(0, 6)}...${row.address.slice(-4)}`,
        volume,
        tradeCount,
      });
    }

    // Nodes sorted by volume desc, limited to 50
    const nodes = Array.from(nodeMap.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 50);
    const topNodeIds = new Set(nodes.map((n) => n.id));

    // Links filtered to top nodes, sorted by value desc, limited to 100
    const links = linkRows
      .map((row) => ({
        source: row.buyer,
        target: row.seller,
        value: Number.isFinite(row.value) ? row.value : 0,
      }))
      .filter((l) => topNodeIds.has(l.source) && topNodeIds.has(l.target))
      .sort((a, b) => b.value - a.value)
      .slice(0, 100);

    return { nodes, links };
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
      settledBets: row.settled_bets as number | undefined,
      wins: row.wins as number | undefined,
      losses: row.losses as number | undefined,
      roi: row.roi as number | undefined,
      totalWagered: row.total_wagered as number | undefined,
      performanceUpdatedAt: row.performance_updated_at as string | undefined,
    };
  }

  private mapTradeRow(row: Record<string, unknown>): WhaleTrade {
    return {
      txHash: row.tx_hash as string,
      marketId: row.market_id as string,
      outcome: row.outcome as string,
      amount: row.amount as number,
      price: row.price as number,
      timestamp: row.timestamp as string,
      type: row.type as 'buy' | 'sell',
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
