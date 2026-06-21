import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// In-memory SQLite database for testing
let testDb: Database.Database;

// Mock the connection module before importing repository
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

import { LLMRepository } from '../repositories/llm-repository';

function setupTestDb() {
  testDb = new Database(':memory:');

  // Create matches table (needed for FK)
  testDb.exec(`
    CREATE TABLE matches (
      match_id TEXT PRIMARY KEY,
      question TEXT,
      condition_id TEXT,
      team_a TEXT,
      team_b TEXT
    )
  `);

  // Create llm_analyses with variant_id (migration 005)
  testDb.exec(`
    CREATE TABLE llm_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL REFERENCES matches(match_id),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      team_a_prob REAL NOT NULL,
      team_b_prob REAL NOT NULL,
      confidence REAL DEFAULT 0,
      reasoning TEXT DEFAULT '',
      key_factors TEXT DEFAULT '[]',
      risk_assessment TEXT DEFAULT '',
      latency INTEGER DEFAULT 0,
      token_usage TEXT DEFAULT '{}',
      error TEXT,
      variant_id TEXT DEFAULT 'baseline',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create simulated_bets with variant_id and reasoning
  testDb.exec(`
    CREATE TABLE simulated_bets (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(match_id),
      provider TEXT NOT NULL,
      team TEXT NOT NULL,
      amount REAL DEFAULT 100,
      odds REAL NOT NULL,
      result TEXT DEFAULT 'pending',
      profit_loss REAL DEFAULT 0,
      placed_at TEXT DEFAULT (datetime('now')),
      settled_at TEXT,
      reasoning TEXT DEFAULT '',
      variant_id TEXT DEFAULT 'baseline'
    )
  `);

  // Insert a match for FK
  testDb.prepare(`INSERT INTO matches (match_id, question) VALUES (?, ?)`).run('m1', 'Test Match');
}

describe('LLMRepository.getVariantStats', () => {
  let repo: LLMRepository;

  beforeAll(() => {
    repo = new LLMRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('returns correct stats for baseline variant', () => {
    // Insert 3 analyses for baseline
    for (let i = 0; i < 3; i++) {
      testDb
        .prepare(
          `INSERT INTO llm_analyses (match_id, provider, model, team_a_prob, team_b_prob, variant_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('m1', 'openai', 'gpt-4o', 0.6, 0.4, 'baseline');
    }

    // Insert bets for baseline: 2 won, 1 lost, 1 pending
    // won: amount=100 (PnL=+100), amount=50 (PnL=+50)
    // lost: amount=80 (PnL=-80)
    // pending: amount=200 (PnL=0)
    // total staked = 100+50+80 = 230 (pending excluded from staked? No, SUM(amount) includes all)
    // Actually total_staked = SUM(amount) = 100+50+80+200 = 430
    const bets = [
      { id: 'b1', amount: 100, result: 'won', pnl: 100 },
      { id: 'b2', amount: 50, result: 'won', pnl: 50 },
      { id: 'b3', amount: 80, result: 'lost', pnl: -80 },
      { id: 'b4', amount: 200, result: 'pending', pnl: 0 },
    ];
    for (const b of bets) {
      testDb
        .prepare(
          `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, variant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(b.id, 'm1', 'user', 'TeamA', b.amount, 2.0, b.result, b.pnl, 'baseline');
    }

    const stats = repo.getVariantStats('baseline');

    expect(stats.totalAnalyses).toBe(3);
    expect(stats.totalBets).toBe(4);
    expect(stats.wonBets).toBe(2);
    expect(stats.lostBets).toBe(1);
    expect(stats.pendingBets).toBe(1);
    expect(stats.profitLoss).toBe(70); // 100 + 50 - 80 + 0 = 70
    // roi = profitLoss / total_staked = 70 / 430
    expect(stats.roi).toBeCloseTo(70 / 430, 5);
    // accuracy = won / (won + lost) = 2 / 3
    expect(stats.accuracy).toBeCloseTo(2 / 3, 5);
  });

  it('returns correct stats for v2 variant', () => {
    // Insert 2 analyses for v2
    for (let i = 0; i < 2; i++) {
      testDb
        .prepare(
          `INSERT INTO llm_analyses (match_id, provider, model, team_a_prob, team_b_prob, variant_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('m1', 'openai', 'gpt-4o', 0.55, 0.45, 'v2');
    }

    // Insert bets for v2: 1 won, 1 lost
    const bets = [
      { id: 'b5', amount: 200, result: 'won', pnl: 200 },
      { id: 'b6', amount: 100, result: 'lost', pnl: -100 },
    ];
    for (const b of bets) {
      testDb
        .prepare(
          `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, variant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(b.id, 'm1', 'user', 'TeamA', b.amount, 2.0, b.result, b.pnl, 'v2');
    }

    const stats = repo.getVariantStats('v2');

    expect(stats.totalAnalyses).toBe(2);
    expect(stats.totalBets).toBe(2);
    expect(stats.wonBets).toBe(1);
    expect(stats.lostBets).toBe(1);
    expect(stats.pendingBets).toBe(0);
    expect(stats.profitLoss).toBe(100); // 200 - 100 = 100
    expect(stats.roi).toBeCloseTo(100 / 300, 5); // 100 / (200+100)
    expect(stats.accuracy).toBeCloseTo(0.5, 5); // 1 / (1+1)
  });

  it('returns zeros for non-existent variant', () => {
    const stats = repo.getVariantStats('nonexistent');

    expect(stats.totalAnalyses).toBe(0);
    expect(stats.totalBets).toBe(0);
    expect(stats.wonBets).toBe(0);
    expect(stats.lostBets).toBe(0);
    expect(stats.pendingBets).toBe(0);
    expect(stats.profitLoss).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.accuracy).toBe(0);
  });

  it('returns zeros for variant with only pending bets', () => {
    // Insert 1 pending bet only
    testDb
      .prepare(
        `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, variant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('b7', 'm1', 'user', 'TeamA', 100, 2.0, 'pending', 0, 'pending-only');

    const stats = repo.getVariantStats('pending-only');

    expect(stats.totalBets).toBe(1);
    expect(stats.wonBets).toBe(0);
    expect(stats.lostBets).toBe(0);
    expect(stats.pendingBets).toBe(1);
    expect(stats.profitLoss).toBe(0);
    expect(stats.accuracy).toBe(0); // settledBets = 0, so accuracy = 0
    expect(stats.roi).toBe(0); // totalStaked > 0 but profitLoss = 0
  });

  it('isolates stats between variants', () => {
    // Insert data for two variants
    testDb
      .prepare(
        `INSERT INTO llm_analyses (match_id, provider, model, team_a_prob, team_b_prob, variant_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('m1', 'openai', 'gpt-4o', 0.6, 0.4, 'a');

    testDb
      .prepare(
        `INSERT INTO llm_analyses (match_id, provider, model, team_a_prob, team_b_prob, variant_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('m1', 'openai', 'gpt-4o', 0.5, 0.5, 'b');

    testDb
      .prepare(
        `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, variant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('ba', 'm1', 'user', 'TeamA', 100, 2.0, 'won', 100, 'a');

    testDb
      .prepare(
        `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, variant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('bb', 'm1', 'user', 'TeamA', 100, 2.0, 'lost', -100, 'b');

    const statsA = repo.getVariantStats('a');
    const statsB = repo.getVariantStats('b');

    expect(statsA.totalAnalyses).toBe(1);
    expect(statsA.wonBets).toBe(1);
    expect(statsA.lostBets).toBe(0);
    expect(statsA.profitLoss).toBe(100);

    expect(statsB.totalAnalyses).toBe(1);
    expect(statsB.wonBets).toBe(0);
    expect(statsB.lostBets).toBe(1);
    expect(statsB.profitLoss).toBe(-100);
  });
});
