import type { Request, Response } from 'express';
import { DailyService } from '../services/daily-service';
import { trackTask } from '../services/task-tracker-service';
import type { DailyDashboard } from '@polyrader/core';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

export class DailyController {
  private service = new DailyService();

  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await this.service.getDashboard();
      res.json({ data: dashboard });
    } catch (err) {
      logger.error('Failed to fetch daily dashboard', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch daily dashboard', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      let dashboard: DailyDashboard | undefined;
      await trackTask('daily-dashboard-manual', {
        name: '手动刷新每日看板',
        category: 'system',
        trigger: 'manual',
      }, async (ctx) => {
        dashboard = await this.service.refreshDashboard();
        broadcast('daily', dashboard);
        ctx.log(`${dashboard.totalMatches} 场比赛已更新`);
      });
      res.json({ data: dashboard, message: 'Dashboard refreshed' });
    } catch (err) {
      logger.error('Failed to refresh dashboard', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to refresh dashboard', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
