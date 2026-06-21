import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function getDbPath(): string {
  // Tauri sidecar mode: POLYRADER_DATA_DIR env set by Rust backend
  const dataDir = process.env.POLYRADER_DATA_DIR;
  if (dataDir) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'polyrader.db');
  }

  // Legacy: DATABASE_URL or fallback to cwd/data
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    return dbUrl.replace('sqlite:', '');
  }

  return path.join(process.cwd(), 'data', 'polyrader.db');
}

const DB_PATH = getDbPath();

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);

    // Performance pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    console.log(`SQLite connected: ${DB_PATH}`);
  }
  return db;
}

export function query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const database = getDb();
  const stmt = database.prepare(sql);
  const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
  if (isSelect) {
    return stmt.all(...params) as T[];
  }
  stmt.run(...params);
  return [];
}

export function queryOne<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  const database = getDb();
  const stmt = database.prepare(sql);
  return (stmt.get(...params) as T) ?? undefined;
}

export function checkDbConnection(): void {
  getDb().prepare('SELECT 1').get();
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function transaction<T>(fn: () => T): T {
  const database = getDb();
  const tx = database.transaction(fn);
  return tx();
}
