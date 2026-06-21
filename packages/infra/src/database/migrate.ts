import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './connection';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const db = getDb();

  // Ensure _migrations table exists (created by first migration, but we need it to check)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const migrations = ['001_initial_schema.sql', '002_add_clob_token_ids.sql', '003_add_bet_allocation.sql', '004_add_risk_metrics.sql', '005_add_prompt_ab_testing.sql', '006_add_decision_journal.sql', '007_add_alerts.sql'];

  for (const name of migrations) {
    const row = db
      .prepare('SELECT id FROM _migrations WHERE name = ?')
      .get(name) as { id: number } | undefined;

    if (row) {
      console.log(`Migration ${name} already executed, skipping`);
      continue;
    }

    const sql = readFileSync(join(__dirname, 'migrations', name), 'utf-8');

    console.log(`Running migration: ${name}`);
    const runMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    });
    runMigration();
    console.log(`Migration ${name} completed`);
  }

  console.log('All migrations completed');
}

// Run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
  closeDb();
  console.log('Done');
}
