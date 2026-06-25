/**
 * Esports data enricher.
 *
 * Given a Polymarket CS2 market, this module:
 *   1. Parses the market question to extract team names, event, format
 *   2. Matches team names to CS API / HLTV team IDs (fuzzy matching)
 *   3. Fetches team roster (5-man + substitutes), map pool, player stats, H2H
 *   4. Persists everything to the database via EsportsRepository + LLMRepository
 *
 * Data flow:
 *   Polymarket market question
 *     → parsePolymarketMatch()
 *     → matchTeam() (name → teamId via CS API search + DB lookup)
 *     → enrichTeam() (CS API roster + HLTV stats + map pool)
 *     → enrichHeadToHead()
 *     → DB persistence (teams, players, team_rosters, head_to_head)
 */

import type { Market, Team, Player, HeadToHead } from '@polyrader/core';
import { parsePolymarketMatch, type ParsedPolymarketMatch } from './match-parser.js';

// ---------------------------------------------------------------------------
// Team name matching
// ---------------------------------------------------------------------------

/**
 * Normalize a team name for fuzzy matching.
 * Lowercase, remove common suffixes/prefixes, strip accents.
 */
export function normalizeTeamName(name: string): string {
  let n = name.toLowerCase().trim();
  // Remove common organizational suffixes
  n = n.replace(/\s+(esports|gaming|gg|ec)\b/g, '');
  // Remove "FC " prefix (e.g. "FC Famalicão" → "famalicão")
  n = n.replace(/^fc\s+/g, '');
  // Strip accents
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove non-alphanumeric
  n = n.replace(/[^a-z0-9]/g, '');
  return n;
}

/**
 * Calculate similarity score between two team names (0-1).
 * Uses normalized Levenshtein distance.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  // Check if one is a substring of the other
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer;
  }

  // Levenshtein distance
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Enrichment result
// ---------------------------------------------------------------------------

export interface EnrichedMatch {
  /** Polymarket market */
  market: Market;
  /** Parsed match info */
  parsed: ParsedPolymarketMatch;
  /** Team A enrichment result */
  teamA: EnrichedTeam | null;
  /** Team B enrichment result */
  teamB: EnrichedTeam | null;
  /** Head-to-head record */
  headToHead: HeadToHead | null;
  /** Enrichment warnings (e.g. team not found, data incomplete) */
  warnings: string[];
}

export interface EnrichedTeam {
  teamId: string;
  name: string;
  rank: number;
  region: string;
  players: Player[];
  rosterHash: string;
  recentForm: unknown;
  mapPool: unknown;
  /** Source of the data: 'cs_api' | 'hltv' | 'db' */
  source: string;
  /** Match confidence (0-1) of name → teamId matching */
  matchConfidence: number;
}

// ---------------------------------------------------------------------------
// Enricher
// ---------------------------------------------------------------------------

export interface EnricherSources {
  /** Get team by ID from GRID (official data, priority 1) */
  getTeamFromGrid(teamId: string): Promise<Team | null>;
  /** Search teams by name from GRID */
  searchTeamsGrid(name: string): Promise<Array<{ teamId: string; name: string; rank: number }>>;
  /** Get team roster from GRID */
  getRosterFromGrid(teamId: string, historyMonths?: number): Promise<Array<{ playerId: string; nickname: string; name: string }>>;
  /** Get H2H from GRID */
  getH2HFromGrid(teamAId: string, teamBId: string, historyMonths?: number): Promise<HeadToHead>;
  /** Get team by ID from CS API (priority 2) */
  getTeamFromCsApi(teamId: string): Promise<Team | null>;
  /** Search teams by name from CS API */
  searchTeamsCsApi(name: string): Promise<Array<{ teamId: string; name: string; rank: number }>>;
  /** Get team by ID from HLTV (fallback, priority 3) */
  getTeamFromHltv(teamId: string): Promise<Team | null>;
  /** Get H2H from CS API */
  getH2HFromCsApi(teamAId: string, teamBId: string, historyMonths?: number): Promise<HeadToHead>;
  /** Get H2H from HLTV */
  getH2HFromHltv(teamAId: string, teamBId: string): Promise<HeadToHead>;
  /** Lookup team in DB by normalized name */
  lookupTeamInDb(name: string): { teamId: string; name: string; rank: number } | null;
  /** Get all known teams from DB for matching */
  getAllTeamsFromDb(): Array<{ teamId: string; name: string; rank: number }>;
  /** Upsert team to DB */
  upsertTeam(team: Team): void;
  /** Upsert player to DB */
  upsertPlayer(player: Player, source: string): void;
  /** Upsert roster hash */
  upsertRoster(teamId: string, playerIds: string[]): string;
  /** Upsert H2H to DB */
  upsertH2H(teamAId: string, teamBId: string, h2h: HeadToHead): void;
}

export class EsportsEnricher {
  /** Minimum similarity threshold for fuzzy matching */
  private readonly matchThreshold: number;

  constructor(matchThreshold = 0.6) {
    this.matchThreshold = matchThreshold;
  }

  /**
   * Enrich a Polymarket market with esports data.
   *
   * @param historyMonths  Months of match history to fetch for H2H (default 3, range 3-6)
   */
  async enrich(market: Market, sources: EnricherSources, historyMonths = 3): Promise<EnrichedMatch> {
    const parsed = parsePolymarketMatch(market.question);
    const warnings: string[] = [];

    if (!parsed) {
      return {
        market,
        parsed: {
          question: market.question,
          teamAName: '',
          teamBName: '',
          format: null,
          eventName: 'Unknown',
          eventStage: null,
          mapNumber: null,
          isMapMarket: false,
        },
        teamA: null,
        teamB: null,
        headToHead: null,
        warnings: ['Failed to parse market question as CS2 match'],
      };
    }

    // Match teams
    const teamA = await this.matchAndEnrichTeam(parsed.teamAName, sources, warnings, historyMonths);
    const teamB = await this.matchAndEnrichTeam(parsed.teamBName, sources, warnings, historyMonths);

    // Fetch H2H if both teams matched
    let headToHead: HeadToHead | null = null;
    if (teamA && teamB) {
      try {
        // Priority 1: GRID H2H
        headToHead = await sources.getH2HFromGrid(teamA.teamId, teamB.teamId, historyMonths);
        if (headToHead.matchesPlayed === 0) {
          // Priority 2: CS API H2H
          headToHead = await sources.getH2HFromCsApi(teamA.teamId, teamB.teamId, historyMonths);
        }
        if (headToHead.matchesPlayed === 0) {
          // Priority 3: HLTV H2H
          headToHead = await sources.getH2HFromHltv(teamA.teamId, teamB.teamId);
        }
        sources.upsertH2H(teamA.teamId, teamB.teamId, headToHead);
      } catch {
        // H2H is best-effort
      }
    }

    return {
      market,
      parsed,
      teamA,
      teamB,
      headToHead,
      warnings,
    };
  }

  /**
   * Match a team name to a teamId, then enrich with roster/map/player data.
   * Tries DB first, then CS API search for teams not in DB or with stub data.
   */
  private async matchAndEnrichTeam(
    teamName: string,
    sources: EnricherSources,
    warnings: string[],
    historyMonths = 3,
  ): Promise<EnrichedTeam | null> {
    // Step 1: Match team name → teamId
    // Priority: DB → GRID search → CS API search
    let match = this.matchTeamName(teamName, sources);

    // If DB match is a stub (rank=999 = no real data), try GRID first, then CS API
    if (!match || match.rank >= 999) {
      // When the DB match is a stub, treat its confidence as 0 so external
      // sources (GRID/CS API) can override it with a real match.
      const effectiveConfidence = match && match.rank >= 999 ? 0 : (match?.confidence ?? 0);

      // Try GRID (official data source, priority 1)
      try {
        const gridResults = await sources.searchTeamsGrid(teamName);
        for (const r of gridResults) {
          const sim = nameSimilarity(teamName, r.name);
          if (sim >= this.matchThreshold && sim > effectiveConfidence) {
            match = { ...r, confidence: sim };
          }
        }
      } catch { /* GRID search is best-effort */ }

      // If still no match or still a stub, try CS API (priority 2)
      if (!match || match.rank >= 999) {
        const eff2 = match && match.rank >= 999 ? 0 : (match?.confidence ?? 0);
        try {
          const csResults = await sources.searchTeamsCsApi(teamName);
          for (const r of csResults) {
            const sim = nameSimilarity(teamName, r.name);
            if (sim >= this.matchThreshold && sim > eff2) {
              match = { ...r, confidence: sim };
            }
          }
        } catch { /* CS API search is best-effort */ }
      }
    }

    if (!match) {
      warnings.push(`Team "${teamName}" not found in GRID, CS API, or DB`);
      return null;
    }

    // Step 2: Enrich — try GRID first, then CS API, then HLTV (fallback)
    let team: Team | null = null;
    let source = 'db';

    // Priority 1: GRID (official data)
    try {
      team = await sources.getTeamFromGrid(match.teamId);
      if (team) {
        // GRID doesn't have roster directly; fetch from series
        const roster = await sources.getRosterFromGrid(match.teamId, historyMonths);
        if (roster.length > 0 && team.players.length === 0) {
          team.players = roster.map((r) => ({
            playerId: r.playerId,
            name: r.name,
            nickname: r.nickname,
            rating: 1,
            kdRatio: 1,
            headshotPercent: 0,
            mapsPlayed: 0,
            role: '',
          }));
        }
        source = 'grid';
      }
    } catch { /* try CS API next */ }

    // Priority 2: CS API
    if (!team) {
      try {
        team = await sources.getTeamFromCsApi(match.teamId);
        if (team) source = 'cs_api';
      } catch { /* try HLTV next */ }
    }

    // Priority 3: HLTV (fallback)
    if (!team) {
      try {
        team = await sources.getTeamFromHltv(match.teamId);
        if (team) source = 'hltv';
      } catch { /* ignore */ }
    }

    if (!team) {
      // Use DB data as fallback
      warnings.push(`No detailed data for "${teamName}" (teamId=${match.teamId}), using DB stub`);
      return {
        teamId: match.teamId,
        name: match.name,
        rank: match.rank,
        region: '',
        players: [],
        rosterHash: '',
        recentForm: {},
        mapPool: {},
        source: 'db',
        matchConfidence: match.confidence,
      };
    }

    // Step 3: Persist to DB
    sources.upsertTeam(team);

    // Persist players
    for (const player of team.players) {
      sources.upsertPlayer(player, source);
    }

    // Compute and persist roster hash
    const playerIds = team.players.map((p) => p.playerId);
    const rosterHash = playerIds.length > 0
      ? sources.upsertRoster(team.teamId, playerIds)
      : '';

    return {
      teamId: team.teamId,
      name: team.name,
      rank: team.rank,
      region: team.region,
      players: team.players,
      rosterHash,
      recentForm: team.recentForm,
      mapPool: team.mapPool,
      source,
      matchConfidence: match.confidence,
    };
  }

  /**
   * Match a Polymarket team name to a teamId.
   * Strategy: DB lookup (exact + fuzzy) → CS API search → fuzzy match
   */
  private matchTeamName(
    name: string,
    sources: EnricherSources,
  ): { teamId: string; name: string; rank: number; confidence: number } | null {
    // 1. Exact DB lookup (normalized)
    const dbExact = sources.lookupTeamInDb(name);
    if (dbExact) {
      return { ...dbExact, confidence: 1.0 };
    }

    // 2. Fuzzy match against all DB teams
    const allTeams = sources.getAllTeamsFromDb();
    let bestMatch: { teamId: string; name: string; rank: number; confidence: number } | null = null;
    for (const t of allTeams) {
      const sim = nameSimilarity(name, t.name);
      if (sim >= this.matchThreshold && (!bestMatch || sim > bestMatch.confidence)) {
        bestMatch = { ...t, confidence: sim };
      }
    }
    if (bestMatch) return bestMatch;

    // 3. CS API search would be async — but matching is sync for DB
    //    CS API search is handled in matchAndEnrichTeam via getTeamFromCsApi
    return null;
  }

  /**
   * Async team matching that also tries CS API search.
   */
  async matchTeamNameAsync(
    name: string,
    sources: EnricherSources,
  ): Promise<{ teamId: string; name: string; rank: number; confidence: number } | null> {
    // Try sync match first (DB)
    const syncMatch = this.matchTeamName(name, sources);
    if (syncMatch) return syncMatch;

    // Try CS API search
    try {
      const csResults = await sources.searchTeamsCsApi(name);
      for (const r of csResults) {
        const sim = nameSimilarity(name, r.name);
        if (sim >= this.matchThreshold) {
          return { ...r, confidence: sim };
        }
      }
    } catch { /* ignore */ }

    return null;
  }
}
