import type { Market } from '@polyrader/core';

const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 15000): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      lastErr = err as Error;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, (i + 1) * 1000));
      }
    }
  }
  throw lastErr ?? new Error('Gamma API request failed');
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

    const response = await fetchWithRetry(url.toString());
    return response.json() as Promise<T>;
  }

  /**
   * Get active CS2 markets.
   * Polymarket Gamma API does not support tag=cs2 filtering (CS2 markets
   * have empty tags arrays). Instead, we fetch active markets sorted by
   * volume and filter by "Counter-Strike" in the question text.
   */
  async getMarkets(limit = 50, offset = 0): Promise<Market[]> {
    // Fetch more than needed to compensate for client-side filtering
    const fetchLimit = Math.min(limit * 5, 500);
    const data = await this.fetch<unknown[]>('/markets', {
      limit: String(fetchLimit),
      offset: String(offset),
      active: 'true',
      closed: 'false',
      order: 'volume24hr',
      ascending: 'false',
    });

    const cs2Markets = data
      .filter((item: unknown) => {
        const m = item as Record<string, unknown>;
        const q = String(m.question ?? '').toLowerCase();
        return q.startsWith('counter-strike') || q.includes('cs2') || q.includes('csgo');
      })
      .map((item: unknown) => this.mapMarket(item as Record<string, unknown>));

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
      status: data.closed ? 'closed' : 'active',
      tags: Array.isArray(data.tags) ? data.tags as string[] : [],
      resolvedOutcome: data.resolvedOutcome ? String(data.resolvedOutcome) : undefined,
      resolvedPrice: data.resolvedPrice ? parseFloat(String(data.resolvedPrice)) : undefined,
    };
  }
}
