import type { Request, Response } from 'express';
import { getDb } from '@polyrader/infra';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class BackupController {
  /**
   * GET /api/backup/export
   * Exports the entire SQLite database as a downloadable .db file.
   * Uses better-sqlite3's backup() to create a consistent snapshot.
   */
  async exportDatabase(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const tempPath = path.join(process.cwd(), 'data', `backup-${Date.now()}.db`);

      // Create a consistent backup using SQLite's backup API
      await db.backup(tempPath);

      const stats = fs.statSync(tempPath);
      logger.info('Backup: Database exported', { path: tempPath, size: stats.size });

      res.download(tempPath, `polyrader-backup-${new Date().toISOString().slice(0, 10)}.db`, (err) => {
        // Clean up temp file after download
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        if (err) {
          logger.warn('Backup: Download transfer error', { error: err.message });
        }
      });
    } catch (err) {
      logger.error('Backup: Export failed', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Database export failed' });
    }
  }

  /**
   * POST /api/backup/import
   * Restores the database from a raw .db file uploaded in the request body.
   * Use with `express.raw({ type: 'application/octet-stream', limit: '256mb' })`.
   */
  async importDatabase(req: Request, res: Response): Promise<void> {
    try {
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length < 16) {
        res.status(400).json({ error: 'No database file uploaded (expected application/octet-stream body)' });
        return;
      }

      // Verify the uploaded file is a valid SQLite database
      const sqliteHeader = Buffer.from('SQLite format 3\0');
      if (!buf.subarray(0, 16).equals(sqliteHeader)) {
        res.status(400).json({ error: 'Uploaded file is not a valid SQLite database' });
        return;
      }

      const dbPath = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace('sqlite:', '')
        : path.join(process.cwd(), 'data', 'polyrader.db');

      // Close current DB connection before replacing the file
      const { closeDb } = await import('@polyrader/infra');
      closeDb();

      // Ensure data dir exists then write the new database file
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, buf);

      logger.info('Backup: Database imported', { path: dbPath, size: buf.length });

      res.json({
        message: 'Database restored successfully. The application will reconnect on next request.',
        restoredAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Backup: Import failed', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Database import failed' });
    }
  }

  /**
   * GET /api/backup/info
   * Returns database file size and table counts for the backup UI.
   */
  async getBackupInfo(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const dbPath = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace('sqlite:', '')
        : path.join(process.cwd(), 'data', 'polyrader.db');

      let fileSize = 0;
      try {
        fileSize = fs.statSync(dbPath).size;
      } catch { /* ignore */ }

      // Count rows in key tables
      const tables = ['matches', 'teams', 'llm_analyses', 'simulated_bets', 'llm_configs', 'markets'];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
          counts[table] = row.count;
        } catch {
          counts[table] = 0;
        }
      }

      res.json({
        data: {
          fileSize,
          fileSizeFormatted: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
          tableCounts: counts,
          dbPath: path.basename(dbPath),
        },
      });
    } catch (err) {
      logger.error('Backup: Info failed', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to get backup info' });
    }
  }
}
