import type { Request, Response } from 'express';
import { WalletFollowService } from '../services/wallet-follow-service';
import { logger } from '../utils/logger';
import type {
  followWalletBodySchema,
  walletCopyConfigBodySchema,
  walletFollowQuerySchema,
} from '../validation/schemas';
import type { z } from 'zod';

type FollowWalletBody = z.infer<typeof followWalletBodySchema>;
type WalletCopyConfigBody = z.infer<typeof walletCopyConfigBodySchema>;
type WalletFollowQuery = z.infer<typeof walletFollowQuerySchema>;

export class WalletFollowController {
  private service = new WalletFollowService();

  async listFollowed(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: this.service.listFollowed() });
    } catch (err) {
      logger.error('Failed to list followed wallets', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to list followed wallets' });
    }
  }

  async follow(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as FollowWalletBody;
      const wallet = this.service.follow(body);
      res.status(201).json({ data: wallet });
    } catch (err) {
      logger.error('Failed to follow wallet', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to follow wallet' });
    }
  }

  async unfollow(req: Request, res: Response): Promise<void> {
    try {
      const removed = this.service.unfollow(req.params.address);
      if (!removed) {
        res.status(404).json({ error: 'Wallet not followed' });
        return;
      }
      res.json({ data: { removed: true } });
    } catch (err) {
      logger.error('Failed to unfollow wallet', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to unfollow wallet' });
    }
  }

  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ data: this.service.getConfig() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get copy config' });
    }
  }

  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as WalletCopyConfigBody;
      res.json({ data: this.service.updateConfig(body) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update copy config' });
    }
  }

  async listSignals(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WalletFollowQuery;
      res.json({ data: this.service.listSignals(query.limit, query.status) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list copy signals' });
    }
  }

  async listCopyTrades(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WalletFollowQuery;
      res.json({ data: this.service.listCopyTrades(query.limit) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list copy trades' });
    }
  }

  async executeSignal(req: Request, res: Response): Promise<void> {
    try {
      const trade = await this.service.executeSignal(req.params.signalId);
      res.json({ data: trade });
    } catch (err) {
      const message = (err as Error).message;
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  }
}
