import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../connection', () => ({
  getDb: () => testDb,
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] => {
    const stmt = testDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params) as T[];
    }
    stmt.run(...params);
    return [];
  },
  queryOne: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined => {
    return (testDb.prepare(sql).get(...params) as T) ?? undefined;
  },
  closeDb: () => {
    if (testDb) testDb.close();
  },
}));

import { SimulationRepository } from '../repositories/simulation-repository';

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE simulation_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      enabled INTEGER DEFAULT 0,
      initial_capital REAL DEFAULT 10000,
      bet_strategy TEXT DEFAULT 'fixed',
      bet_amount REAL DEFAULT 100,
      max_bet_fraction REAL DEFAULT 0.05,
      min_confidence REAL DEFAULT 0.6,
      min_edge REAL DEFAULT 0.05,
      odds_source TEXT DEFAULT 'market',
      participating_providers TEXT DEFAULT '[]',
      auto_settle INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

describe('SimulationRepository', () => {
  let repo: SimulationRepository;

  beforeAll(() => {
    repo = new SimulationRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('getConfig returns default configuration', () => {
    const config = repo.getConfig();

    expect(config.id).toBe('default');
    expect(config.enabled).toBe(false);
    expect(config.initialCapital).toBe(10000);
    expect(config.betStrategy).toBe('fixed');
    expect(config.betAmount).toBe(100);
    expect(config.maxBetFraction).toBe(0.05);
    expect(config.minConfidence).toBe(0.6);
    expect(config.minEdge).toBe(0.05);
    expect(config.oddsSource).toBe('market');
    expect(config.participatingProviders).toEqual([]);
    expect(config.autoSettle).toBe(true);
  });

  it('getConfig inserts default row if missing', () => {
    // No row exists yet in fresh DB
    const config = repo.getConfig();
    expect(config.id).toBe('default');

    // Verify row was inserted
    const row = testDb.prepare(`SELECT id FROM simulation_config WHERE id = 'default'`).get() as { id: string };
    expect(row.id).toBe('default');
  });

  it('updateConfig correctly updates fields', () => {
    const updated = repo.updateConfig({
      enabled: true,
      initialCapital: 50000,
      betStrategy: 'kelly',
      betAmount: 200,
      maxBetFraction: 0.1,
      minConfidence: 0.7,
      minEdge: 0.1,
      oddsSource: 'llm_inverse',
      participatingProviders: ['openai', 'anthropic'],
      autoSettle: false,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.initialCapital).toBe(50000);
    expect(updated.betStrategy).toBe('kelly');
    expect(updated.betAmount).toBe(200);
    expect(updated.maxBetFraction).toBe(0.1);
    expect(updated.minConfidence).toBe(0.7);
    expect(updated.minEdge).toBe(0.1);
    expect(updated.oddsSource).toBe('llm_inverse');
    expect(updated.participatingProviders).toEqual(['openai', 'anthropic']);
    expect(updated.autoSettle).toBe(false);

    // Verify persistence
    const refetched = repo.getConfig();
    expect(refetched.enabled).toBe(true);
    expect(refetched.initialCapital).toBe(50000);
    expect(refetched.betStrategy).toBe('kelly');
    expect(refetched.participatingProviders).toEqual(['openai', 'anthropic']);
  });

  it('updateConfig partial update preserves other fields', () => {
    // First set a full config
    repo.updateConfig({
      enabled: true,
      initialCapital: 20000,
      betStrategy: 'proportional',
      betAmount: 50,
      participatingProviders: ['openai', 'google'],
    });

    // Now do a partial update — only change enabled and betAmount
    const partial = repo.updateConfig({
      enabled: false,
      betAmount: 500,
    });

    // Changed fields
    expect(partial.enabled).toBe(false);
    expect(partial.betAmount).toBe(500);

    // Preserved fields
    expect(partial.initialCapital).toBe(20000);
    expect(partial.betStrategy).toBe('proportional');
    expect(partial.maxBetFraction).toBe(0.05);
    expect(partial.minConfidence).toBe(0.6);
    expect(partial.minEdge).toBe(0.05);
    expect(partial.oddsSource).toBe('market');
    expect(partial.participatingProviders).toEqual(['openai', 'google']);
    expect(partial.autoSettle).toBe(true);
  });
});
