import type { Request, Response } from 'express';
import { AlertService } from '../services/alert-service';
import { logger } from '../utils/logger';

export class AlertController {
  private service = new AlertService();

  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const triggeredParam = req.query.triggered as string | undefined;
      let triggered: boolean | undefined;
      if (triggeredParam === 'true') triggered = true;
      if (triggeredParam === 'false') triggered = false;
      const alerts = this.service.getAlerts(triggered);
      res.json({ data: alerts });
    } catch (err) {
      logger.error('Failed to fetch alerts', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch alerts', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async createAlert(req: Request, res: Response): Promise<void> {
    try {
      const alert = this.service.createAlert(req.body);
      res.status(201).json({ data: alert });
    } catch (err) {
      logger.error('Failed to create alert', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to create alert', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async updateAlert(req: Request, res: Response): Promise<void> {
    try {
      const alert = this.service.updateAlert(req.params.id, req.body);
      if (!alert) {
        res.status(404).json({ error: 'Alert not found' });
        return;
      }
      res.json({ data: alert });
    } catch (err) {
      logger.error('Failed to update alert', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to update alert', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async deleteAlert(req: Request, res: Response): Promise<void> {
    try {
      const deleted = this.service.deleteAlert(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Alert not found' });
        return;
      }
      res.json({ message: 'Alert deleted' });
    } catch (err) {
      logger.error('Failed to delete alert', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to delete alert', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
