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

  async getHolders(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '50'), 10);
      const holders = await this.service.getHolders(
        req.params.conditionId,
        Number.isFinite(limit) ? limit : 50,
      );
      res.json({ data: holders });
    } catch (err) {
      logger.error('Failed to fetch market holders', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch market holders', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMarketPositions(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '100'), 10);
      const positions = await this.service.getMarketPositions(
        req.params.conditionId,
        Number.isFinite(limit) ? limit : 100,
      );
      res.json({ data: positions });
    } catch (err) {
      logger.error('Failed to fetch market positions', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch market positions', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getAnomalies(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '30'), 10);
      const anomalies = await this.service.detectAnomalies(Number.isFinite(limit) ? limit : 30);
      res.json({ data: anomalies, count: anomalies.length });
    } catch (err) {
      logger.error('Failed to detect market anomalies', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to detect anomalies', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
