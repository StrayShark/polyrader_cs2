import type { Request, Response } from 'express';
import { EsportsService } from '../services/esports-service';
import { logger } from '../utils/logger';

export class EsportsController {
  private service = new EsportsService();

  async getEvents(req: Request, res: Response): Promise<void> {
    try {
      const events = await this.service.getEvents();
      res.json({ data: events });
    } catch (err) {
      logger.error('Failed to fetch events', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch events', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getRankings(req: Request, res: Response): Promise<void> {
    try {
      const rankings = await this.service.getRankings();
      res.json({ data: rankings });
    } catch (err) {
      logger.error('Failed to fetch rankings', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch rankings', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getTeam(req: Request, res: Response): Promise<void> {
    try {
      const team = await this.service.getTeam(req.params.teamId);
      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      res.json({ data: team });
    } catch (err) {
      logger.error('Failed to fetch team', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch team', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMatch(req: Request, res: Response): Promise<void> {
    try {
      const match = await this.service.getMatch(req.params.matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      res.json({ data: match });
    } catch (err) {
      logger.error('Failed to fetch match', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch match', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMapPool(req: Request, res: Response): Promise<void> {
    try {
      const mapPool = await this.service.getMapPool();
      res.json({ data: mapPool });
    } catch (err) {
      logger.error('Failed to fetch map pool', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch map pool', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
