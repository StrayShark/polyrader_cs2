import type { Request, Response } from 'express';
import { PolymarketAccountService } from '../services/polymarket-account-service';
import { logger } from '../utils/logger';

export class PolymarketAccountController {
  private service = new PolymarketAccountService();

  async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const overview = await this.service.getOverview();
      res.json({ data: overview });
    } catch (err) {
      logger.error('Failed to fetch Polymarket account overview', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch Polymarket account overview', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
