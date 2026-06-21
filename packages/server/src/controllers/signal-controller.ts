import type { Request, Response } from 'express';
import { SignalService } from '../services/signal-service';
import { logger } from '../utils/logger';

export class SignalController {
  private service = new SignalService();

  async getSignals(req: Request, res: Response): Promise<void> {
    try {
      const signals = await this.service.getSignals(req.params.marketId);
      res.json({ data: signals });
    } catch (err) {
      logger.error('Failed to fetch signals', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch signals', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getTopSignals(req: Request, res: Response): Promise<void> {
    try {
      const signals = await this.service.getTopDeviations(10);
      res.json({ data: signals });
    } catch (err) {
      logger.error('Failed to fetch top signals', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch top signals', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.service.getStats();
      res.json({ data: stats });
    } catch (err) {
      logger.error('Failed to fetch signal stats', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch signal stats', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
