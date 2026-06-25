import type { Request, Response } from 'express';
import { WhaleService } from '../services/whale-service';
import { WalletPerformanceService } from '../services/wallet-performance-service';
import { logger } from '../utils/logger';
import type { whaleLeaderboardQuerySchema, whaleQuerySchema } from '../validation/schemas';
import type { z } from 'zod';

type WhaleQuery = z.infer<typeof whaleQuerySchema>;
type WhaleLeaderboardQuery = z.infer<typeof whaleLeaderboardQuerySchema>;

export class WhaleController {
  private service = new WhaleService();
  private performanceService = new WalletPerformanceService();

  async getWhales(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WhaleQuery;
      const whales = await this.service.getWhales({
        limit: query.limit,
        sort: query.sort,
        minSamples: query.minSamples,
        minWinRate: query.minWinRate,
      });
      res.json({ data: whales });
    } catch (err) {
      logger.error('Failed to fetch whales', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whales', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WhaleLeaderboardQuery;
      const whales = this.performanceService.getLeaderboard({
        limit: query.limit,
        minSamples: query.minSamples,
        minWinRate: query.minWinRate,
      });
      res.json({ data: whales });
    } catch (err) {
      logger.error('Failed to fetch whale leaderboard', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whale leaderboard', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getWhale(req: Request, res: Response): Promise<void> {
    try {
      const whale = await this.service.getWhale(req.params.address);
      if (!whale) {
        res.status(404).json({ error: 'Whale not found' });
        return;
      }
      res.json({ data: whale });
    } catch (err) {
      logger.error('Failed to fetch whale', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whale', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getAddressGraph(req: Request, res: Response): Promise<void> {
    try {
      const graph = await this.service.getAddressGraph();
      res.json({ data: graph });
    } catch (err) {
      logger.error('Failed to fetch whale address graph', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch address graph', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
