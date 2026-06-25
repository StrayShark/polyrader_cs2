import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations, closeDb } from '@polyrader/infra';
import { WalletFollowService } from '../services/wallet-follow-service';

const testDbPath = path.join(process.cwd(), 'data', 'wallet-follow-test.db');

describe('WalletFollowService', () => {
  beforeEach(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('forces paper mode when live is requested', () => {
    const service = new WalletFollowService();
    const config = service.updateConfig({ mode: 'live', enabled: true });
    expect(config.mode).toBe('paper');
  });

  it('follows and lists a wallet address', () => {
    const service = new WalletFollowService();
    const address = '0x1234567890123456789012345678901234567890';
    service.follow({ address, alertsEnabled: true });
    const list = service.listFollowed();
    expect(list.some((w) => w.address === address.toLowerCase())).toBe(true);
  });
});
