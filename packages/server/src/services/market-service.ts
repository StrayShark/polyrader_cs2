import type { Market } from '@polyrader/core';
import { PolymarketGammaClient, PolymarketClobClient } from '@polyrader/infra';
import type { OrderBookSummary } from '@polyrader/infra';
import { MarketRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { RequestDedup } from './request-dedup';
import { AlertService } from './alert-service';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

const CACHE_TTL = 60; // 1 minute
const ORDERBOOK_CACHE_TTL = 10; // 10 seconds for orderbook

export class MarketService {
  private gammaClient = new PolymarketGammaClient();
  private clobClient = new PolymarketClobClient();
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
}
