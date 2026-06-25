import type { Market } from '@polyrader/core';
import { fetchJsonWithBrowser } from '../../crawlers/browser-fetch.js';

const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';

/**
 * Fetch JSON from Gamma API via headless Chromium.
 *
 * Direct Node.js fetch is blocked by SNI-based DPI filtering in this
 * environment (TLS handshake gets Connection Reset). Chromium's BoringSSL
 * stack bypasses this, so all Gamma API calls route through Playwright.
 */
async function gammaFetch<T>(url: string): Promise<T> {
  return fetchJsonWithBrowser<T>(url);
}

export class PolymarketGammaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? GAMMA_API_URL;
  }

  async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return gammaFetch<T>(url.toString());
  }

  /**
   * Get active CS2 markets.
   * Polymarket Gamma API does not support tag=cs2 filtering (CS2 markets
   * have empty tags arrays). Instead, we fetch active markets sorted by
   * volume and filter by "Counter-Strike" in the question text.
   *
   * If insufficient active CS2 markets are found, also fetch closed markets
   * (useful during CS2 off-season) to keep the dashboard populated for analysis.
   */
  async getMarkets(limit = 50, offset = 0): Promise<Market[]> {
    const isCs2 = (item: unknown): boolean => {
      const m = item as Record<string, unknown>;
      const q = String(m.question ?? '').toLowerCase();
      return q.startsWith('counter-strike') || q.includes('cs2') || q.includes('csgo');
    };

    // Paginate through active markets to find all CS2 markets.
    // Gamma API caps at 500 per request; CS2 markets are often buried
    // among thousands of non-CS2 markets sorted by volume.
    const pageSize = 500;
    const maxPages = 5; // up to 2500 markets scanned
    let cs2Markets: Market[] = [];

    // 1) Paginate active markets
    for (let page = 0; page < maxPages; page++) {
      const currentOffset = offset + page * pageSize;
      let batch: unknown[];
      try {
        batch = await this.fetch<unknown[]>('/markets', {
          limit: String(pageSize),
          offset: String(currentOffset),
          active: 'true',
          closed: 'false',
          order: 'volume24hr',
          ascending: 'false',
        });
      } catch { break; }
      if (!batch || batch.length === 0) break;

      const cs2Batch = batch.filter(isCs2).map((item) => this.mapMarket(item as Record<string, unknown>));
      cs2Markets = cs2Markets.concat(cs2Batch);

      // Stop early if we have enough and this page had no CS2 markets
      if (cs2Markets.length >= limit && cs2Batch.length === 0 && page > 0) break;
      if (batch.length < pageSize) break; // last page
    }

    // 2) If not enough active CS2 markets, supplement with closed ones (sorted by volume)
    if (cs2Markets.length < limit) {
      for (let page = 0; page < maxPages; page++) {
        let closedBatch: unknown[];
        try {
          closedBatch = await this.fetch<unknown[]>('/markets', {
            limit: String(pageSize),
            offset: String(page * pageSize),
            closed: 'true',
            order: 'volume',
            ascending: 'false',
          });
        } catch { break; }
        if (!closedBatch || closedBatch.length === 0) break;

        const cs2Closed = closedBatch.filter(isCs2).map((item) => this.mapMarket(item as Record<string, unknown>));
        cs2Markets = cs2Markets.concat(cs2Closed);

        if (cs2Markets.length >= limit) break;
        if (closedBatch.length < pageSize) break;
      }
    }

    return cs2Markets.slice(0, limit);
  }

  /**
   * Get a single market by condition ID.
   */
  async getMarket(conditionId: string): Promise<Market | null> {
    try {
      const data = await this.fetch<Record<string, unknown>>(`/markets/${conditionId}`);
      return this.mapMarket(data);
    } catch {
      return null;
    }
  }

  /**
   * Get market price history.
   */
  async getPriceHistory(
    conditionId: string,
    interval: '1h' | '6h' | '1d' = '1h',
  ): Promise<Array<{ timestamp: string; price: number }>> {
    const data = await this.fetch<unknown[]>(
      `/markets/${conditionId}/prices-history`,
      { interval },
    );
    return data.map((p: unknown) => {
      const item = p as Record<string, unknown>;
      return {
        timestamp: String(item.t ?? ''),
        price: parseFloat(String(item.p ?? '0')),
      };
    });
  }

  /**
   * Search CS2 markets by keyword.
   */
  async searchMarkets(query: string, limit = 20): Promise<Market[]> {
    const fetchLimit = Math.min(limit * 5, 200);
    const data = await this.fetch<unknown[]>('/markets', {
      limit: String(fetchLimit),
      active: 'true',
      closed: 'false',
      order: 'volume24hr',
      ascending: 'false',
    });

    const q = query.toLowerCase();
    return data
      .filter((item: unknown) => {
        const m = item as Record<string, unknown>;
        const question = String(m.question ?? '').toLowerCase();
        const isCs2 = question.startsWith('counter-strike') || question.includes('cs2') || question.includes('csgo');
        return isCs2 && question.includes(q);
      })
      .map((item: unknown) => this.mapMarket(item as Record<string, unknown>))
      .slice(0, limit);
  }

  private mapMarket(data: Record<string, unknown>): Market {
    let outcomePrices: string[] = [];
    if (data.outcomePrices) {
      try { outcomePrices = JSON.parse(String(data.outcomePrices)); } catch { /* malformed */ }
    } else if (Array.isArray(data.outcomes)) {
      outcomePrices = (data.outcomes as string[]).map(() => '0.5');
    } else {
      outcomePrices = ['0.5', '0.5'];
    }

    let outcomes: string[] = [];
    if (Array.isArray(data.outcomes)) {
      outcomes = data.outcomes as string[];
    } else {
      try { outcomes = JSON.parse(String(data.outcomes ?? '[]')); } catch { /* malformed */ }
    }

    const resolvedOutcome = data.resolvedOutcome === null || data.resolvedOutcome === undefined
      ? undefined
      : String(data.resolvedOutcome);
    const resolvedPrice = data.resolvedPrice === null || data.resolvedPrice === undefined
      ? undefined
      : parseFloat(String(data.resolvedPrice));

    return {
      conditionId: String(data.id ?? data.conditionId ?? ''),
      slug: String(data.slug ?? ''),
      question: String(data.question ?? ''),
      description: String(data.description ?? ''),
      outcomes,
      outcomePrices,
      clobTokenIds: Array.isArray(data.clobTokenIds) ? data.clobTokenIds as string[] : undefined,
      volume: parseFloat(String(data.volume ?? '0')),
      volume24h: parseFloat(String(data.volume24hr ?? data.volume24h ?? '0')),
      liquidity: parseFloat(String(data.liquidity ?? '0')),
      endDate: String(data.endDate ?? data.end_date_iso ?? ''),
      startDate: String(data.startDate ?? data.start_date_iso ?? ''),
      status: resolvedOutcome !== undefined || resolvedPrice !== undefined ? 'resolved' : data.closed ? 'closed' : 'active',
      tags: Array.isArray(data.tags) ? data.tags as string[] : [],
      resolvedOutcome,
      resolvedPrice: Number.isFinite(resolvedPrice) ? resolvedPrice : undefined,
    };
  }
}
