import type { Market, PolymarketHolder, PolymarketMarketPosition } from '@polyrader/core';
import { PolymarketGammaClient, PolymarketClobClient, PolymarketDataClient } from '@polyrader/infra';
import type { OrderBookSummary } from '@polyrader/infra';
import { MarketRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { RequestDedup } from './request-dedup';
import { AlertService } from './alert-service';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

const CACHE_TTL = 60; // 1 minute
const ORDERBOOK_CACHE_TTL = 10; // 10 seconds for orderbook

export interface MarketAnomaly {
  conditionId: string;
  question: string;
  type: 'price_spike' | 'volume_surge';
  severity: 'low' | 'medium' | 'high';
  detail: string;
  value: number;
}

export class MarketService {
  private gammaClient = new PolymarketGammaClient();
  private clobClient = new PolymarketClobClient();
  private dataClient = new PolymarketDataClient();
  private marketRepo = new MarketRepository();
  private dedup = new RequestDedup<unknown>();
  private alertService = new AlertService();

  /**
   * Build a marketSlug → {price, volume} map from fetched markets,
   * run alert threshold checks, and broadcast any triggered alerts via WebSocket.
   */
  private checkPriceAlerts(markets: Market[]): void {
    try {
      const marketPrices = new Map<string, { price: number; volume: number }>();
      for (const market of markets) {
        const price = parseFloat(market.outcomePrices?.[0] ?? '0');
        if (!Number.isFinite(price)) continue;
        marketPrices.set(market.slug, {
          price,
          volume: market.volume24h ?? market.volume ?? 0,
        });
      }
      if (marketPrices.size === 0) return;
      const triggered = this.alertService.checkAlerts(marketPrices);
      if (triggered.length > 0) {
        broadcast('alerts', { type: 'alert:triggered', alerts: triggered });
        logger.info('Alerts triggered', { count: triggered.length });
      }
    } catch (err) {
      logger.warn('Alert check failed', { error: (err as Error).message });
    }
  }

  async getMarkets(limit = 50, offset = 0): Promise<Market[]> {
    const cacheKey = `markets:${limit}:${offset}`;
    const cached = await cacheGet<Market[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const markets = await this.gammaClient.getMarkets(limit, offset);
        await cacheSet(cacheKey, markets, CACHE_TTL);
        for (const market of markets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', { conditionId: market.conditionId, error: (err as Error).message });
          }
        }
        this.checkPriceAlerts(markets);
        return markets;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', { cacheKey, error: (err as Error).message });
        return this.marketRepo.findAll(limit, offset);
      }
    }) as Promise<Market[]>;
  }

  async getMarket(conditionId: string): Promise<Market | null> {
    const cacheKey = `market:${conditionId}`;
    const cached = await cacheGet<Market>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const market = await this.gammaClient.getMarket(conditionId);
        if (market) {
          await cacheSet(cacheKey, market, CACHE_TTL);
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', { conditionId, error: (err as Error).message });
          }
        }
        return market;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', { conditionId, error: (err as Error).message });
        return this.marketRepo.findByConditionId(conditionId);
      }
    }) as Promise<Market | null>;
  }

  async getPriceHistory(conditionId: string): Promise<Array<{ timestamp: string; price: number }>> {
    return this.dedup.run(`pricehistory:${conditionId}`, async () => {
      try {
        return await this.gammaClient.getPriceHistory(conditionId);
      } catch (err) {
        logger.warn('Failed to fetch price history', { conditionId, error: (err as Error).message });
        return [];
      }
    }) as Promise<Array<{ timestamp: string; price: number }>>;
  }

  async refreshMarkets(): Promise<Market[]> {
    return this.dedup.run('refresh:markets', async () => {
      try {
        const markets = await this.gammaClient.getMarkets(100, 0);
        for (const market of markets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', { conditionId: market.conditionId, error: (err as Error).message });
          }
        }
        await cacheSet('markets:50:0', markets.slice(0, 50), CACHE_TTL);
        this.checkPriceAlerts(markets);
        return markets;
      } catch (err) {
        logger.error('Failed to refresh markets from Polymarket', { error: (err as Error).message });
        return [];
      }
    }) as Promise<Market[]>;
  }

  async getOrderBook(conditionId: string, tokenId?: string): Promise<OrderBookSummary | null> {
    const cacheKey = `orderbook:${conditionId}:${tokenId ?? 'default'}`;
    const cached = await cacheGet<OrderBookSummary>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        let resolvedTokenId = tokenId;
        if (!resolvedTokenId) {
          const market = await this.getMarket(conditionId);
          if (!market?.clobTokenIds || market.clobTokenIds.length === 0) return null;
          resolvedTokenId = market.clobTokenIds[0];
        }

        const orderBook = await this.clobClient.getOrderBook(resolvedTokenId);
        await cacheSet(cacheKey, orderBook, ORDERBOOK_CACHE_TTL);
        return orderBook;
      } catch (err) {
        logger.warn('Failed to fetch order book', { conditionId, tokenId, error: (err as Error).message });
        return null;
      }
    }) as Promise<OrderBookSummary | null>;
  }

  async getHolders(conditionId: string, limit = 50): Promise<PolymarketHolder[]> {
    const cacheKey = `holders:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketHolder[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const holders = await this.dataClient.getHolders(conditionId, limit);
        await cacheSet(cacheKey, holders, 60);
        return holders;
      } catch (err) {
        logger.warn('Failed to fetch market holders', { conditionId, error: (err as Error).message });
        return [];
      }
    }) as Promise<PolymarketHolder[]>;
  }

  async getMarketPositions(conditionId: string, limit = 100): Promise<PolymarketMarketPosition[]> {
    const cacheKey = `market-positions:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketMarketPosition[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const positions = await this.dataClient.getMarketPositions(conditionId, limit);
        await cacheSet(cacheKey, positions, 60);
        return positions;
      } catch (err) {
        logger.warn('Failed to fetch market positions', { conditionId, error: (err as Error).message });
        return [];
      }
    }) as Promise<PolymarketMarketPosition[]>;
  }

  /** Poll CLOB midpoints for top markets and broadcast via WebSocket. */
  async pollAndBroadcastPrices(limit = 20): Promise<number> {
    const markets = await this.getMarkets(limit, 0);
    let updated = 0;

    for (const market of markets) {
      const tokenId = market.clobTokenIds?.[0];
      if (!tokenId) continue;

      try {
        const price = await this.clobClient.getMidpoint(tokenId);
        if (!Number.isFinite(price) || price <= 0 || price >= 1) continue;

        this.marketRepo.insertPriceHistory(market.conditionId, price);
        const payload = {
          conditionId: market.conditionId,
          price,
          timestamp: Date.now(),
        };
        broadcast(`prices:${market.conditionId}`, payload);
        broadcast('prices', payload);
        updated++;
      } catch (err) {
        logger.warn('Price poll failed', { conditionId: market.conditionId, error: (err as Error).message });
      }
    }

    return updated;
  }

  /** Detect unusual price moves and volume spikes across active markets. */
  async detectAnomalies(limit = 30): Promise<MarketAnomaly[]> {
    const markets = await this.getMarkets(limit, 0);
    const anomalies: MarketAnomaly[] = [];

    for (const market of markets) {
      const currentPrice = parseFloat(market.outcomePrices[0] ?? '0');
      if (!Number.isFinite(currentPrice)) continue;

      const history = this.marketRepo.getPriceHistory(market.conditionId, 20);
      if (history.length >= 2) {
        const prevPrice = history[1].price;
        const change = Math.abs(currentPrice - prevPrice);
        if (change >= 0.05) {
          anomalies.push({
            conditionId: market.conditionId,
            question: market.question,
            type: 'price_spike',
            severity: change >= 0.15 ? 'high' : change >= 0.08 ? 'medium' : 'low',
            detail: `Price moved ${(change * 100).toFixed(1)}% (${(prevPrice * 100).toFixed(1)}% → ${(currentPrice * 100).toFixed(1)}%)`,
            value: change,
          });
        }
      }

      const vol24h = market.volume24h ?? 0;
      const totalVol = market.volume ?? 0;
      if (vol24h > 10_000 && totalVol > vol24h) {
        const priorVol = totalVol - vol24h;
        const surgeRatio = priorVol > 0 ? vol24h / priorVol : vol24h;
        if (surgeRatio >= 0.5) {
          anomalies.push({
            conditionId: market.conditionId,
            question: market.question,
            type: 'volume_surge',
            severity: surgeRatio >= 1 ? 'high' : surgeRatio >= 0.75 ? 'medium' : 'low',
            detail: `24h volume $${(vol24h / 1000).toFixed(1)}K (${(surgeRatio * 100).toFixed(0)}% of prior)`,
            value: surgeRatio,
          });
        }
      }
    }

    const severityRank = { high: 3, medium: 2, low: 1 };
    return anomalies.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  }
}
