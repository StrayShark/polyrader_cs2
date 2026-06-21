import type { Request, Response } from 'express';
import { MarketService } from '../services/market-service';
import { logger } from '../utils/logger';

export class MarketController {
  private service = new MarketService();

  async getMarkets(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const markets = await this.service.getMarkets(limit, offset);
      res.json({ data: markets, count: markets.length });
    } catch (err) {
      logger.error('Failed to fetch markets', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch markets', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMarket(req: Request, res: Response): Promise<void> {
    try {
      const market = await this.service.getMarket(req.params.conditionId);
      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }
      res.json({ data: market });
    } catch (err) {
      logger.error('Failed to fetch market', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch market', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getPrices(req: Request, res: Response): Promise<void> {
    try {
      const prices = await this.service.getPriceHistory(req.params.conditionId);
      res.json({ data: prices });
    } catch (err) {
      logger.error('Failed to fetch prices', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch prices', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getOrderBook(req: Request, res: Response): Promise<void> {
    try {
      const tokenId = req.query.tokenId as string | undefined;
      const orderBook = await this.service.getOrderBook(req.params.conditionId, tokenId);
      if (!orderBook) {
        res.status(404).json({ error: 'Order book not available' });
        return;
      }
      res.json({ data: orderBook });
    } catch (err) {
      logger.error('Failed to fetch order book', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch order book', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
