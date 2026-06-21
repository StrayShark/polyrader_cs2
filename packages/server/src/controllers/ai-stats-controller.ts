import type { Request, Response } from 'express';
import { AiStatsService } from '../services/ai-stats-service';
import { logger } from '../utils/logger';

export class AiStatsController {
  private service = new AiStatsService();

  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const leaderboard = await this.service.getLeaderboard();
      res.json({ data: leaderboard });
    } catch (err) {
      logger.error('Failed to fetch leaderboard', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch leaderboard', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.service.getUserStats();
      res.json({ data: stats });
    } catch (err) {
      logger.error('Failed to fetch user stats', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch user stats', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const history = await this.service.getHistory(limit);
      res.json({ data: history });
    } catch (err) {
      logger.error('Failed to fetch history', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch history', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getCalibration(req: Request, res: Response): Promise<void> {
    try {
      const calibration = await this.service.getCalibration(req.params.providerId);
      res.json({ data: calibration });
    } catch (err) {
      logger.error('Failed to fetch calibration', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch calibration', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async placeBet(req: Request, res: Response): Promise<void> {
    try {
      const { matchId, team, amount, odds, provider, reasoning } = req.body;
      const bet = await this.service.placeBet(matchId, team, amount, odds, provider, reasoning);
      res.status(201).json({ data: bet });
    } catch (err) {
      logger.error('Failed to place bet', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to place bet', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async settleBet(req: Request, res: Response): Promise<void> {
    try {
      const { result, profitLoss } = req.body;
      const bet = await this.service.settleBet(req.params.id, result, profitLoss);
      if (!bet) {
        res.status(404).json({ error: 'Bet not found' });
        return;
      }
      res.json({ data: bet });
    } catch (err) {
      logger.error('Failed to settle bet', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to settle bet', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async deleteBet(req: Request, res: Response): Promise<void> {
    try {
      await this.service.deleteBet(req.params.id);
      res.status(204).send();
    } catch (err) {
      logger.error('Failed to delete bet', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to delete bet', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getEquityCurve(_req: Request, res: Response): Promise<void> {
    try {
      const curve = await this.service.getEquityCurve();
      res.json({ data: curve });
    } catch (err) {
      logger.error('Failed to fetch equity curve', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch equity curve', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
