import { describe, it, expect } from 'vitest';
import { PromptEngine, selectWeightedVariant } from './prompt-engine';
import type { Team, MatchInfo, Lineup, PromptVariant } from '../types/index';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamId: 'team-1',
    name: 'Natus Vincere',
    logo: '',
    rank: 3,
    region: 'EU',
    players: [
      { playerId: 'p1', name: 's1mple', nickname: 's1mple', rating: 1.25, kdRatio: 1.3, headshotPercent: 45, mapsPlayed: 100, role: 'AWPer' },
      { playerId: 'p2', name: 'b1t', nickname: 'b1t', rating: 1.15, kdRatio: 1.2, headshotPercent: 55, mapsPlayed: 90, role: 'Rifler' },
      { playerId: 'p3', name: 'Aleksib', nickname: 'Aleksib', rating: 1.0, kdRatio: 0.95, headshotPercent: 35, mapsPlayed: 85, role: 'IGL' },
    ],
    recentForm: { last10Matches: [], winRate: 0.8, streak: 5, averageRating: 1.13 },
    mapPool: {
      maps: [
        { map: 'Inferno', winRate: 0.75, matchesPlayed: 20, roundsWon: 300, roundsLost: 200 },
        { map: 'Mirage', winRate: 0.6, matchesPlayed: 15, roundsWon: 250, roundsLost: 200 },
      ],
    },
    headToHead: [
      { opponent: 'team-2', matchesPlayed: 10, wins: 7, losses: 3, lastMatch: '2025-05-15', mapResults: [] },
    ],
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchInfo> = {}): MatchInfo {
  return {
    matchId: 'match-1',
    teamA: { teamId: 'team-1', name: 'Natus Vincere', logo: '', rank: 3, region: 'EU' },
    teamB: { teamId: 'team-2', name: 'FaZe Clan', logo: '', rank: 5, region: 'EU' },
    eventName: 'IEM Katowice 2025',
    eventType: 'LAN',
    format: 'BO3',
    scheduledAt: '2025-06-20T12:00:00Z',
    status: 'scheduled',
    maps: ['Inferno', 'Mirage', 'Nuke'],
    ...overrides,
  };
}

function makeLineup(overrides: Partial<Lineup> = {}): Lineup {
  return {
    players: [
      { playerId: 'p1', nickname: 's1mple', rating: 1.25, role: 'AWPer', isStandin: false, impactScore: 95, mapsOnRecord: 100 },
      { playerId: 'p2', nickname: 'b1t', rating: 1.15, role: 'Rifler', isStandin: false, impactScore: 85, mapsOnRecord: 90 },
      { playerId: 'p3', nickname: 'Aleksib', rating: 1.0, role: 'IGL', isStandin: false, impactScore: 75, mapsOnRecord: 85 },
      { playerId: 'p4', nickname: 'iM', rating: 1.05, role: 'Rifler', isStandin: false, impactScore: 70, mapsOnRecord: 60 },
      { playerId: 'p5', nickname: 'jL', rating: 1.1, role: 'Entry', isStandin: false, impactScore: 80, mapsOnRecord: 55 },
    ],
    isConfirmed: true,
    hasStandin: false,
    standinCount: 0,
    missingKeyPlayers: [],
    ...overrides,
  };
}

describe('PromptEngine', () => {
  const engine = new PromptEngine();

  describe('buildPrompt', () => {
    it('should return system, context, and outputSchema', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.system).toBeTruthy();
      expect(prompt.context).toBeTruthy();
      expect(prompt.outputSchema).toBeTruthy();
    });

    it('should include team names in context', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('Natus Vincere');
      expect(prompt.context).toContain('FaZe Clan');
    });

    it('should include HLTV rank in context', () => {
      const teamA = makeTeam({ rank: 3 });
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan', rank: 5 });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('#3');
      expect(prompt.context).toContain('#5');
    });

    it('should include map pool data', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('Inferno');
      expect(prompt.context).toContain('Mirage');
      expect(prompt.context).toContain('75%');
      expect(prompt.context).toContain('60%');
    });

    it('should include market odds when provided', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB, marketProbA: 0.55 });

      expect(prompt.context).toContain('Market Odds');
      expect(prompt.context).toContain('55.0%');
      expect(prompt.context).toContain('45.0%');
    });

    it('should not include market odds section when not provided', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).not.toContain('Market Odds');
    });

    it('should include lineup data when available', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch({
        lineups: {
          teamA: makeLineup(),
          teamB: makeLineup({ players: [] }),
        },
      });

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('Starting Lineup');
      expect(prompt.context).toContain('s1mple');
      expect(prompt.context).toContain('AWPer');
    });

    it('should warn about standins in lineup', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch({
        lineups: {
          teamA: makeLineup({ hasStandin: true, standinCount: 1 }),
          teamB: makeLineup({ players: [] }),
        },
      });

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('HAS STANDIN');
    });

    it('should warn about missing key players', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch({
        lineups: {
          teamA: makeLineup({ missingKeyPlayers: ['s1mple'] }),
          teamB: makeLineup({ players: [] }),
        },
      });

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('MISSING KEY PLAYERS');
      expect(prompt.context).toContain('s1mple');
    });

    it('should include head-to-head history', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('Head-to-Head');
      expect(prompt.context).toContain('7-3');
    });

    it('should handle no head-to-head history', () => {
      const teamA = makeTeam({ headToHead: [] });
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('No previous matchups');
    });

    it('should include event info', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = engine.buildPrompt({ match, teamA, teamB });

      expect(prompt.context).toContain('IEM Katowice 2025');
      expect(prompt.context).toContain('LAN');
      expect(prompt.context).toContain('BO3');
    });
  });

  describe('buildMessages', () => {
    it('should return system and user messages', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const messages = engine.buildMessages({ match, teamA, teamB });

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('should include output schema in system message', () => {
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const messages = engine.buildMessages({ match, teamA, teamB });

      expect(messages[0].content).toContain('winProbability');
      expect(messages[0].content).toContain('confidence');
    });
  });

  describe('parseResponse', () => {
    const tokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

    it('should parse JSON code block response', () => {
      const response = '```json\n{"winProbability":{"teamA":0.6,"teamB":0.4},"confidence":0.8,"reasoning":"test","keyFactors":["rank"],"riskAssessment":"low"}\n```';

      const result = engine.parseResponse('openai', 'gpt-4o', response, 500, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.6);
      expect(result.winProbability.teamB).toBe(0.4);
      expect(result.confidence).toBe(0.8);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.latency).toBe(500);
      expect(result.keyFactors).toEqual(['rank']);
    });

    it('should parse plain JSON response', () => {
      const response = '{"winProbability":{"teamA":0.55,"teamB":0.45},"confidence":0.7,"reasoning":"close match","keyFactors":["form"],"riskAssessment":"medium"}';

      const result = engine.parseResponse('anthropic', 'claude-3.5', response, 300, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.55);
      expect(result.winProbability.teamB).toBe(0.45);
      expect(result.confidence).toBe(0.7);
    });

    it('should handle missing fields with defaults', () => {
      const response = '{"winProbability":{"teamA":0.5}}';

      const result = engine.parseResponse('google', 'gemini-2.0', response, 200, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.5);
      expect(result.winProbability.teamB).toBe(0.5);
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle malformed JSON gracefully', () => {
      const response = 'not valid json at all';

      const result = engine.parseResponse('openai', 'gpt-4o', response, 100, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.5);
      expect(result.winProbability.teamB).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should handle empty response', () => {
      const result = engine.parseResponse('openai', 'gpt-4o', '', 100, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.5);
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should parse JSON without code fence markers', () => {
      const response = 'Here is my analysis:\n{"winProbability":{"teamA":0.7,"teamB":0.3},"confidence":0.9,"reasoning":"clear favorite","keyFactors":["rank","form"],"riskAssessment":"low"}';

      const result = engine.parseResponse('deepseek', 'deepseek-v3', response, 400, tokenUsage);

      expect(result.winProbability.teamA).toBe(0.7);
      expect(result.winProbability.teamB).toBe(0.3);
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('custom prompts', () => {
    it('should use custom system prompt when provided', () => {
      const customEngine = new PromptEngine('Custom system prompt');
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = customEngine.buildPrompt({ match, teamA, teamB });

      expect(prompt.system).toBe('Custom system prompt');
    });

    it('should use custom output schema when provided', () => {
      const customEngine = new PromptEngine(undefined, '{"custom": "schema"}');
      const teamA = makeTeam();
      const teamB = makeTeam({ teamId: 'team-2', name: 'FaZe Clan' });
      const match = makeMatch();

      const prompt = customEngine.buildPrompt({ match, teamA, teamB });

      expect(prompt.outputSchema).toBe('{"custom": "schema"}');
    });
  });

  describe('selectWeightedVariant', () => {
    function makeVariant(overrides: Partial<PromptVariant>): PromptVariant {
      return {
        variantId: 'v1',
        name: 'Variant 1',
        systemPrompt: 'test prompt',
        isEnabled: true,
        trafficWeight: 1.0,
        isControl: false,
        notes: '',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
        ...overrides,
      };
    }

    it('should return null for empty array', () => {
      expect(selectWeightedVariant([])).toBeNull();
    });

    it('should return the single variant when only one', () => {
      const v = makeVariant({ variantId: 'solo' });
      expect(selectWeightedVariant([v])).toBe(v);
    });

    it('should distribute selections according to weights', () => {
      const v1 = makeVariant({ variantId: 'a', trafficWeight: 0.9 });
      const v2 = makeVariant({ variantId: 'b', trafficWeight: 0.1 });
      const counts = { a: 0, b: 0 };
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const selected = selectWeightedVariant([v1, v2]);
        if (selected?.variantId === 'a') counts.a++;
        else counts.b++;
      }

      const aRatio = counts.a / iterations;
      // Expect ~90% for variant a, with tolerance
      expect(aRatio).toBeGreaterThan(0.85);
      expect(aRatio).toBeLessThan(0.95);
    });

    it('should handle zero weights by falling back to first variant', () => {
      const v1 = makeVariant({ variantId: 'a', trafficWeight: 0 });
      const v2 = makeVariant({ variantId: 'b', trafficWeight: 0 });
      const selected = selectWeightedVariant([v1, v2]);
      expect(selected?.variantId).toBe('a');
    });

    it('should handle NaN weights gracefully', () => {
      const v1 = makeVariant({ variantId: 'a', trafficWeight: NaN });
      const v2 = makeVariant({ variantId: 'b', trafficWeight: 0.5 });
      // v1 has NaN weight (treated as 0), so v2 should always be selected
      const selected = selectWeightedVariant([v1, v2]);
      expect(selected?.variantId).toBe('b');
    });

    it('should handle negative weights by treating them as zero', () => {
      const v1 = makeVariant({ variantId: 'a', trafficWeight: -1 });
      const v2 = makeVariant({ variantId: 'b', trafficWeight: 1 });
      const selected = selectWeightedVariant([v1, v2]);
      expect(selected?.variantId).toBe('b');
    });

    it('should handle three-way weighted selection', () => {
      const v1 = makeVariant({ variantId: 'a', trafficWeight: 0.5 });
      const v2 = makeVariant({ variantId: 'b', trafficWeight: 0.3 });
      const v3 = makeVariant({ variantId: 'c', trafficWeight: 0.2 });
      const counts = { a: 0, b: 0, c: 0 };
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const selected = selectWeightedVariant([v1, v2, v3]);
        if (selected?.variantId === 'a') counts.a++;
        else if (selected?.variantId === 'b') counts.b++;
        else counts.c++;
      }

      // Each should be within reasonable tolerance of expected ratios
      expect(counts.a / iterations).toBeGreaterThan(0.45);
      expect(counts.b / iterations).toBeGreaterThan(0.25);
      expect(counts.c / iterations).toBeGreaterThan(0.15);
    });
  });
});
