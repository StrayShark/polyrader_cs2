import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { SignalRepository } from '../repositories/signal-repository';

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE markets (
      condition_id TEXT PRIMARY KEY,
      resolved_outcome TEXT,
      resolved_price REAL
    );

    CREATE TABLE signal_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      market_prob REAL NOT NULL,
      predicted_prob REAL NOT NULL,
      behavior_prob REAL,
      ai_debate_prob REAL,
      final_prob REAL NOT NULL,
      edge REAL NOT NULL,
      risk_adjusted_edge REAL NOT NULL,
      recommendation TEXT NOT NULL DEFAULT 'skip',
      resolved_outcome TEXT,
      resolved_price REAL,
      signals TEXT NOT NULL DEFAULT '[]',
      market_behavior TEXT,
      ai_debate TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE signal_tuning_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      source_weights TEXT NOT NULL,
      behavior_weights TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

describe('SignalRepository', () => {
  let repo: SignalRepository;

  beforeAll(() => {
    repo = new SignalRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('updates tuning config while preserving default values', () => {
    const updated = repo.updateTuningConfig({
      sourceWeights: {
        prediction_model: 1.25,
      },
      recommendation: {
        minEdge: 0.08,
      },
    });

    expect(updated.sourceWeights.prediction_model).toBe(1.25);
    expect(updated.sourceWeights.ai_debate).toBe(1.15);
    expect(updated.recommendation.minEdge).toBe(0.08);
    expect(updated.recommendation.minConfidence).toBe(0.3);

    const refetched = repo.getTuningConfig();
    expect(refetched.sourceWeights.prediction_model).toBe(1.25);
    expect(refetched.recommendation.minEdge).toBe(0.08);
  });

  it('findResolved fills missing snapshot resolution from markets table', () => {
    testDb.prepare(
      `INSERT INTO markets (condition_id, resolved_outcome, resolved_price)
       VALUES ('m1', 'Yes', 1)`,
    ).run();

    repo.insertSnapshot({
      marketId: 'm1',
      question: 'Will Team A win?',
      marketProb: 0.45,
      predictedProb: 0.62,
      behaviorProb: 0.58,
      aiDebateProb: 0.6,
      finalProb: 0.61,
      edge: 0.16,
      riskAdjustedEdge: 0.1,
      recommendation: 'buy_yes',
      signals: [],
    });

    const [snapshot] = repo.findResolved(10);

    expect(snapshot.marketId).toBe('m1');
    expect(snapshot.resolvedOutcome).toBe('Yes');
    expect(snapshot.resolvedPrice).toBe(1);
  });
});
