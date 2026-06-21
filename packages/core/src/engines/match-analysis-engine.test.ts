import { describe, it, expect } from 'vitest';
import { MatchAnalysisEngine } from './match-analysis-engine';
import type { Team, MatchInfo } from '../types/index';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamId: 'team-1',
    name: 'Team A',
    logo: '',
    rank: 5,
    region: 'EU',
    players: [],
    recentForm: { last10Matches: [], winRate: 0.7, streak: 3, averageRating: 1.1 },
    mapPool: {
      maps: [
        { map: 'Inferno', winRate: 0.75, matchesPlayed: 20, roundsWon: 300, roundsLost: 200 },
        { map: 'Mirage', winRate: 0.6, matchesPlayed: 15, roundsWon: 250, roundsLost: 200 },
        { map: 'Nuke', winRate: 0.5, matchesPlayed: 10, roundsWon: 150, roundsLost: 150 },
        { map: 'Ancient', winRate: 0.8, matchesPlayed: 25, roundsWon: 400, roundsLost: 200 },
        { map: 'Anubis', winRate: 0.4, matchesPlayed: 8, roundsWon: 100, roundsLost: 150 },
        { map: 'Dust2', winRate: 0.55, matchesPlayed: 12, roundsWon: 180, roundsLost: 160 },
        { map: 'Vertigo', winRate: 0.65, matchesPlayed: 18, roundsWon: 280, roundsLost: 200 },
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

describe('MatchAnalysisEngine', () => {
  const engine = new MatchAnalysisEngine();

  describe('analyzeMapPool', () => {
    it('should analyze all 7 competitive maps', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      expect(result.mapAnalyses).toHaveLength(7);
      expect(result.matchId).toBe('match-1');
    });

    it('should identify map advantage correctly', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({
        teamId: 'team-2',
        name: 'Team B',
        mapPool: {
          maps: [
            { map: 'Inferno', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Mirage', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Nuke', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Ancient', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Anubis', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Dust2', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
            { map: 'Vertigo', winRate: 0.3, matchesPlayed: 10, roundsWon: 100, roundsLost: 200 },
          ],
        },
      });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      expect(result.overallAdvantage).toBe('team_a');
      expect(result.advantageScore).toBeGreaterThan(0);
    });

    it('should return neutral for evenly matched teams', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      // Same map pool → should be close to neutral
      expect(result.advantageScore).toBeCloseTo(0, 1);
    });

    it('should calculate confidence based on matches played', () => {
      const teamA = makeTeam({
        mapPool: {
          maps: [
            { map: 'Inferno', winRate: 0.5, matchesPlayed: 2, roundsWon: 20, roundsLost: 20 },
          ],
        },
      });
      const teamB = makeTeam({
        teamId: 'team-2',
        name: 'Team B',
        mapPool: {
          maps: [
            { map: 'Inferno', winRate: 0.5, matchesPlayed: 2, roundsWon: 20, roundsLost: 20 },
          ],
        },
      });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);
      const infernoAnalysis = result.mapAnalyses.find((m) => m.map === 'Inferno')!;

      // Low matches played (2+2=4, 4/20=0.2) → low confidence
      expect(infernoAnalysis.confidence).toBeLessThan(0.5);
    });

    it('should handle teams with missing map stats (default 0.5)', () => {
      const teamA = makeTeam({
        mapPool: { maps: [] },
      });
      const teamB = makeTeam({
        teamId: 'team-2',
        name: 'Team B',
        mapPool: { maps: [] },
      });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      // All maps default to 0.5 → neutral
      expect(result.overallAdvantage).toBe('neutral');
      expect(result.advantageScore).toBe(0);
    });
  });

  describe('simulateVeto', () => {
    it('should simulate BO3 veto with 3 remaining maps', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      expect(result.vetoSimulation.remainingMaps).toHaveLength(1); // decider
      expect(result.vetoSimulation.teamAPick).toBeTruthy();
      expect(result.vetoSimulation.teamBPick).toBeTruthy();
      expect(result.vetoSimulation.decider).toBeTruthy();
    });

    it('should handle BO1 format', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });
      const match = makeMatch({ format: 'BO1' });

      const result = engine.analyzeMapPool(match, teamA, teamB);

      expect(result.vetoSimulation.remainingMaps).toHaveLength(1);
      expect(result.vetoSimulation.teamAPick).toBe(result.vetoSimulation.teamBPick);
      expect(result.vetoSimulation.decider).toBe(result.vetoSimulation.teamAPick);
    });

    it('should have distinct pick and decider maps in BO3', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });
      const match = makeMatch();

      const result = engine.analyzeMapPool(match, teamA, teamB);

      // Team picks should be different from each other
      expect(result.vetoSimulation.teamAPick).not.toBe(result.vetoSimulation.teamBPick);
    });
  });

  describe('compareTeams', () => {
    it('should compare two teams side by side', () => {
      const teamA = makeTeam({ rank: 5, name: 'Team A' });
      const teamB = makeTeam({ teamId: 'team-2', rank: 15, name: 'Team B' });

      const comparison = engine.compareTeams(teamA, teamB);

      expect(comparison.teamA.name).toBe('Team A');
      expect(comparison.teamB.name).toBe('Team B');
      expect(comparison.rankAdvantage).toBe('team_a');
      expect(comparison.teamA.rank).toBe(5);
      expect(comparison.teamB.rank).toBe(15);
    });

    it('should identify form advantage', () => {
      const teamA = makeTeam({ recentForm: { ...makeTeam().recentForm, winRate: 0.8 } });
      const teamB = makeTeam({
        teamId: 'team-2',
        name: 'Team B',
        recentForm: { ...makeTeam().recentForm, winRate: 0.4 },
      });

      const comparison = engine.compareTeams(teamA, teamB);

      expect(comparison.formAdvantage).toBe('team_a');
    });

    it('should find top player by rating', () => {
      const teamA = makeTeam({
        players: [
          { playerId: 'p1', name: 'Star', nickname: 'star1', rating: 1.25, kdRatio: 1.3, headshotPercent: 50, mapsPlayed: 100, role: 'AWPer' },
          { playerId: 'p2', name: 'Avg', nickname: 'avg1', rating: 1.0, kdRatio: 1.0, headshotPercent: 40, mapsPlayed: 80, role: 'Rifler' },
        ],
      });
      const teamB = makeTeam({ teamId: 'team-2', name: 'Team B' });

      const comparison = engine.compareTeams(teamA, teamB);

      expect(comparison.teamA.topPlayer).toBe('star1');
    });
  });
});
