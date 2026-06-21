const CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL ?? 'https://clob.polymarket.com';

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 15000): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      lastErr = err as Error;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, (i + 1) * 1000));
      }
    }
  }
  throw lastErr ?? new Error('CLOB API request failed');
}

export interface OrderBookSummary {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  hash: string;
  timestamp: string;
}

export interface PriceHistory {
  history: Array<{
    t: number;
    p: number;
  }>;
}

export class PolymarketClobClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? CLOB_API_URL;
  }

  async fetch<T>(path: string): Promise<T> {
    const response = await fetchWithRetry(`${this.baseUrl}${path}`);
    return response.json() as Promise<T>;
  }

  /**
   * Get order book for a token.
   */
  async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
    return this.fetch<OrderBookSummary>(`/book?token_id=${tokenId}`);
  }

  /**
   * Get price history for a token.
   */
  async getPriceHistory(
    tokenId: string,
    interval: '1h' | '6h' | '1d' | '1w' | 'max' = '1d',
  ): Promise<PriceHistory> {
    return this.fetch<PriceHistory>(
      `/prices-history?market=${tokenId}&interval=${interval}&fidelity=60`,
    );
  }

  /**
   * Get midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const data = await this.fetch<{ mid: string }>(`/midpoint?token_id=${tokenId}`);
    return parseFloat(data.mid);
  }

  /**
   * Get spread for a token.
   */
  async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number }> {
    const book = await this.getOrderBook(tokenId);
    const bestBid = book.bids[0] ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks[0] ? parseFloat(book.asks[0].price) : 1;
    return {
      bid: bestBid,
      ask: bestAsk,
      spread: bestAsk - bestBid,
    };
  }
}
