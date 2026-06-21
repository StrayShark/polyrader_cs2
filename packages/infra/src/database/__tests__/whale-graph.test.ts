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

import { WhaleRepository } from '../repositories/whale-repository';

function setupTestDb(): void {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE whales (
      address TEXT PRIMARY KEY,
      label TEXT,
      total_volume REAL,
      total_positions INTEGER,
      active_positions INTEGER,
      win_rate REAL,
      pnl REAL,
      suspicious_score TEXT,
      recent_trades TEXT,
      last_active TEXT,
      updated_at TEXT
    );

    CREATE TABLE whale_trades (
      tx_hash    TEXT PRIMARY KEY,
      address    TEXT NOT NULL,
      market_id  TEXT NOT NULL,
      outcome    TEXT NOT NULL,
      amount     REAL NOT NULL,
      price      REAL NOT NULL,
      timestamp  TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'buy'
    );
  `);
}

function insertTrade(
  tx: string,
  address: string,
  market: string,
  outcome: string,
  amount: number,
  type: 'buy' | 'sell',
): void {
  testDb
    .prepare(
      `INSERT INTO whale_trades (tx_hash, address, market_id, outcome, amount, price, timestamp, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(tx, address, market, outcome, amount, 0.5, '2024-01-01', type);
}

describe('WhaleRepository.getAddressGraph', () => {
  let repo: WhaleRepository;

  beforeAll(() => {
    repo = new WhaleRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('returns correct nodes/links structure for interacting addresses', () => {
    // A buys m1/Yes, B sells m1/Yes  → interaction A (buyer) → B (seller)
    insertTrade('t1', '0xAAA', 'm1', 'Yes', 100, 'buy');
    insertTrade('t2', '0xBBB', 'm1', 'Yes', 80, 'sell');
    // C buys m2/No, A sells m2/No    → interaction C (buyer) → A (seller)
    insertTrade('t3', '0xCCC', 'm2', 'No', 50, 'buy');
    insertTrade('t4', '0xAAA', 'm2', 'No', 30, 'sell');

    const graph = repo.getAddressGraph();

    // Three interacting addresses, sorted by volume desc: A(130), B(80), C(50)
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes[0].id).toBe('0xAAA');
    expect(graph.nodes[0].volume).toBe(130);
    expect(graph.nodes[0].tradeCount).toBe(2);
    expect(graph.nodes[1].id).toBe('0xBBB');
    expect(graph.nodes[1].volume).toBe(80);
    expect(graph.nodes[1].tradeCount).toBe(1);
    expect(graph.nodes[2].id).toBe('0xCCC');
    expect(graph.nodes[2].volume).toBe(50);

    // Links: A→B (value 100), C→A (value 50)
    const linkAB = graph.links.find((l) => l.source === '0xAAA' && l.target === '0xBBB');
    expect(linkAB).toBeDefined();
    expect(linkAB!.value).toBe(100);
    const linkCA = graph.links.find((l) => l.source === '0xCCC' && l.target === '0xAAA');
    expect(linkCA).toBeDefined();
    expect(linkCA!.value).toBe(50);
  });

  it('returns empty arrays when no trades exist', () => {
    const graph = repo.getAddressGraph();
    expect(graph.nodes).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it('does not create links between addresses with no buy/sell overlap', () => {
    // Two buyers on the same market/outcome (no seller) → no interaction
    insertTrade('t1', '0xAAA', 'm1', 'Yes', 100, 'buy');
    insertTrade('t2', '0xBBB', 'm1', 'Yes', 200, 'buy');

    const graph = repo.getAddressGraph();
    expect(graph.nodes).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it('limits nodes to 50 sorted by volume desc', () => {
    // 1 seller + 60 buyers all interacting on m1/Yes = 61 interacting addresses
    insertTrade('seller', '0xSEL', 'm1', 'Yes', 1000, 'sell');
    for (let i = 1; i <= 60; i++) {
      const addr = `0x${i.toString(16).padStart(40, '0')}`;
      insertTrade(`tx-${i}`, addr, 'm1', 'Yes', i * 10, 'buy');
    }

    const graph = repo.getAddressGraph();

    expect(graph.nodes).toHaveLength(50);
    // Seller has the highest volume (1000) → first node
    expect(graph.nodes[0].id).toBe('0xSEL');
    expect(graph.nodes[0].volume).toBe(1000);
    // Nodes are sorted by volume descending
    for (let i = 1; i < graph.nodes.length; i++) {
      expect(graph.nodes[i - 1].volume).toBeGreaterThanOrEqual(graph.nodes[i].volume);
    }
  });

  it('limits links to 100', () => {
    // 15 buyers × 15 sellers on m1/Yes = 225 interaction links
    for (let i = 0; i < 15; i++) {
      insertTrade(`b-${i}`, `0xB${i}`, 'm1', 'Yes', 100, 'buy');
    }
    for (let j = 0; j < 15; j++) {
      insertTrade(`s-${j}`, `0xS${j}`, 'm1', 'Yes', 100, 'sell');
    }

    const graph = repo.getAddressGraph();

    // 30 interacting addresses (≤ 50 nodes)
    expect(graph.nodes).toHaveLength(30);
    // Links capped at 100
    expect(graph.links).toHaveLength(100);
  });
});
