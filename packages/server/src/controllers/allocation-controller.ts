import type { Request, Response } from 'express';
import { AllocationService } from '../services/allocation-service';
import { logger } from '../utils/logger';

export class AllocationController {
  private service = new AllocationService();

  async getBankroll(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.service.getBankrollConfig();
      const state = this.service.getBankrollState();
      res.json({ data: { config, state } });
    } catch (err) {
      logger.error('Failed to fetch bankroll', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch bankroll' });
    }
  }

  async updateBankroll(req: Request, res: Response): Promise<void> {
    try {
      const { totalCapital, targetReturnRate, riskTolerance, maxBetFraction, maxTotalExposure } = req.body;
      const config = this.service.updateBankrollConfig({
        totalCapital,
        targetReturnRate,
        riskTolerance,
        maxBetFraction: maxBetFraction ?? 0.15,
        maxTotalExposure: maxTotalExposure ?? 0.6,
      });
      res.json({ data: config });
    } catch (err) {
      logger.error('Failed to update bankroll', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to update bankroll' });
    }
  }

  async createAllocation(req: Request, res: Response): Promise<void> {
    try {
      const { opportunities, useLLM } = req.body;
      const plan = await this.service.createAllocation(opportunities, useLLM ?? false);
      res.status(201).json({ data: plan });
    } catch (err) {
      logger.error('Failed to create allocation', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create allocation', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getLatestPlan(_req: Request, res: Response): Promise<void> {
    try {
      const plan = this.service.getLatestPlan();
      res.json({ data: plan });
    } catch (err) {
      logger.error('Failed to fetch latest plan', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch latest plan' });
    }
  }

  async getPlanHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const plans = this.service.getPlanHistory(limit);
      res.json({ data: plans });
    } catch (err) {
      logger.error('Failed to fetch plan history', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch plan history' });
    }
  }
}
