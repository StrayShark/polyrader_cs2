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

import { AlertRepository } from '../repositories/alert-repository';

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE price_alerts (
      id TEXT PRIMARY KEY,
      market_slug TEXT NOT NULL,
      market_question TEXT NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('price_above','price_below','volume_above')),
      threshold REAL NOT NULL,
      current_value REAL DEFAULT 0,
      triggered INTEGER DEFAULT 0,
      triggered_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

describe('AlertRepository', () => {
  let repo: AlertRepository;

  beforeAll(() => {
    repo = new AlertRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('creates and retrieves an alert by id', () => {
    const alert = repo.createAlert({
      id: 'a1',
      marketSlug: 'test-market',
      marketQuestion: 'Will Team A win?',
      alertType: 'price_above',
      threshold: 0.65,
    });

    expect(alert.id).toBe('a1');
    expect(alert.marketSlug).toBe('test-market');
    expect(alert.alertType).toBe('price_above');
    expect(alert.threshold).toBe(0.65);
    expect(alert.triggered).toBe(false);

    const fetched = repo.getAlertById('a1');
    expect(fetched).not.toBeNull();
    expect(fetched!.marketQuestion).toBe('Will Team A win?');
  });

  it('returns null for non-existent alert', () => {
    expect(repo.getAlertById('nonexistent')).toBeNull();
  });

  it('lists all alerts', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });
    repo.createAlert({ id: 'a2', marketSlug: 'm2', marketQuestion: 'Q2', alertType: 'volume_above', threshold: 1000 });

    const all = repo.getAlerts();
    expect(all).toHaveLength(2);
  });

  it('filters alerts by triggered status', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });
    repo.createAlert({ id: 'a2', marketSlug: 'm2', marketQuestion: 'Q2', alertType: 'price_below', threshold: 0.3 });

    repo.updateAlert('a1', { triggered: true });

    const triggered = repo.getAlerts(true);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].id).toBe('a1');
    expect(triggered[0].triggered).toBe(true);

    const notTriggered = repo.getAlerts(false);
    expect(notTriggered).toHaveLength(1);
    expect(notTriggered[0].id).toBe('a2');
  });

  it('updates alert threshold and current value', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });

    const updated = repo.updateAlert('a1', { threshold: 0.7, currentValue: 0.68 });
    expect(updated).not.toBeNull();
    expect(updated!.threshold).toBe(0.7);
    expect(updated!.currentValue).toBe(0.68);
    expect(updated!.triggered).toBe(false);
  });

  it('sets triggered_at when triggered', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });

    const updated = repo.updateAlert('a1', { triggered: true });
    expect(updated).not.toBeNull();
    expect(updated!.triggered).toBe(true);
    expect(updated!.triggeredAt).not.toBeNull();
  });

  it('returns null when updating non-existent alert', () => {
    const result = repo.updateAlert('nonexistent', { threshold: 0.5 });
    expect(result).toBeNull();
  });

  it('deletes an alert', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });

    const deleted = repo.deleteAlert('a1');
    expect(deleted).toBe(true);
    expect(repo.getAlertById('a1')).toBeNull();
  });

  it('returns false when deleting non-existent alert', () => {
    expect(repo.deleteAlert('nonexistent')).toBe(false);
  });

  it('gets triggered alerts via getTriggeredAlerts', () => {
    repo.createAlert({ id: 'a1', marketSlug: 'm1', marketQuestion: 'Q1', alertType: 'price_above', threshold: 0.5 });
    repo.createAlert({ id: 'a2', marketSlug: 'm2', marketQuestion: 'Q2', alertType: 'volume_above', threshold: 1000 });
    repo.createAlert({ id: 'a3', marketSlug: 'm3', marketQuestion: 'Q3', alertType: 'price_below', threshold: 0.3 });

    repo.updateAlert('a1', { triggered: true });
    repo.updateAlert('a3', { triggered: true });

    const triggered = repo.getTriggeredAlerts();
    expect(triggered).toHaveLength(2);
    expect(triggered.some((a) => a.id === 'a1')).toBe(true);
    expect(triggered.some((a) => a.id === 'a3')).toBe(true);
  });
});
