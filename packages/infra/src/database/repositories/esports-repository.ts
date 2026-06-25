import { createHash } from 'crypto';
import { query, queryOne, transaction } from '../connection';
import type { Player, Lineup, LineupPlayer, HeadToHead, RecentForm, MapPool, MapStat, MatchResult, AnalysisFilterConfig } from '@polyrader/core';

/** Legacy retention window in days. Prefer cleanupOldData(months) for month-based cleanup. */
export const RETENTION_DAYS = 90;

export interface RosterSnapshot {
  rosterHash: string;
  teamId: string;
  playerIds: string[];
  playerCount: number;
  isActive: boolean;
  firstSeen: string;
  lastSeen: string;
}

export interface MatchLineupRecord {
  matchId: string;
  teamARosterHash: string;
  teamBRosterHash: string;
  teamAConfirmed: boolean;
  teamBConfirmed: boolean;
  teamAStandinCount: number;
  teamBStandinCount: number;
  rawLineup: string;
}

export interface PlayerRecord {
  playerId: string;
  nickname: string;
  realName?: string;
  role?: string;
  rating?: number;
  kdRatio?: number;
  hsPercent?: number;
  mapsPlayed?: number;
  source?: string;
}

export class EsportsRepository {
  // ─── Roster Hash ──────────────────────────────────────────

  /**
   * Compute a stable hash for a 5-man roster.
   * Player IDs are sorted alphabetically before hashing so the order
   * of players in the source HTML doesn't matter.
   */
  static computeRosterHash(playerIds: string[]): string {
    const sorted = [...playerIds].filter(Boolean).map((id) => id.toLowerCase()).sort();
    return createHash('sha256').update(sorted.join(',')).digest('hex').substring(0, 16);
  }

  // ─── Players ──────────────────────────────────────────────

  upsertPlayer(player: PlayerRecord): void {
    query(
      `INSERT INTO players (player_id, nickname, real_name, role, rating, kd_ratio, hs_percent, maps_played, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(player_id) DO UPDATE SET
         nickname = excluded.nickname,
         real_name = COALESCE(NULLIF(excluded.real_name, ''), players.real_name),
         role = COALESCE(NULLIF(excluded.role, ''), players.role),
         rating = excluded.rating,
         kd_ratio = excluded.kd_ratio,
         hs_percent = excluded.hs_percent,
         maps_played = excluded.maps_played,
         updated_at = datetime('now')`,
      player.playerId,
      player.nickname,
      player.realName ?? '',
      player.role ?? '',
      player.rating ?? 1.0,
      player.kdRatio ?? 1.0,
      player.hsPercent ?? 0,
      player.mapsPlayed ?? 0,
      player.source ?? 'hltv',
    );
  }

  getPlayer(playerId: string): PlayerRecord | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM players WHERE player_id = ?`,
      playerId,
    );
    if (!row) return null;
    return {
      playerId: String(row.player_id),
      nickname: String(row.nickname),
      realName: row.real_name as string | undefined,
      role: row.role as string | undefined,
      rating: row.rating as number | undefined,
      kdRatio: row.kd_ratio as number | undefined,
      hsPercent: row.hs_percent as number | undefined,
      mapsPlayed: row.maps_played as number | undefined,
      source: row.source as string | undefined,
    };
  }

  // ─── Team Rosters ─────────────────────────────────────────

  /**
   * Upsert a roster snapshot for a team.
   * If the roster_hash already exists, just update last_seen.
   * If it's a new hash, insert a new row and mark previous rosters as inactive.
   */
  upsertTeamRoster(teamId: string, playerIds: string[]): string {
    const rosterHash = EsportsRepository.computeRosterHash(playerIds);

    transaction(() => {
      // Check if this roster already exists for this team
      const existing = queryOne<{ roster_hash: string; is_active: number }>(
        `SELECT roster_hash, is_active FROM team_rosters WHERE roster_hash = ? AND team_id = ?`,
        rosterHash, teamId,
      );

      if (existing) {
        // Same roster seen before — refresh last_seen
        query(
          `UPDATE team_rosters SET last_seen = datetime('now'), is_active = 1 WHERE roster_hash = ?`,
          rosterHash,
        );
      } else {
        // New roster — mark all previous rosters for this team as inactive
        query(`UPDATE team_rosters SET is_active = 0 WHERE team_id = ?`, teamId);
        // Insert new active roster
        query(
          `INSERT INTO team_rosters (roster_hash, team_id, player_ids, player_count, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          rosterHash, teamId, JSON.stringify(playerIds), playerIds.length,
        );
        // Link players to roster
        for (const pid of playerIds) {
          query(
            `INSERT OR IGNORE INTO team_roster_players (roster_hash, player_id) VALUES (?, ?)`,
            rosterHash, pid,
          );
        }
      }

      // Update teams.roster_hash to point to current active roster
      query(`UPDATE teams SET roster_hash = ? WHERE team_id = ?`, rosterHash, teamId);
    });

    return rosterHash;
  }

  getActiveRoster(teamId: string): RosterSnapshot | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM team_rosters WHERE team_id = ? AND is_active = 1 ORDER BY last_seen DESC LIMIT 1`,
      teamId,
    );
    if (!row) return null;
    return {
      rosterHash: String(row.roster_hash),
      teamId: String(row.team_id),
      playerIds: JSON.parse(String(row.player_ids ?? '[]')) as string[],
      playerCount: Number(row.player_count) ?? 0,
      isActive: !!row.is_active,
      firstSeen: String(row.first_seen),
      lastSeen: String(row.last_seen),
    };
  }

  getRosterHistory(teamId: string, limit = 10): RosterSnapshot[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM team_rosters WHERE team_id = ? ORDER BY last_seen DESC LIMIT ?`,
      teamId, limit,
    );
    return rows.map((row) => ({
      rosterHash: String(row.roster_hash),
      teamId: String(row.team_id),
      playerIds: JSON.parse(String(row.player_ids ?? '[]')) as string[],
      playerCount: Number(row.player_count) ?? 0,
      isActive: !!row.is_active,
      firstSeen: String(row.first_seen),
      lastSeen: String(row.last_seen),
    }));
  }

  getRosterPlayers(rosterHash: string): Player[] {
    const rows = query<Record<string, unknown>>(
      `SELECT p.* FROM players p
       JOIN team_roster_players trp ON p.player_id = trp.player_id
       WHERE trp.roster_hash = ?`,
      rosterHash,
    );
    return rows.map((row) => ({
      playerId: String(row.player_id),
      name: String(row.real_name ?? ''),
      nickname: String(row.nickname),
      rating: Number(row.rating) || 1.0,
      kdRatio: Number(row.kd_ratio) || 1.0,
      headshotPercent: Number(row.hs_percent) || 0,
      mapsPlayed: Number(row.maps_played) || 0,
      role: String(row.role ?? ''),
    }));
  }

  // ─── Match Lineups ────────────────────────────────────────

  /**
   * Persist a match lineup, creating roster snapshots for both teams.
   * Returns the roster hashes so callers can reference them.
   */
  upsertMatchLineup(
    matchId: string,
    teamAId: string,
    teamBId: string,
    teamALineup: Lineup,
    teamBLineup: Lineup,
  ): { teamAHash: string; teamBHash: string } {
    const teamAPlayerIds = teamALineup.players.map((p) => p.playerId);
    const teamBPlayerIds = teamBLineup.players.map((p) => p.playerId);

    // Upsert all players first
    for (const p of teamALineup.players) {
      this.upsertPlayer({
        playerId: p.playerId,
        nickname: p.nickname,
        role: p.role,
        rating: p.rating,
        source: 'hltv',
      });
    }
    for (const p of teamBLineup.players) {
      this.upsertPlayer({
        playerId: p.playerId,
        nickname: p.nickname,
        role: p.role,
        rating: p.rating,
        source: 'hltv',
      });
    }

    // Create roster snapshots
    const teamAHash = this.upsertTeamRoster(teamAId, teamAPlayerIds);
    const teamBHash = this.upsertTeamRoster(teamBId, teamBPlayerIds);

    transaction(() => {
      // Upsert match_lineups
      query(
        `INSERT INTO match_lineups (match_id, team_a_hash, team_b_hash, team_a_confirmed, team_b_confirmed, team_a_standin_count, team_b_standin_count, raw_lineup, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(match_id) DO UPDATE SET
           team_a_hash = excluded.team_a_hash,
           team_b_hash = excluded.team_b_hash,
           team_a_confirmed = excluded.team_a_confirmed,
           team_b_confirmed = excluded.team_b_confirmed,
           team_a_standin_count = excluded.team_a_standin_count,
           team_b_standin_count = excluded.team_b_standin_count,
           raw_lineup = excluded.raw_lineup`,
        matchId, teamAHash, teamBHash,
        teamALineup.isConfirmed ? 1 : 0,
        teamBLineup.isConfirmed ? 1 : 0,
        teamALineup.standinCount,
        teamBLineup.standinCount,
        JSON.stringify({ teamA: teamALineup, teamB: teamBLineup }),
      );

      // Clear old lineup players for this match
      query(`DELETE FROM match_lineup_players WHERE match_id = ?`, matchId);

      // Insert team A lineup players
      for (const p of teamALineup.players) {
        query(
          `INSERT OR IGNORE INTO match_lineup_players (match_id, team_side, player_id, nickname, role, rating, impact_score, maps_on_record, is_standin)
           VALUES (?, 'A', ?, ?, ?, ?, ?, ?, ?)`,
          matchId, p.playerId, p.nickname, p.role, p.rating,
          p.impactScore, p.mapsOnRecord, p.isStandin ? 1 : 0,
        );
      }
      // Insert team B lineup players
      for (const p of teamBLineup.players) {
        query(
          `INSERT OR IGNORE INTO match_lineup_players (match_id, team_side, player_id, nickname, role, rating, impact_score, maps_on_record, is_standin)
           VALUES (?, 'B', ?, ?, ?, ?, ?, ?, ?)`,
          matchId, p.playerId, p.nickname, p.role, p.rating,
          p.impactScore, p.mapsOnRecord, p.isStandin ? 1 : 0,
        );
      }
    });

    return { teamAHash, teamBHash };
  }

  getMatchLineup(matchId: string): MatchLineupRecord | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM match_lineups WHERE match_id = ?`,
      matchId,
    );
    if (!row) return null;
    return {
      matchId: String(row.match_id),
      teamARosterHash: String(row.team_a_hash ?? ''),
      teamBRosterHash: String(row.team_b_hash ?? ''),
      teamAConfirmed: !!row.team_a_confirmed,
      teamBConfirmed: !!row.team_b_confirmed,
      teamAStandinCount: Number(row.team_a_standin_count) || 0,
      teamBStandinCount: Number(row.team_b_standin_count) || 0,
      rawLineup: String(row.raw_lineup ?? ''),
    };
  }

  getMatchLineupPlayers(matchId: string, teamSide: 'A' | 'B'): LineupPlayer[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM match_lineup_players WHERE match_id = ? AND team_side = ?`,
      matchId, teamSide,
    );
    return rows.map((row) => ({
      playerId: String(row.player_id),
      nickname: String(row.nickname),
      rating: Number(row.rating) || 1.0,
      role: row.role as LineupPlayer['role'],
      isStandin: !!row.is_standin,
      impactScore: Number(row.impact_score) || 0,
      mapsOnRecord: Number(row.maps_on_record) || 0,
    }));
  }

  // ─── Head-to-Head ─────────────────────────────────────────

  upsertHeadToHead(teamAId: string, teamBId: string, h2h: HeadToHead): void {
    // Normalize ordering so (A,B) and (B,A) map to the same row
    const [a, b] = teamAId < teamBId ? [teamAId, teamBId] : [teamBId, teamAId];

    query(
      `INSERT INTO head_to_head (team_a_id, team_b_id, matches_played, team_a_wins, team_b_wins, last_match_date, map_results, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(team_a_id, team_b_id) DO UPDATE SET
         matches_played = excluded.matches_played,
         team_a_wins = excluded.team_a_wins,
         team_b_wins = excluded.team_b_wins,
         last_match_date = excluded.last_match_date,
         map_results = excluded.map_results,
         updated_at = datetime('now')`,
      a, b,
      h2h.matchesPlayed,
      teamAId < teamBId ? h2h.wins : h2h.losses,
      teamAId < teamBId ? h2h.losses : h2h.wins,
      h2h.lastMatch,
      JSON.stringify(h2h.mapResults),
    );
  }

  getHeadToHead(teamAId: string, teamBId: string): HeadToHead | null {
    const [a, b] = teamAId < teamBId ? [teamAId, teamBId] : [teamBId, teamAId];
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM head_to_head WHERE team_a_id = ? AND team_b_id = ?`,
      a, b,
    );
    if (!row) return null;

    const isSwapped = teamAId > teamBId;
    const mapResults = JSON.parse(String(row.map_results ?? '[]')) as HeadToHead['mapResults'];

    return {
      opponent: teamBId,
      matchesPlayed: Number(row.matches_played) || 0,
      wins: Number(isSwapped ? row.team_b_wins : row.team_a_wins) || 0,
      losses: Number(isSwapped ? row.team_a_wins : row.team_b_wins) || 0,
      lastMatch: String(row.last_match_date ?? ''),
      mapResults,
    };
  }

  // ─── Team Match History ───────────────────────────────────

  upsertTeamMatchHistory(teamId: string, results: MatchResult[]): void {
    transaction(() => {
      // Clear old history for this team (we store only recent N)
      query(`DELETE FROM team_match_history WHERE team_id = ?`, teamId);
      for (const r of results.slice(0, 20)) {
        query(
          `INSERT INTO team_match_history (team_id, opponent, result, score, event, match_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
          teamId, r.opponent, r.result, r.score, r.event, r.date,
        );
      }
    });
  }

  getTeamMatchHistory(teamId: string, limit = 10): MatchResult[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM team_match_history WHERE team_id = ? ORDER BY match_date DESC LIMIT ?`,
      teamId, limit,
    );
    return rows.map((row) => ({
      opponent: String(row.opponent),
      result: row.result as MatchResult['result'],
      score: String(row.score ?? ''),
      date: String(row.match_date ?? ''),
      event: String(row.event ?? ''),
    }));
  }

  getRecentForm(teamId: string): RecentForm {
    const history = this.getTeamMatchHistory(teamId, 10);
    const wins = history.filter((m) => m.result === 'win').length;
    let streak = 0;
    for (const m of history) {
      if (m.result === 'win') streak++;
      else break;
    }
    return {
      last10Matches: history,
      winRate: history.length > 0 ? wins / history.length : 0.5,
      streak,
      averageRating: 1.0,
    };
  }

  // ─── Map Pool ─────────────────────────────────────────────

  upsertMapPool(teamId: string, mapPool: MapPool): void {
    transaction(() => {
      for (const m of mapPool.maps) {
        query(
          `INSERT INTO map_pool_stats (team_id, map_name, win_rate, matches_played, rounds_won, rounds_lost, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(team_id, map_name) DO UPDATE SET
             win_rate = excluded.win_rate,
             matches_played = excluded.matches_played,
             rounds_won = excluded.rounds_won,
             rounds_lost = excluded.rounds_lost,
             updated_at = datetime('now')`,
          teamId, m.map, m.winRate, m.matchesPlayed, m.roundsWon, m.roundsLost,
        );
      }
    });
  }

  getMapPool(teamId: string): MapPool {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM map_pool_stats WHERE team_id = ?`,
      teamId,
    );
    const maps: MapStat[] = rows.map((row) => ({
      map: String(row.map_name),
      winRate: Number(row.win_rate) || 0.5,
      matchesPlayed: Number(row.matches_played) || 0,
      roundsWon: Number(row.rounds_won) || 0,
      roundsLost: Number(row.rounds_lost) || 0,
    }));
    return { maps };
  }

  // ─── Retention: configurable month-based cleanup ───────────────────────────

  /**
   * Delete all esports data older than the configured history window.
   * Called by the daily cron job to bound database growth.
   *
   * @param months  History window in months (default 3, range 3-6).
   *                Data older than this is purged.
   * Returns counts of deleted rows per table.
   */
  cleanupOldData(months = 3): {
    matchLineups: number;
    matchLineupPlayers: number;
    headToHead: number;
    teamMatchHistory: number;
    teamRosters: number;
    oldMatches: number;
  } {
    // Clamp to allowed range
    const clampedMonths = Math.max(3, Math.min(6, months));
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - clampedMonths);
    const cutoff = cutoffDate.toISOString();
    const counts = { matchLineups: 0, matchLineupPlayers: 0, headToHead: 0, teamMatchHistory: 0, teamRosters: 0, oldMatches: 0 };

    transaction(() => {
      // Old match lineups
      const mlIds = query<{ match_id: string }>(
        `SELECT match_id FROM match_lineups WHERE created_at < ?`,
        cutoff,
      );
      counts.matchLineups = mlIds.length;
      for (const { match_id } of mlIds) {
        query(`DELETE FROM match_lineup_players WHERE match_id = ?`, match_id);
        query(`DELETE FROM match_lineups WHERE match_id = ?`, match_id);
      }

      // Old H2H
      const h2hResult = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM head_to_head WHERE created_at < ? AND updated_at < ?`,
        cutoff, cutoff,
      );
      counts.headToHead = Number(h2hResult?.count || 0);
      query(
        `DELETE FROM head_to_head WHERE created_at < ? AND updated_at < ?`,
        cutoff, cutoff,
      );

      // Old team match history
      const tmhResult = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM team_match_history WHERE created_at < ?`,
        cutoff,
      );
      counts.teamMatchHistory = Number(tmhResult?.count || 0);
      query(`DELETE FROM team_match_history WHERE created_at < ?`, cutoff);

      // Inactive rosters older than retention
      const trResult = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM team_rosters WHERE is_active = 0 AND last_seen < ?`,
        cutoff,
      );
      counts.teamRosters = Number(trResult?.count || 0);
      query(`DELETE FROM team_rosters WHERE is_active = 0 AND last_seen < ?`, cutoff);

      // Old finished matches (keep scheduled/upcoming regardless of age)
      const matchResult = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM matches WHERE status IN ('finished', 'settled', 'cancelled') AND updated_at < ?`,
        cutoff,
      );
      counts.oldMatches = Number(matchResult?.count || 0);
      query(
        `DELETE FROM matches WHERE status IN ('finished', 'settled', 'cancelled') AND updated_at < ?`,
        cutoff,
      );
    });

    return counts;
  }

  // ─── Analysis Filter Config ───────────────────────────────

  getAnalysisFilterConfig(): AnalysisFilterConfig {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM analysis_config WHERE id = 1`,
    );
    return {
      minTier: (row?.min_tier as AnalysisFilterConfig['minTier']) ?? 'B',
      enabled: !!row?.enabled,
      minStars: Number(row?.min_stars) ?? 0,
      lanOnly: !!row?.lan_only,
      skipIfNoRoster: row?.skip_if_no_roster == null ? true : !!row.skip_if_no_roster,
      historyMonths: Number(row?.history_months) || 3,
      minVolumeUsd: row?.min_volume_usd != null ? Number(row.min_volume_usd) : 10000,
      updatedAt: String(row?.updated_at ?? new Date().toISOString()),
    };
  }

  updateAnalysisFilterConfig(config: Partial<Omit<AnalysisFilterConfig, 'updatedAt'>>): AnalysisFilterConfig {
    const current = this.getAnalysisFilterConfig();
    const merged = {
      minTier: config.minTier ?? current.minTier,
      enabled: config.enabled ?? current.enabled,
      minStars: config.minStars ?? current.minStars,
      lanOnly: config.lanOnly ?? current.lanOnly,
      skipIfNoRoster: config.skipIfNoRoster ?? current.skipIfNoRoster,
      historyMonths: config.historyMonths ?? current.historyMonths,
      minVolumeUsd: config.minVolumeUsd ?? current.minVolumeUsd,
    };

    query(
      `UPDATE analysis_config SET
         min_tier = ?,
         enabled = ?,
         min_stars = ?,
         lan_only = ?,
         skip_if_no_roster = ?,
         history_months = ?,
         min_volume_usd = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
      merged.minTier,
      merged.enabled ? 1 : 0,
      merged.minStars,
      merged.lanOnly ? 1 : 0,
      merged.skipIfNoRoster ? 1 : 0,
      merged.historyMonths,
      merged.minVolumeUsd,
    );

    return this.getAnalysisFilterConfig();
  }
}
