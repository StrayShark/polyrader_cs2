import type { Lineup, LineupPlayer, LineupStrength, LineupAnalysis, KeyAbsence, PlayerRole } from '../types/index';
import { LINEUP_WEIGHTS, STANDIN_PENALTY_PER_PLAYER, ROLE_IMPORTANCE } from '../scoring/weights';

/**
 * LineupEngine — Evaluates match lineups independently from team identity.
 *
 * Same team, different lineup = different strength. This engine:
 *   1. Calculates composite strength from player ratings
 *   2. Detects standins and applies penalties
 *   3. Evaluates role completeness (AWPer, IGL, etc.)
 *   4. Measures synergy based on maps played together
 *   5. Identifies critical player absences
 */
export class LineupEngine {
  private weights = LINEUP_WEIGHTS;

  /**
   * Evaluate a single lineup's strength.
   */
  evaluateLineup(lineup: Lineup): LineupStrength {
    const players = lineup.players;

    if (players.length === 0) {
      return {
        totalRating: 0,
        averageRating: 0,
        impactScore: 0,
        synergyScore: 0,
        standinPenalty: 0,
        roleCompleteness: 0,
        missingKeyRoles: ['AWPer', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'],
      };
    }

    const totalRating = players.reduce((s, p) => s + p.rating, 0);
    const averageRating = totalRating / players.length;
    const impactScore = this.calculateImpactScore(players);
    const synergyScore = this.calculateSynergyScore(players, lineup);
    const standinPenalty = this.calculateStandinPenalty(lineup);
    const { roleCompleteness, missingKeyRoles } = this.evaluateRoles(players);

    return {
      totalRating: Math.round(totalRating * 100) / 100,
      averageRating: Math.round(averageRating * 100) / 100,
      impactScore: Math.round(impactScore),
      synergyScore: Math.round(synergyScore),
      standinPenalty: Math.round(standinPenalty),
      roleCompleteness: Math.round(roleCompleteness * 100) / 100,
      missingKeyRoles,
    };
  }

  /**
   * Compare two lineups and produce analysis.
   */
  compareLineups(lineupA: Lineup, lineupB: Lineup): LineupAnalysis {
    const teamA = this.evaluateLineup(lineupA);
    const teamB = this.evaluateLineup(lineupB);

    const keyAbsences = this.detectKeyAbsences(lineupA, lineupB);

    // Determine advantage
    const scoreA = this.compositeScore(teamA);
    const scoreB = this.compositeScore(teamB);
    const diff = scoreA - scoreB;

    let advantage: 'team_a' | 'team_b' | 'neutral';
    if (diff > 5) advantage = 'team_a';
    else if (diff < -5) advantage = 'team_b';
    else advantage = 'neutral';

    return { teamA, teamB, advantage, keyAbsences };
  }

  /**
   * Calculate a single 0-1 factor score for the prediction engine.
   * Returns the probability that team A wins based on lineup alone.
   */
  calculateLineupFactor(lineupA: Lineup, lineupB: Lineup): number {
    const strengthA = this.evaluateLineup(lineupA);
    const strengthB = this.evaluateLineup(lineupB);

    const scoreA = this.compositeScore(strengthA);
    const scoreB = this.compositeScore(strengthB);

    // Normalize to 0-1
    const total = scoreA + scoreB;
    if (total === 0) return 0.5;
    return scoreA / total;
  }

  /**
   * Composite score from all lineup dimensions.
   */
  private compositeScore(s: LineupStrength): number {
    return (
      s.averageRating * 20 * this.weights.averageRating +
      s.impactScore * this.weights.impactScore +
      s.synergyScore * this.weights.synergyScore +
      s.roleCompleteness * 100 * this.weights.roleCompleteness -
      s.standinPenalty * this.weights.standinPenalty
    );
  }

  /**
   * Impact score based on player ratings and roles.
   * Star players (high rating) contribute more.
   */
  private calculateImpactScore(players: LineupPlayer[]): number {
    if (players.length === 0) return 0;

    // Weighted by rating, with bonus for key roles
    let total = 0;
    for (const p of players) {
      const roleWeight = ROLE_IMPORTANCE[p.role] ?? 0.1;
      // Impact = rating normalized to 0-100 scale * role importance
      const playerImpact = ((p.rating - 0.8) / 0.5) * 100 * (0.5 + roleWeight);
      total += Math.max(0, playerImpact);
    }

    return Math.min(100, total / players.length);
  }

  /**
   * Synergy score — how well this lineup plays together.
   * Based on maps played together and standin count.
   */
  private calculateSynergyScore(players: LineupPlayer[], lineup: Lineup): number {
    if (players.length === 0) return 0;

    // Base synergy from average maps played together
    const avgMaps = players.reduce((s, p) => s + p.mapsOnRecord, 0) / players.length;

    // Synergy scales with experience together (caps at 50 maps)
    let synergy = Math.min(100, (avgMaps / 50) * 100);

    // Penalty for standins — they haven't played with the team
    const standinCount = lineup.standinCount;
    synergy -= standinCount * STANDIN_PENALTY_PER_PLAYER;

    // Penalty if lineup is unconfirmed (uncertainty)
    if (!lineup.isConfirmed) {
      synergy *= 0.85;
    }

    return Math.max(0, synergy);
  }

  /**
   * Standin penalty — how much the lineup is weakened by substitute players.
   */
  private calculateStandinPenalty(lineup: Lineup): number {
    if (!lineup.hasStandin) return 0;

    // Each standin reduces effectiveness
    const basePenalty = lineup.standinCount * 12;

    // Extra penalty if key players are missing
    const keyPlayerPenalty = lineup.missingKeyPlayers.length * 8;

    return Math.min(50, basePenalty + keyPlayerPenalty);
  }

  /**
   * Evaluate role completeness — does the lineup cover all essential roles?
   */
  private evaluateRoles(players: LineupPlayer[]): {
    roleCompleteness: number;
    missingKeyRoles: PlayerRole[];
  } {
    const essentialRoles: PlayerRole[] = ['AWPer', 'IGL', 'Rifler', 'Entry'];
    const coveredRoles = new Set(players.map((p) => p.role));
    const missingKeyRoles = essentialRoles.filter((r) => !coveredRoles.has(r));

    // All roles present = 1.0, missing all = 0
    const roleCompleteness = essentialRoles.length > 0
      ? (essentialRoles.length - missingKeyRoles.length) / essentialRoles.length
      : 1;

    return { roleCompleteness, missingKeyRoles };
  }

  /**
   * Detect critical player absences by comparing to expected lineup.
   */
  private detectKeyAbsences(lineupA: Lineup, lineupB: Lineup): KeyAbsence[] {
    const absences: KeyAbsence[] = [];

    const checkLineup = (lineup: Lineup, team: 'team_a' | 'team_b'): void => {
      // Check for missing key players
      for (const name of lineup.missingKeyPlayers) {
        absences.push({
          team,
          playerName: name,
          role: 'Rifler', // default, would need actual data
          impact: 'significant',
          reason: `${name} 缺阵`,
        });
      }

      // Check for standins
      if (lineup.hasStandin) {
        const standins = lineup.players.filter((p) => p.isStandin);
        for (const s of standins) {
          const roleImportance = ROLE_IMPORTANCE[s.role] ?? 0.1;
          absences.push({
            team,
            playerName: s.nickname,
            role: s.role,
            impact: roleImportance > 0.2 ? 'critical' : roleImportance > 0.1 ? 'significant' : 'minor',
            reason: `${s.nickname} 为替补选手`,
          });
        }
      }
    };

    checkLineup(lineupA, 'team_a');
    checkLineup(lineupB, 'team_b');

    return absences;
  }
}
