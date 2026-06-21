import { describe, it, expect } from 'vitest';
import { PredictionEngine } from './prediction-engine';
import type { Team, MatchInfo } from '../types/index';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamId: 'team-1',
    name: 'Team A',
    logo: '',
    rank: 5,
    region: 'EU',
    players: [
      { playerId: 'p1', name: 'Player 1', nickname: 'p1', rating: 1.15, kdRatio: 1.2, headshotPercent: 45, mapsPlayed: 100, role: 'AWPer' },
      { playerId: 'p2', name: 'Player 2', nickname: 'p2', rating: 1.05, kdRatio: 1.1, headshotPercent: 40, mapsPlayed: 90, role: 'Rifler' },
    ],
    recentForm: {
      last10Matches: [],
      winRate: 0.7,
      streak: 3,
      averageRating: 1.1,
    },
    mapPool: {
      maps: [
        { map: 'Inferno', winRate: 0.75, matchesPlayed: 20, roundsWon: 300, roundsLost: 200 },
        { map: 'Mirage', winRate: 0.6, matchesPlayed: 15, roundsWon: 250, roundsLost: 200 },
      ],
    },
    headToHead: [],
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchInfo> = {}): MatchInfo {
  return {
    matchId: 'match-1',
    teamA: { teamId: 'team-1', name: 'Team A', logo: '', rank: 5, region: 'EU' },
    teamB: { teamId: 'team-2', name: 'Team B', logo: '', rank: 15, region: 'NA' },
    eventName: 'IEM Katowice 2025',
    eventType: 'LAN',
    format: 'BO3',
    scheduledAt: '2025-06-20T12:00:00Z',
    status: 'scheduled',
    maps: ['Inferno', 'Mirage', 'Nuke'],
    ...overrides,
  };
}

describe('PredictionEngine', () => {
  const engine = new PredictionEngine();

  it('should predict higher probability for higher-ranked team', () => {
    const teamA = makeTeam({ rank: 5, name: 'Team A' });
    const teamB = makeTeam({ teamId: 'team-2', rank: 50, name: 'Team B' });
    const match = makeMatch();

    const result = engine.predict(match, teamA, teamB);

    expect(result.winProbability.teamA).toBeGreaterThan(0.5);
    expect(result.winProbability.teamB).toBeLessThan(0.5);
    expect(result.winProbability.teamA + result.winProbability.teamB).toBeCloseTo(1, 4);
  });

  it('should return ~0.5 for evenly matched teams', () => {
    const teamA = makeTeam({ rank: 10, name: 'Team A' });
    const teamB = makeTeam({ teamId: 'team-2', rank: 10, name: 'Team B', recentForm: { ...teamA.recentForm } });
    const match = makeMatch();

    const result = engine.predict(match, teamA, teamB);

    expect(result.winProbability.teamA).toBeCloseTo(0.5, 1);
  });

  it('should include all 6 factors in breakdown', () => {
    const teamA = makeTeam();
    const teamB = makeTeam({ teamId: 'team-2' });
    const match = makeMatch();

    const result = engine.predict(match, teamA, teamB);

    expect(result.factors.hltvRank).toBeDefined();
    expect(result.factors.recentForm).toBeDefined();
    expect(result.factors.lineup).toBeDefined();
    expect(result.factors.mapPool).toBeDefined();
    expect(result.factors.headToHead).toBeDefined();
    expect(result.factors.marketSentiment).toBeDefined();
  });

  it('should use lineup data when provided', () => {
    const teamA = makeTeam({ rank: 5, name: 'Team A' });
    const teamB = makeTeam({ teamId: 'team-2', rank: 5, name: 'Team B' });
    const match = makeMatch({
      lineups: {
        teamA: {
          players: [
            { playerId: 's1', nickname: 's1mple', rating: 1.25, role: 'AWPer', isStandin: false, impactScore: 90, mapsOnRecord: 200 },
            { playerId: 'e1', nickname: 'electronic', rating: 1.15, role: 'Rifler', isStandin: false, impactScore: 85, mapsOnRecord: 180 },
            { playerId: 'b1', nickname: 'b1t', rating: 1.10, role: 'Entry', isStandin: false, impactScore: 80, mapsOnRecord: 150 },
            { playerId: 'p1', nickname: 'perfecto', rating: 1.05, role: 'Support', isStandin: false, impactScore: 70, mapsOnRecord: 160 },
            { playerId: 'i1', nickname: 'igl_player', rating: 0.95, role: 'IGL', isStandin: false, impactScore: 75, mapsOnRecord: 200 },
          ],
          isConfirmed: true,
          hasStandin: false,
          standinCount: 0,
          missingKeyPlayers: [],
        },
        teamB: {
          players: [
            { playerId: 'z1', nickname: 'zywoo', rating: 1.20, role: 'AWPer', isStandin: false, impactScore: 88, mapsOnRecord: 150 },
            { playerId: 'a1', nickname: 'apex', rating: 0.90, role: 'IGL', isStandin: false, impactScore: 70, mapsOnRecord: 200 },
            { playerId: 'sub1', nickname: 'standin_player', rating: 0.85, role: 'Rifler', isStandin: true, impactScore: 40, mapsOnRecord: 5 },
            { playerId: 'm1', nickname: 'mezii', rating: 1.00, role: 'Support', isStandin: false, impactScore: 65, mapsOnRecord: 80 },
            { playerId: 'f1', nickname: 'flameZ', rating: 1.05, role: 'Entry', isStandin: false, impactScore: 75, mapsOnRecord: 100 },
          ],
          isConfirmed: true,
          hasStandin: true,
          standinCount: 1,
          missingKeyPlayers: ['Spinx'],
        },
      },
    });

    const result = engine.predict(match, teamA, teamB);

    // Team A has better lineup (higher ratings, no standins)
    expect(result.factors.lineup.teamA).toBeGreaterThan(0.5);
    expect(result.lineupAnalysis).toBeDefined();
    expect(result.lineupAnalysis!.advantage).toBe('team_a');
  });

  it('should handle missing lineup data gracefully', () => {
    const teamA = makeTeam();
    const teamB = makeTeam({ teamId: 'team-2' });
    const match = makeMatch(); // no lineups

    const result = engine.predict(match, teamA, teamB);

    // Lineup factor should be neutral
    expect(result.factors.lineup.rawScore).toBe(0.5);
    expect(result.factors.lineup.confidence).toBe(0.1);
    expect(result.lineupAnalysis).toBeUndefined();
  });

  it('should recommend skip when confidence is low', () => {
    const teamA = makeTeam({ rank: 10, recentForm: { ...makeTeam().recentForm, winRate: 0.5, streak: 0 } });
    const teamB = makeTeam({ teamId: 'team-2', rank: 11, recentForm: { ...makeTeam().recentForm, winRate: 0.5, streak: 0 } });
    const match = makeMatch();

    const result = engine.predict(match, teamA, teamB, 0.5);

    expect(result.confidence).toBeLessThan(0.6);
  });

  it('should use market sentiment when provided', () => {
    const teamA = makeTeam();
    const teamB = makeTeam({ teamId: 'team-2' });
    const match = makeMatch();

    const withoutMarket = engine.predict(match, teamA, teamB);
    const withMarket = engine.predict(match, teamA, teamB, 0.8);

    expect(withMarket.winProbability.teamA).not.toEqual(withoutMarket.winProbability.teamA);
  });
});
