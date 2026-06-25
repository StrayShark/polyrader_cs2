/**
 * CS API client — fetches CS2 pro match data from api.csapi.de
 *
 * Free, no API key required, JSON REST API.
 * Data refreshed daily by the provider.
 *
 * Used as the primary data source; HLTV crawler is the fallback for
 * real-time / upcoming matches that CS API (daily refresh) cannot cover.
 *
 * Docs: https://csapi.de/
 */

import type { Team, Player, RecentForm, MapPool, MapStat, HeadToHead, MatchResult } from '@polyrader/core';
import { classifyEventTier, type EventTier } from '@polyrader/core';

const CSAPI_BASE = 'https://api.csapi.de';

// ---------------------------------------------------------------------------
// Raw API response types (provider schema)
// ---------------------------------------------------------------------------

interface RawMatch {
  id: number;
  team1: { id: number; name: string; score: number; rank: number | null };
  team2: { id: number; name: string; score: number; rank: number | null };
  date: string;          // "2026-06-22"
  event: string;
  maps?: Array<{ id: number; name: string; team1_score: number; team2_score: number }>;
  best_of?: number;
  winner?: { id: number; name: string };
}

interface RawTeam {
  id: number;
  name: string;
  rank?: number;
  streak?: number;
  roster?: Array<{
    id: number;
    name: string;
    country?: string;
    rating?: number;
    maps_played?: number;
  }>;
  players?: Array<{  // fallback field name
    id: number;
    name: string;
    country?: string;
    rating?: number;
    maps_played?: number;
  }>;
}

export interface RawPlayerStats {
  id: number;
  name: string;
  rating?: number;
  kills_per_round?: number;
  deaths_per_round?: number;
  headshot_pct?: number;
  maps_played?: number;
}

// ---------------------------------------------------------------------------
// Public types (compatible with existing crawler interfaces)
// ---------------------------------------------------------------------------

export interface CsApiMatchSummary {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamARank: number;
  teamBRank: number;
  event: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  date: string;            // ISO string
  stars: number;           // derived from tier
  tier: EventTier;
  scoreA: number;
  scoreB: number;
  winnerName: string | null;
  maps: string[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CsApiClient {
  private cache = new Map<string, { data: unknown; expiry: number }>();
  private readonly cacheTtlMs: number;

  constructor(cacheTtlMs = 10 * 60 * 1000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Get recent matches (finished + may include upcoming depending on provider).
   * CS API is daily-refresh, so this returns recently completed matches.
   *
   * @param limit  Max number of matches to return
   * @param historyMonths  Only return matches within this many months (default 3)
   */
  async getMatches(limit = 50, historyMonths = 3): Promise<CsApiMatchSummary[]> {
    const fetchLimit = Math.min(limit * 5, 500); // over-fetch then filter by date
    const data = await this.fetch<RawMatch[]>('/matches/latest', { limit: String(fetchLimit) });
    const mapped = data.map((m) => this.mapMatch(m));

    // Filter by history window
    const cutoff = this.monthsAgo(historyMonths);
    const filtered = mapped.filter((m) => {
      if (!m.date) return true; // keep matches with unknown date
      return new Date(m.date) >= cutoff;
    });

    return filtered.slice(0, limit);
  }

  /**
   * Get all matches with pagination, filtered by history window.
   */
  async getAllMatches(limit = 100, offset = 0, historyMonths = 3): Promise<CsApiMatchSummary[]> {
    const data = await this.fetch<RawMatch[]>('/matches/', {
      limit: String(Math.min(limit, 500)),
      offset: String(offset),
    });
    const mapped = data.map((m) => this.mapMatch(m));
    const cutoff = this.monthsAgo(historyMonths);
    return mapped.filter((m) => !m.date || new Date(m.date) >= cutoff);
  }

  /** Compute a date N months ago */
  private monthsAgo(months: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
  }

  /**
   * Get a specific match by ID (includes maps and scores).
   */
  async getMatch(matchId: string): Promise<CsApiMatchSummary | null> {
    try {
      const data = await this.fetch<RawMatch>(`/matches/${matchId}`);
      return this.mapMatch(data);
    } catch {
      return null;
    }
  }

  /**
   * Get player stats for a match (optionally per-map).
   */
  async getMatchPlayerStats(matchId: string, byMap = false): Promise<RawPlayerStats[]> {
    try {
      const data = await this.fetch<RawPlayerStats[]>(`/matches/${matchId}/stats`, { by_map: String(byMap) });
      return data;
    } catch {
      return [];
    }
  }

  /**
   * Get team info including roster.
   */
  async getTeam(teamId: string): Promise<Team | null> {
    try {
      const data = await this.fetch<RawTeam>(`/teams/${teamId}`);
      return this.mapTeam(data);
    } catch {
      return null;
    }
  }

  /**
   * Search teams by name. Returns matching teams with IDs and ranks.
   */
  async searchTeams(name: string): Promise<Array<{ teamId: string; name: string; rank: number }>> {
    try {
      const data = await this.fetch<RawTeam[]>('/teams', { search: name, limit: '10' });
      return data.map((t) => ({
        teamId: String(t.id),
        name: t.name,
        rank: t.rank ?? 999,
      }));
    } catch {
      // Fallback: derive from recent matches (search up to 500)
      const matches = await this.getMatches(100);
      const moreMatches = await this.getAllMatches(400, 100);
      const allMatches = [...matches, ...moreMatches];
      const lower = name.toLowerCase();
      const results: Array<{ teamId: string; name: string; rank: number }> = [];
      const seen = new Set<string>();
      for (const m of allMatches) {
        if (m.teamAName.toLowerCase().includes(lower) && !seen.has(m.teamAId)) {
          results.push({ teamId: m.teamAId, name: m.teamAName, rank: m.teamARank });
          seen.add(m.teamAId);
        }
        if (m.teamBName.toLowerCase().includes(lower) && !seen.has(m.teamBId)) {
          results.push({ teamId: m.teamBId, name: m.teamBName, rank: m.teamBRank });
          seen.add(m.teamBId);
        }
      }
      return results;
    }
  }

  /**
   * Get world rankings (derived from /matches/latest team rank fields).
   * Returns teams sorted by rank.
   *
   * @param historyMonths  Months of match history to consider (default 3)
   */
  async getRankings(historyMonths = 3): Promise<Array<{ rank: number; teamId: string; name: string }>> {
    const matches = await this.getMatches(100, historyMonths);
    const teamMap = new Map<string, { rank: number; name: string }>();

    for (const m of matches) {
      if (m.teamARank > 0) teamMap.set(m.teamAId, { rank: m.teamARank, name: m.teamAName });
      if (m.teamBRank > 0) teamMap.set(m.teamBId, { rank: m.teamBRank, name: m.teamBName });
    }

    return Array.from(teamMap.entries())
      .map(([teamId, info]) => ({ teamId, ...info }))
      .sort((a, b) => a.rank - b.rank);
  }

  /**
   * Build a HeadToHead from recent match results between two teams.
   * CS API doesn't have a dedicated H2H endpoint, so we derive it from match history.
   *
   * @param historyMonths  Months of match history to consider (default 3)
   */
  async getHeadToHead(teamAId: string, teamBId: string, historyMonths = 3): Promise<HeadToHead> {
    try {
      const matches = await this.getMatches(100, historyMonths);
      const h2hMatches = matches.filter(
        (m) =>
          (m.teamAId === teamAId && m.teamBId === teamBId) ||
          (m.teamAId === teamBId && m.teamBId === teamAId),
      );

      let wins = 0;
      let losses = 0;
      let lastMatch = '';
      const mapResults: Array<{ map: string; teamAWins: number; teamBWins: number }> = [];

      for (const m of h2hMatches) {
        const aIsTeamA = m.teamAId === teamAId;
        const winnerIsA = m.winnerName === m.teamAName;

        if ((aIsTeamA && winnerIsA) || (!aIsTeamA && m.winnerName === m.teamBName)) wins++;
        else if (m.winnerName) losses++;

        if (!lastMatch && m.date) lastMatch = m.date;

        // Collect map results
        for (const mapName of m.maps) {
          const existing = mapResults.find((r) => r.map === mapName);
          if (existing) {
            if ((aIsTeamA && winnerIsA) || (!aIsTeamA && m.winnerName === m.teamBName)) existing.teamAWins++;
            else existing.teamBWins++;
          } else {
            mapResults.push({
              map: mapName,
              teamAWins: (aIsTeamA && winnerIsA) || (!aIsTeamA && m.winnerName === m.teamBName) ? 1 : 0,
              teamBWins: (aIsTeamA && !winnerIsA) || (!aIsTeamA && m.winnerName === m.teamAName) ? 1 : 0,
            });
          }
        }
      }

      return {
        opponent: teamBId,
        matchesPlayed: wins + losses,
        wins,
        losses,
        lastMatch,
        mapResults: mapResults.map((m) => ({
          map: m.map,
          result: (m.teamAWins > m.teamBWins ? 'win' : 'loss') as 'win' | 'loss',
          score: `${m.teamAWins}-${m.teamBWins}`,
        })),
      };
    } catch {
      return {
        opponent: teamBId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lastMatch: '',
        mapResults: [],
      };
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, CSAPI_BASE);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }

    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'PolyRader-CS2/0.2' },
    }).catch((err) => {
      const cause = err instanceof Error ? err.cause : undefined;
      throw new Error(`CS API fetch failed: ${err instanceof Error ? err.message : String(err)}${cause ? ` (cause: ${cause instanceof Error ? cause.message : String(cause)})` : ''}`);
    });

    if (!response.ok) {
      throw new Error(`CS API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheTtlMs });
    return data;
  }

  private mapMatch(m: RawMatch): CsApiMatchSummary {
    const bo = m.best_of ?? 3;
    const format: CsApiMatchSummary['format'] = bo >= 5 ? 'BO5' : bo === 1 ? 'BO1' : 'BO3';
    const eventType: 'LAN' | 'Online' = m.event?.toLowerCase().includes('online') ? 'Online' : 'LAN';
    const maps = (m.maps ?? []).map((mp) => mp.name);
    const tier = classifyEventTier({
      eventName: m.event,
      eventType,
      stars: 0,
      prizePool: 0,
    });

    return {
      matchId: String(m.id),
      teamAId: String(m.team1.id),
      teamBId: String(m.team2.id),
      teamAName: m.team1.name,
      teamBName: m.team2.name,
      teamARank: m.team1.rank ?? 999,
      teamBRank: m.team2.rank ?? 999,
      event: m.event,
      eventType,
      format,
      date: m.date ? new Date(m.date).toISOString() : '',
      stars: tier === 'S' ? 5 : tier === 'A' ? 4 : tier === 'B' ? 2 : 1,
      tier,
      scoreA: m.team1.score,
      scoreB: m.team2.score,
      winnerName: m.winner?.name ?? null,
      maps,
    };
  }

  private mapTeam(t: RawTeam): Team {
    const rawPlayers = t.roster ?? t.players ?? [];
    const players: Player[] = rawPlayers.map((p) => ({
      playerId: String(p.id),
      name: p.name,
      nickname: p.name,
      rating: p.rating ?? 1.0,
      kdRatio: 1.0,
      headshotPercent: 0,
      mapsPlayed: p.maps_played ?? 0,
      role: '',
    }));

    // Derive recent form from streak (positive = win streak, negative = loss streak)
    const streak = t.streak ?? 0;
    const streakAbs = Math.abs(streak);
    const last10: MatchResult[] = [];
    for (let i = 0; i < Math.min(streakAbs, 10); i++) {
      last10.push({
        opponent: 'Unknown',
        result: streak > 0 ? 'win' : 'loss',
        score: '',
        date: '',
        event: '',
      });
    }
    const winRate = streak > 0 ? Math.min(0.5 + streakAbs * 0.05, 0.9) : streak < 0 ? Math.max(0.5 - streakAbs * 0.05, 0.1) : 0.5;
    const recentForm: RecentForm = {
      last10Matches: last10,
      winRate,
      streak,
      averageRating: 1.0,
    };
    const mapPool: MapPool = { maps: [] as MapStat[] };
    const headToHead: HeadToHead[] = [];

    return {
      teamId: String(t.id),
      name: t.name,
      logo: '',
      rank: t.rank ?? 999,
      region: '',
      players,
      recentForm,
      mapPool,
      headToHead,
    };
  }
}
