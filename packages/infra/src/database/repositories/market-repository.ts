import { query, queryOne } from '../connection';
import type { Market, MatchInfo } from '@polyrader/core';

export class MarketRepository {
  findAll(limit = 50, offset = 0): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE question LIKE '%Counter-Strike%' OR question LIKE '%CS2%' OR question LIKE '%CSGO%' ORDER BY volume_24h DESC LIMIT ? OFFSET ?`,
      limit,
      offset,
    );
    return rows.map(this.mapRow);
  }

  findByConditionId(conditionId: string): Market | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM markets WHERE condition_id = ?`,
      conditionId,
    );
    return row ? this.mapRow(row) : null;
  }

  findBySlug(slug: string): Market | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM markets WHERE slug = ?`,
      slug,
    );
    return row ? this.mapRow(row) : null;
  }

  findByTag(tag: string, limit = 50): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE tags LIKE ? ORDER BY volume_24h DESC LIMIT ?`,
      `%${tag}%`,
      limit,
    );
    return rows.map(this.mapRow);
  }

  upsert(market: Market): void {
    query(
      `INSERT INTO markets (condition_id, slug, question, description, outcomes, outcome_prices, clob_token_ids, volume, volume_24h, liquidity, end_date, start_date, status, tags, match_info, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(condition_id) DO UPDATE SET
         question = excluded.question,
         slug = excluded.slug,
         outcomes = excluded.outcomes,
         outcome_prices = excluded.outcome_prices,
         end_date = excluded.end_date,
         start_date = excluded.start_date,
         tags = excluded.tags,
         clob_token_ids = excluded.clob_token_ids,
         volume = excluded.volume,
         volume_24h = excluded.volume_24h,
         liquidity = excluded.liquidity,
         status = excluded.status,
         match_info = excluded.match_info,
         updated_at = datetime('now')`,
      market.conditionId,
      market.slug,
      market.question,
      market.description,
      JSON.stringify(market.outcomes),
      JSON.stringify(market.outcomePrices),
      JSON.stringify(market.clobTokenIds ?? []),
      market.volume,
      market.volume24h,
      market.liquidity,
      market.endDate,
      market.startDate,
      market.status,
      JSON.stringify(market.tags),
      market.match ? JSON.stringify(market.match) : null,
    );
  }

  getActiveMarkets(): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE status = 'active' ORDER BY volume_24h DESC`,
    );
    return rows.map(this.mapRow);
  }

  insertPriceHistory(conditionId: string, price: number): void {
    query(
      `INSERT INTO price_history (condition_id, price) VALUES (?, ?)`,
      conditionId,
      price,
    );
  }

  getPriceHistory(conditionId: string, limit = 100): Array<{ timestamp: string; price: number }> {
    return query<{ timestamp: string; price: number }>(
      `SELECT timestamp, price FROM price_history WHERE condition_id = ? ORDER BY timestamp DESC LIMIT ?`,
      conditionId,
      limit,
    );
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

  private mapRow(row: Record<string, unknown>): Market {
    return {
      conditionId: row.condition_id as string,
      slug: row.slug as string,
      question: row.question as string,
      description: row.description as string,
      outcomes: (this.parseJson(row.outcomes) as string[]) ?? [],
      outcomePrices: (this.parseJson(row.outcome_prices) as string[]) ?? [],
      clobTokenIds: (this.parseJson(row.clob_token_ids) as string[]) ?? undefined,
      volume: row.volume as number,
      volume24h: row.volume_24h as number,
      liquidity: row.liquidity as number,
      endDate: row.end_date as string,
      startDate: row.start_date as string,
      status: row.status as Market['status'],
      tags: (this.parseJson(row.tags) as string[]) ?? [],
      match: row.match_info ? this.parseJson(row.match_info) as MatchInfo | undefined : undefined,
    };
  }
}
