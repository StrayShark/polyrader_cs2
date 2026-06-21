import type { Team, MatchInfo } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';
import { logger } from '../utils/logger';

/**
 * Map a legacy DB match status to the new 7-state MatchInfo status.
 * - 'live' / 'finished' / 'settled' / 'delayed' / 'cancelled' pass through
 * - 'upcoming' (or unknown) → 'scheduled', or 'pre_match' if within 1h of start
 */
export function mapLegacyMatchStatus(dbStatus: string, scheduledAt: string): MatchInfo['status'] {
  if (dbStatus === 'live') return 'live';
  if (dbStatus === 'finished') return 'finished';
  if (dbStatus === 'settled') return 'settled';
  if (dbStatus === 'delayed') return 'delayed';
  if (dbStatus === 'cancelled') return 'cancelled';
  // legacy 'upcoming' or unknown → derive from timing
  const start = new Date(scheduledAt).getTime();
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  if (!Number.isNaN(start) && now >= start - oneHourMs && now < start) {
    return 'pre_match';
  }
  return 'scheduled';
}

/**
 * Shared helpers for building MatchInfo and Team objects from DB rows.
 * Extracted from signal-service.ts, daily-service.ts, and ai-config-service.ts
 * to eliminate code duplication.
 */

let sharedRepo: LLMRepository | null = null;

function getRepo(): LLMRepository {
  if (!sharedRepo) sharedRepo = new LLMRepository();
  return sharedRepo;
}

/**
 * Build a MatchInfo object from a raw DB match row.
 */
export function buildMatchInfo(dbMatch: Record<string, unknown>): MatchInfo {
  return {
    matchId: String(dbMatch.match_id ?? ''),
    teamA: { teamId: String(dbMatch.team_a_id ?? ''), name: String(dbMatch.team_a_name ?? ''), rank: 0, logo: '', region: '' },
    teamB: { teamId: String(dbMatch.team_b_id ?? ''), name: String(dbMatch.team_b_name ?? ''), rank: 0, logo: '', region: '' },
    eventName: String(dbMatch.event_name ?? ''),
    eventType: (String(dbMatch.event_type ?? 'Online')) as 'LAN' | 'Online',
    format: (String(dbMatch.format ?? 'BO3')) as 'BO1' | 'BO3' | 'BO5',
    scheduledAt: String(dbMatch.scheduled_at ?? new Date().toISOString()),
    status: mapLegacyMatchStatus(String(dbMatch.status ?? 'upcoming'), String(dbMatch.scheduled_at ?? new Date().toISOString())),
  };
}

/**
 * Build a placeholder MatchInfo when no DB data is available.
 */
export function buildFallbackMatchInfo(matchId: string): MatchInfo {
  return {
    matchId,
    teamA: { teamId: 'team-a', name: 'Team A', rank: 10, logo: '', region: '' },
    teamB: { teamId: 'team-b', name: 'Team B', rank: 20, logo: '', region: '' },
    eventName: '',
    eventType: 'Online',
    format: 'BO3',
    scheduledAt: new Date().toISOString(),
    status: 'scheduled',
  };
}

/**
 * Load a Team from the database by teamId, with fallback on failure.
 */
export function loadTeamFromDb(teamId: string): Team {
  try {
    const row = getRepo().getTeam(teamId);
    if (!row) return buildFallbackTeam(teamId, teamId, 0, 0.5);

    return {
      teamId: String(row.team_id ?? teamId),
      name: String(row.name ?? teamId),
      rank: Number(row.rank ?? 0),
      region: String(row.region ?? ''),
      logo: '',
      players: typeof row.players === 'string' ? JSON.parse(row.players) : [],
      recentForm: typeof row.recent_form === 'string'
        ? JSON.parse(row.recent_form)
        : { last10Matches: [], winRate: 0.5, streak: 0, averageRating: 1.0 },
      mapPool: typeof row.map_pool === 'string' ? JSON.parse(row.map_pool) : { maps: [] },
      headToHead: [],
    };
  } catch (err) {
    logger.warn('Failed to load team from DB', { error: (err as Error).message });
    return buildFallbackTeam(teamId, teamId, 0, 0.5);
  }
}

/**
 * Build a placeholder Team when no DB data is available.
 */
export function buildFallbackTeam(
  teamId: string,
  name: string,
  rank: number,
  winRate: number,
): Team {
  return {
    teamId,
    name,
    rank,
    region: '',
    logo: '',
    players: [],
    recentForm: { last10Matches: [], winRate, streak: 0, averageRating: 1.0 },
    mapPool: { maps: [] },
    headToHead: [],
  };
}

/**
 * Parse a JSON field from a DB row that may be stored as a string or object.
 */
export function parseJsonField(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  if (typeof val === 'object' && val !== null) {
    return val;
  }
  return null;
}
