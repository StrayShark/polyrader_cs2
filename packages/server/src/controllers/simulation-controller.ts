import type { Request, Response } from 'express';
import type { LLMProvider } from '@polyrader/core';
import { SimulationService } from '../services/simulation-service';
import { logger } from '../utils/logger';

export class SimulationController {
  private service = new SimulationService();

  getConfig(_req: Request, res: Response): void {
    try {
      const config = this.service.getConfig();
      res.json({ data: config });
    } catch (err) {
      logger.error('Failed to get simulation config', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get simulation config' });
    }
  }

  updateConfig(req: Request, res: Response): void {
    try {
      const config = this.service.updateConfig(req.body);
      res.json({ data: config });
    } catch (err) {
      logger.error('Failed to update simulation config', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update simulation config' });
    }
  }

  getProviderStats(_req: Request, res: Response): void {
    try {
      const stats = this.service.getProviderStats();
      res.json({ data: stats });
    } catch (err) {
      logger.error('Failed to get provider stats', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get provider stats' });
    }
  }

  getEquityCurve(req: Request, res: Response): void {
    try {
      const provider = req.params.provider as LLMProvider;
      const curve = this.service.getEquityCurve(provider);
      res.json({ data: curve });
    } catch (err) {
      logger.error('Failed to get equity curve', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get equity curve' });
    }
  }

  getAllEquityCurves(_req: Request, res: Response): void {
    try {
      const curves = this.service.getAllEquityCurves();
      res.json({ data: curves });
    } catch (err) {
      logger.error('Failed to get all equity curves', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get all equity curves' });
    }
  }

  getBetHistory(req: Request, res: Response): void {
    try {
      const provider = req.params.provider as LLMProvider;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const bets = this.service.getBetHistory(provider, limit);
      res.json({ data: bets });
    } catch (err) {
      logger.error('Failed to get bet history', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to get bet history' });
    }
  }

  runBacktest(_req: Request, res: Response): void {
    try {
      const result = this.service.runBacktest();
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to run backtest', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to run backtest' });
    }
  }
}
