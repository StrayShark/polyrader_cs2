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

  async getSignalSnapshots(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '50'), 10);
      const snapshots = this.service.getSignalSnapshots(
        req.params.marketId,
        Number.isFinite(limit) ? limit : 50,
      );
      res.json({ data: snapshots });
    } catch (err) {
      logger.error('Failed to fetch signal snapshots', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch signal snapshots', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getRecentSignalSnapshots(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '100'), 10);
      const snapshots = this.service.getRecentSignalSnapshots(Number.isFinite(limit) ? limit : 100);
      res.json({ data: snapshots });
    } catch (err) {
      logger.error('Failed to fetch recent signal snapshots', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch recent signal snapshots', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getSignalBacktest(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '1000'), 10);
      const minEdgeRaw = req.query.minEdge;
      const minEdge = minEdgeRaw === undefined ? undefined : Number(minEdgeRaw);
      const backtest = this.service.getSignalBacktest(
        Number.isFinite(limit) ? limit : 1000,
        Number.isFinite(minEdge) ? minEdge : undefined,
      );
      res.json({ data: backtest });
    } catch (err) {
      logger.error('Failed to fetch signal backtest', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch signal backtest', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getSignalTuningConfig(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: this.service.getTuningConfig() });
    } catch (err) {
      logger.error('Failed to fetch signal tuning config', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch signal tuning config', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async updateSignalTuningConfig(req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: this.service.updateTuningConfig(req.body) });
    } catch (err) {
      logger.error('Failed to update signal tuning config', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to update signal tuning config', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
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

  async getArbitrage(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.service.getArbitrageOpportunities();
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to fetch arbitrage opportunities', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch arbitrage opportunities', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
