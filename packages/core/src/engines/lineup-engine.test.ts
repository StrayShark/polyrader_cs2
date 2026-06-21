import { describe, it, expect } from 'vitest';
import { LineupEngine } from './lineup-engine';
import type { Lineup, LineupPlayer } from '../types/index';

function makePlayer(overrides: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    playerId: 'p1',
    nickname: 'player1',
    rating: 1.10,
    role: 'Rifler',
    isStandin: false,
    impactScore: 80,
    mapsOnRecord: 100,
    ...overrides,
  };
}

function makeLineup(players: LineupPlayer[], overrides: Partial<Lineup> = {}): Lineup {
  return {
    players,
    isConfirmed: true,
    hasStandin: players.some((p) => p.isStandin),
    standinCount: players.filter((p) => p.isStandin).length,
    missingKeyPlayers: [],
    ...overrides,
  };
}

describe('LineupEngine', () => {
  const engine = new LineupEngine();

  it('should give higher score to lineup with better ratings', () => {
    const lineupA = makeLineup([
      makePlayer({ nickname: 'star1', rating: 1.20, role: 'AWPer', impactScore: 90 }),
      makePlayer({ nickname: 'star2', rating: 1.15, role: 'Rifler', impactScore: 85 }),
      makePlayer({ nickname: 'star3', rating: 1.10, role: 'Entry', impactScore: 80 }),
      makePlayer({ nickname: 'star4', rating: 1.05, role: 'Support', impactScore: 70 }),
      makePlayer({ nickname: 'star5', rating: 1.00, role: 'IGL', impactScore: 75 }),
    ]);

    const lineupB = makeLineup([
      makePlayer({ nickname: 'avg1', rating: 1.00, role: 'AWPer', impactScore: 70 }),
      makePlayer({ nickname: 'avg2', rating: 0.95, role: 'Rifler', impactScore: 65 }),
      makePlayer({ nickname: 'avg3', rating: 0.90, role: 'Entry', impactScore: 60 }),
      makePlayer({ nickname: 'avg4', rating: 0.95, role: 'Support', impactScore: 60 }),
      makePlayer({ nickname: 'avg5', rating: 0.90, role: 'IGL', impactScore: 65 }),
    ]);

    const score = engine.calculateLineupFactor(lineupA, lineupB);
    expect(score).toBeGreaterThan(0.5);
  });

  it('should penalize lineups with standins', () => {
    const fullLineup = makeLineup([
      makePlayer({ nickname: 'main1', rating: 1.10, role: 'AWPer', impactScore: 80 }),
      makePlayer({ nickname: 'main2', rating: 1.05, role: 'Rifler', impactScore: 75 }),
      makePlayer({ nickname: 'main3', rating: 1.00, role: 'Entry', impactScore: 70 }),
      makePlayer({ nickname: 'main4', rating: 1.00, role: 'Support', impactScore: 70 }),
      makePlayer({ nickname: 'main5', rating: 0.95, role: 'IGL', impactScore: 70 }),
    ]);

    const standinLineup = makeLineup([
      makePlayer({ nickname: 'main1', rating: 1.10, role: 'AWPer', impactScore: 80 }),
      makePlayer({ nickname: 'main2', rating: 1.05, role: 'Rifler', impactScore: 75 }),
      makePlayer({ nickname: 'main3', rating: 1.00, role: 'Entry', impactScore: 70 }),
      makePlayer({ nickname: 'main4', rating: 1.00, role: 'Support', impactScore: 70 }),
      makePlayer({ nickname: 'sub1', rating: 0.85, role: 'IGL', isStandin: true, impactScore: 40, mapsOnRecord: 5 }),
    ]);

    const score = engine.calculateLineupFactor(fullLineup, standinLineup);
    // Full lineup should be favored
    expect(score).toBeGreaterThan(0.5);
  });

  it('should detect missing key roles', () => {
    const lineup = makeLineup([
      makePlayer({ nickname: 'p1', rating: 1.10, role: 'Rifler' }),
      makePlayer({ nickname: 'p2', rating: 1.05, role: 'Rifler' }),
      makePlayer({ nickname: 'p3', rating: 1.00, role: 'Entry' }),
      makePlayer({ nickname: 'p4', rating: 1.00, role: 'Support' }),
      makePlayer({ nickname: 'p5', rating: 0.95, role: 'Lurker' }),
    ]);

    const strength = engine.evaluateLineup(lineup);
    // Missing AWPer and IGL
    expect(strength.missingKeyRoles).toContain('AWPer');
    expect(strength.missingKeyRoles).toContain('IGL');
    expect(strength.roleCompleteness).toBeLessThan(1);
  });

  it('should return neutral for empty lineups', () => {
    const emptyA: Lineup = { players: [], isConfirmed: false, hasStandin: false, standinCount: 0, missingKeyPlayers: [] };
    const emptyB: Lineup = { players: [], isConfirmed: false, hasStandin: false, standinCount: 0, missingKeyPlayers: [] };

    const score = engine.calculateLineupFactor(emptyA, emptyB);
    expect(score).toBe(0.5);
  });

  it('should produce lineup analysis with key absences', () => {
    const lineupA = makeLineup([
      makePlayer({ nickname: 's1mple', rating: 1.25, role: 'AWPer', impactScore: 90 }),
      makePlayer({ nickname: 'elec', rating: 1.15, role: 'Rifler', impactScore: 85 }),
      makePlayer({ nickname: 'b1t', rating: 1.10, role: 'Entry', impactScore: 80 }),
      makePlayer({ nickname: 'perf', rating: 1.05, role: 'Support', impactScore: 70 }),
      makePlayer({ nickname: 'igl', rating: 0.95, role: 'IGL', impactScore: 75 }),
    ]);

    const lineupB = makeLineup([
      makePlayer({ nickname: 'zywoo', rating: 1.20, role: 'AWPer', impactScore: 88 }),
      makePlayer({ nickname: 'apex', rating: 0.90, role: 'IGL', impactScore: 70 }),
      makePlayer({ nickname: 'standin1', rating: 0.85, role: 'Rifler', isStandin: true, impactScore: 40, mapsOnRecord: 5 }),
      makePlayer({ nickname: 'mezii', rating: 1.00, role: 'Support', impactScore: 65 }),
      makePlayer({ nickname: 'flameZ', rating: 1.05, role: 'Entry', impactScore: 75 }),
    ]);

    const analysis = engine.compareLineups(lineupA, lineupB);
    expect(analysis.advantage).toBe('team_a');
    expect(analysis.keyAbsences.length).toBeGreaterThan(0);
  });
});
