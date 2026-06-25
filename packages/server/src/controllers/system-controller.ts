import type { Request, Response } from 'express';
import { taskTracker } from '../services/task-tracker-service';
import { logger } from '../utils/logger';

export class SystemController {
  getTasks(_req: Request, res: Response): void {
    try {
      res.json({ data: taskTracker.getSnapshot() });
    } catch (err) {
      logger.error('Failed to fetch task snapshot', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }
}
