import type { Request, Response } from 'express';
import { WhaleService } from '../services/whale-service';
import { logger } from '../utils/logger';

export class WhaleController {
  private service = new WhaleService();

  async getWhales(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const whales = await this.service.getWhales(limit);
      res.json({ data: whales });
    } catch (err) {
      logger.error('Failed to fetch whales', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whales', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
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
