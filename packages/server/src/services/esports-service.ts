import type { Team, MatchInfo } from '@polyrader/core';
import { HLTVCrawler, LLMRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';
import { mapLegacyMatchStatus } from './match-helpers';

interface EventSummary {
  matchId: string;
  teamA: string;
  teamB: string;
  event: string;
  format: string;
  date: string;
}

interface RankingEntry {
  rank: number;
  teamId: string;
  name: string;
}

export class EsportsService {
  private hltvCrawler = new HLTVCrawler();
  private llmRepo = new LLMRepository();

  async getEvents(): Promise<EventSummary[]> {
    const cacheKey = 'esports:events';
    const cached = await cacheGet<EventSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const summaries = await this.hltvCrawler.getMatches();
      const matches = summaries.map((s) => ({
        matchId: s.matchId,
        teamA: s.teamAName,
        teamB: s.teamBName,
        event: s.event,
        format: s.format,
        date: s.date,
      }));
      await cacheSet(cacheKey, matches, 300);
      return matches;
    } catch (err) {
      logger.warn('Failed to fetch esports events', { error: (err as Error).message });
      return [];
    }
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const cacheKey = `esports:team:${teamId}`;
    const cached = await cacheGet<Team>(cacheKey);
    if (cached) return cached;

    try {
      const team = await this.hltvCrawler.getTeam(teamId);
      await cacheSet(cacheKey, team, 600);
      return team;
    } catch (err) {
      logger.warn('Failed to fetch team from HLTV', { error: (err as Error).message });
      return null;
    }
  }

  async getRankings(): Promise<RankingEntry[]> {
    const cacheKey = 'esports:rankings';
    const cached = await cacheGet<RankingEntry[]>(cacheKey);
    if (cached) return cached;

    try {
      const rankings = await this.hltvCrawler.getRankings();
      await cacheSet(cacheKey, rankings, 600);
      return rankings;
    } catch (err) {
      logger.warn('Failed to fetch rankings from HLTV', { error: (err as Error).message });
      return [];
    }
  }

  async getMatch(matchId: string): Promise<MatchInfo | null> {
    const cacheKey = `esports:match:${matchId}`;
    const cached = await cacheGet<MatchInfo>(cacheKey);
    if (cached) return cached;

    try {
      // Try DB first
      const dbMatch = this.llmRepo.getMatch(matchId);
      if (dbMatch) {
        const match: MatchInfo = {
          matchId: String(dbMatch.match_id ?? matchId),
          teamA: { teamId: String(dbMatch.team_a_id ?? ''), name: String(dbMatch.team_a_name ?? ''), rank: 0, logo: '', region: '' },
          teamB: { teamId: String(dbMatch.team_b_id ?? ''), name: String(dbMatch.team_b_name ?? ''), rank: 0, logo: '', region: '' },
          eventName: String(dbMatch.event_name ?? ''),
          format: (String(dbMatch.format ?? 'BO3')) as 'BO1' | 'BO3' | 'BO5',
          scheduledAt: String(dbMatch.scheduled_at ?? new Date().toISOString()),
          eventType: (String(dbMatch.event_type ?? 'Online')) as 'LAN' | 'Online',
          status: mapLegacyMatchStatus(String(dbMatch.status ?? 'upcoming'), String(dbMatch.scheduled_at ?? new Date().toISOString())),
          maps: Array.isArray(dbMatch.maps) ? dbMatch.maps as string[] : [],
          lineups: typeof dbMatch.lineups === 'string' ? JSON.parse(dbMatch.lineups) : undefined,
        };
        await cacheSet(cacheKey, match, 300);
        return match;
      }

      // Fallback: fetch from HLTV
      const detail = await this.hltvCrawler.getMatchDetail(matchId);
      const match: MatchInfo = {
        matchId,
        teamA: { teamId: '', name: '', rank: 0, logo: '', region: '' },
        teamB: { teamId: '', name: '', rank: 0, logo: '', region: '' },
        eventName: '',
        eventType: 'Online',
        format: 'BO3',
        scheduledAt: new Date().toISOString(),
        status: 'scheduled',
        maps: detail.maps,
      };
      await cacheSet(cacheKey, match, 300);
      return match;
    } catch (err) {
      logger.warn('Failed to fetch match info', { error: (err as Error).message });
      return null;
    }
  }

  async getMapPool(): Promise<Array<{ map: string; teamAPct: number; teamBPct: number }>> {
    const cacheKey = 'esports:map-pool';
    const cached = await cacheGet<Array<{ map: string; teamAPct: number; teamBPct: number }>>(cacheKey);
    if (cached) return cached;

    try {
      // Load top 2 teams' map pools from DB
      const teams = this.llmRepo.getTopTeams(2);
      if (teams.length < 2) {
        // Fallback: return default CS2 map pool
        const defaultMaps = ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];
        return defaultMaps.map((map) => ({ map, teamAPct: 50, teamBPct: 50 }));
      }

      const teamAData = this.parseTeamMapPool(teams[0]);
      const teamBData = this.parseTeamMapPool(teams[1]);

      const allMaps = ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];
      const result = allMaps.map((map) => {
        const aPct = teamAData[map] ?? 50;
        const bPct = teamBData[map] ?? 50;
        return { map, teamAPct: aPct, teamBPct: bPct };
      });

      await cacheSet(cacheKey, result, 600);
      return result;
    } catch (err) {
      logger.warn('Failed to load map pool', { error: (err as Error).message });
      return [];
    }
  }

  private parseTeamMapPool(teamRow: Record<string, unknown>): Record<string, number> {
    try {
      const mapPool = teamRow.map_pool;
      if (typeof mapPool === 'string') {
        const parsed = JSON.parse(mapPool);
        if (parsed && typeof parsed === 'object' && parsed.maps) {
          return parsed.maps as Record<string, number>;
        }
      }
      if (typeof mapPool === 'object' && mapPool !== null) {
        const mp = mapPool as Record<string, unknown>;
        if (mp.maps) return mp.maps as Record<string, number>;
      }
    } catch (err) { logger.warn('Failed to parse team map pool', { error: (err as Error).message }); }
    return {};
  }
}
