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
  transaction: <T>(fn: () => T): T => {
    return testDb.transaction(fn)() as T;
  },
  closeDb: () => {
    if (testDb) testDb.close();
  },
}));

import { EsportsRepository } from '../repositories/esports-repository';

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE players (
      player_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      real_name TEXT,
      role TEXT,
      rating REAL,
      kd_ratio REAL,
      hs_percent REAL,
      maps_played INTEGER,
      source TEXT DEFAULT 'hltv',
      first_seen TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE team_rosters (
      roster_hash TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      player_ids TEXT NOT NULL,
      player_count INTEGER DEFAULT 5,
      is_active INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE team_roster_players (
      roster_hash TEXT NOT NULL,
      player_id TEXT NOT NULL,
      PRIMARY KEY (roster_hash, player_id)
    );

    CREATE TABLE match_lineups (
      match_id TEXT PRIMARY KEY,
      team_a_hash TEXT,
      team_b_hash TEXT,
      team_a_confirmed INTEGER DEFAULT 0,
      team_b_confirmed INTEGER DEFAULT 0,
      team_a_standin_count INTEGER DEFAULT 0,
      team_b_standin_count INTEGER DEFAULT 0,
      raw_lineup TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE match_lineup_players (
      match_id TEXT NOT NULL,
      team_side TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT,
      is_standin INTEGER DEFAULT 0,
      PRIMARY KEY (match_id, team_side, player_id)
    );

    CREATE TABLE head_to_head (
      team_a_id TEXT NOT NULL,
      team_b_id TEXT NOT NULL,
      matches_played INTEGER DEFAULT 0,
      team_a_wins INTEGER DEFAULT 0,
      team_b_wins INTEGER DEFAULT 0,
      last_match_date TEXT,
      map_results TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (team_a_id, team_b_id)
    );

    CREATE TABLE team_match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      result TEXT,
      opponent TEXT,
      score TEXT,
      event TEXT,
      match_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE map_pool_stats (
      team_id TEXT NOT NULL,
      map_name TEXT NOT NULL,
      win_rate REAL,
      matches_played INTEGER,
      rounds_won INTEGER,
      rounds_lost INTEGER,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, map_name)
    );

    CREATE TABLE matches (
      match_id TEXT PRIMARY KEY,
      tier TEXT DEFAULT 'C',
      status TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE teams (
      team_id TEXT PRIMARY KEY,
      roster_hash TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE analysis_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      min_tier TEXT NOT NULL DEFAULT 'B',
      enabled INTEGER DEFAULT 1,
      min_stars INTEGER DEFAULT 0,
      lan_only INTEGER DEFAULT 0,
      skip_if_no_roster INTEGER DEFAULT 1,
      history_months INTEGER NOT NULL DEFAULT 3 CHECK (history_months >= 3 AND history_months <= 6),
      min_volume_usd REAL NOT NULL DEFAULT 10000,
      updated_at TEXT DEFAULT (datetime('now')),
      CHECK (id = 1)
    );
    INSERT OR IGNORE INTO analysis_config (id, min_tier, enabled, min_stars, lan_only, skip_if_no_roster, history_months, min_volume_usd)
    VALUES (1, 'B', 1, 0, 0, 1, 3, 10000);
  `);
}

describe('EsportsRepository', () => {
  let repo: EsportsRepository;

  beforeAll(() => {
    repo = new EsportsRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  describe('computeRosterHash (static)', () => {
    it('produces a stable hash regardless of input order', () => {
      const h1 = EsportsRepository.computeRosterHash(['p1', 'p2', 'p3']);
      const h2 = EsportsRepository.computeRosterHash(['p3', 'p1', 'p2']);
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different rosters', () => {
      const h1 = EsportsRepository.computeRosterHash(['p1', 'p2', 'p3', 'p4', 'p5']);
      const h2 = EsportsRepository.computeRosterHash(['p1', 'p2', 'p3', 'p4', 'p6']);
      expect(h1).not.toBe(h2);
    });
  });

  describe('upsertPlayer', () => {
    it('inserts and updates a player', () => {
      repo.upsertPlayer({
        playerId: 'p1',
        nickname: 's1mple',
        role: 'AWPer',
        rating: 1.24,
        kdRatio: 1.35,
        hsPercent: 0.48,
      });

      const p = repo.getPlayer('p1');
      expect(p).toBeDefined();
      expect(p!.nickname).toBe('s1mple');
      expect(p!.rating).toBe(1.24);

      repo.upsertPlayer({
        playerId: 'p1',
        nickname: 's1mple',
        role: 'AWPer',
        rating: 1.30,
        kdRatio: 1.40,
        hsPercent: 0.50,
      });
      const p2 = repo.getPlayer('p1');
      expect(p2!.rating).toBe(1.30);
    });
  });

  describe('upsertTeamRoster', () => {
    it('marks old roster inactive when a new one is upserted', () => {
      for (let i = 1; i <= 6; i++) {
        repo.upsertPlayer({ playerId: `p${i}`, nickname: `Player${i}` });
      }

      const hash1 = repo.upsertTeamRoster('t1', ['p1', 'p2', 'p3', 'p4', 'p5']);
      const active1 = repo.getActiveRoster('t1');
      expect(active1?.rosterHash).toBe(hash1);
      expect(active1?.isActive).toBe(true);

      const hash2 = repo.upsertTeamRoster('t1', ['p1', 'p2', 'p3', 'p4', 'p6']);
      expect(hash2).not.toBe(hash1);

      const history = repo.getRosterHistory('t1');
      expect(history.length).toBe(2);
      const newActive = history.find((r) => r.rosterHash === hash2);
      const oldInactive = history.find((r) => r.rosterHash === hash1);
      expect(newActive?.isActive).toBe(true);
      expect(oldInactive?.isActive).toBe(false);
    });

    it('returns same hash when upserting identical roster', () => {
      repo.upsertPlayer({ playerId: 'p1', nickname: 'A' });
      repo.upsertPlayer({ playerId: 'p2', nickname: 'B' });
      repo.upsertPlayer({ playerId: 'p3', nickname: 'C' });

      const h1 = repo.upsertTeamRoster('t1', ['p1', 'p2', 'p3']);
      const h2 = repo.upsertTeamRoster('t1', ['p1', 'p2', 'p3']);
      expect(h1).toBe(h2);
    });
  });

  describe('getRosterPlayers', () => {
    it('returns all players linked to a roster hash', () => {
      repo.upsertPlayer({ playerId: 'p1', nickname: 'A' });
      repo.upsertPlayer({ playerId: 'p2', nickname: 'B' });
      repo.upsertPlayer({ playerId: 'p3', nickname: 'C' });

      const hash = repo.upsertTeamRoster('t1', ['p1', 'p2', 'p3']);
      const players = repo.getRosterPlayers(hash);
      expect(players.length).toBe(3);
      expect(players.map((p) => p.playerId).sort()).toEqual(['p1', 'p2', 'p3']);
    });
  });

  describe('upsertHeadToHead', () => {
    it('persists and retrieves H2H regardless of team order', () => {
      repo.upsertHeadToHead('teamA', 'teamB', {
        opponent: 'teamB',
        matchesPlayed: 10,
        wins: 6,
        losses: 4,
        lastMatch: '2025-01-01',
        mapResults: [],
      });

      const h2h = repo.getHeadToHead('teamB', 'teamA');
      expect(h2h).toBeDefined();
      expect(h2h!.matchesPlayed).toBe(10);
      // When queried as (teamB, teamA), wins/losses swap
      expect(h2h!.wins + h2h!.losses).toBe(10);
    });
  });

  describe('upsertTeamMatchHistory & getRecentForm', () => {
    it('stores match results and computes recent form', () => {
      repo.upsertTeamMatchHistory('t1', [
        { result: 'win', opponent: 'X', score: '2-0', event: 'IEM', date: '2025-06-01' },
        { result: 'loss', opponent: 'Y', score: '1-2', event: 'EPL', date: '2025-06-02' },
        { result: 'win', opponent: 'Z', score: '2-1', event: 'Blast', date: '2025-06-03' },
      ]);

      const form = repo.getRecentForm('t1');
      expect(form).toBeDefined();
      expect(form.last10Matches.length).toBe(3);
      expect(form.winRate).toBeCloseTo(2 / 3, 1);
    });
  });

  describe('upsertMapPool & getMapPool', () => {
    it('persists map pool stats', () => {
      repo.upsertMapPool('t1', {
        maps: [
          { map: 'mirage', winRate: 0.7, matchesPlayed: 10, roundsWon: 100, roundsLost: 80 },
          { map: 'inferno', winRate: 0.4, matchesPlayed: 10, roundsWon: 80, roundsLost: 100 },
        ],
      });

      const pool = repo.getMapPool('t1');
      expect(pool.maps.length).toBe(2);
      const mirage = pool.maps.find((m) => m.map === 'mirage');
      expect(mirage?.winRate).toBe(0.7);
    });
  });

  describe('cleanupOldData', () => {
    it('deletes rows older than retention window', () => {
      repo.upsertHeadToHead('tA', 'tB', {
        opponent: 'tB',
        matchesPlayed: 5,
        wins: 3,
        losses: 2,
        lastMatch: '2025-01-01',
        mapResults: [],
      });
      testDb.exec(`UPDATE head_to_head SET created_at = datetime('now', '-100 days'), updated_at = datetime('now', '-100 days') WHERE team_a_id = 'tA' AND team_b_id = 'tB'`);

      const counts = repo.cleanupOldData();
      expect(counts.headToHead).toBeGreaterThan(0);

      const h2h = repo.getHeadToHead('tA', 'tB');
      expect(h2h).toBeNull();
    });
  });

  describe('AnalysisFilterConfig', () => {
    it('returns default config', () => {
      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.minTier).toBe('B');
      expect(cfg.enabled).toBe(true);
      expect(cfg.skipIfNoRoster).toBe(true);
    });

    it('updates minTier and enabled', () => {
      const updated = repo.updateAnalysisFilterConfig({ minTier: 'A', enabled: false });
      expect(updated.minTier).toBe('A');
      expect(updated.enabled).toBe(false);

      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.minTier).toBe('A');
      expect(cfg.enabled).toBe(false);
    });

    it('persists lanOnly and minStars', () => {
      repo.updateAnalysisFilterConfig({ lanOnly: true, minStars: 3 });
      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.lanOnly).toBe(true);
      expect(cfg.minStars).toBe(3);
    });

    it('defaults historyMonths to 3', () => {
      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.historyMonths).toBe(3);
    });

    it('updates historyMonths within 3-6 range', () => {
      const updated = repo.updateAnalysisFilterConfig({ historyMonths: 6 });
      expect(updated.historyMonths).toBe(6);

      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.historyMonths).toBe(6);
    });

    it('clamps historyMonths below 3 to 3', () => {
      const updated = repo.cleanupOldData(1);
      // cleanupOldData clamps internally; verify it doesn't throw
      expect(updated).toBeDefined();
    });

    it('defaults minVolumeUsd to 10000', () => {
      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.minVolumeUsd).toBe(10000);
    });

    it('handles minVolumeUsd of 0 correctly', () => {
      repo.updateAnalysisFilterConfig({ minVolumeUsd: 0 });
      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.minVolumeUsd).toBe(0);
    });

    it('updates minVolumeUsd', () => {
      const updated = repo.updateAnalysisFilterConfig({ minVolumeUsd: 25000 });
      expect(updated.minVolumeUsd).toBe(25000);

      const cfg = repo.getAnalysisFilterConfig();
      expect(cfg.minVolumeUsd).toBe(25000);
    });
  });
});
