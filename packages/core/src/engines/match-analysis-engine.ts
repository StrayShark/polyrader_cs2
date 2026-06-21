import type { Team, MatchInfo } from '../types/index';

export interface MapAnalysis {
  map: string;
  teamAWinRate: number;
  teamBWinRate: number;
  advantage: 'team_a' | 'team_b' | 'neutral';
  confidence: number;
}

export interface MatchAnalysis {
  matchId: string;
  mapAnalyses: MapAnalysis[];
  vetoSimulation: VetoResult;
  overallAdvantage: 'team_a' | 'team_b' | 'neutral';
  advantageScore: number; // -1 to 1, positive = team A
}

export interface VetoResult {
  remainingMaps: string[];
  teamAPick: string;
  teamBPick: string;
  decider: string;
}

/**
 * MatchAnalysisEngine — Map pool analysis and BO3 veto simulation
 */
export class MatchAnalysisEngine {
  /**
   * Analyze map pool advantage between two teams.
   */
  analyzeMapPool(
    match: MatchInfo,
    teamA: Team,
    teamB: Team,
  ): MatchAnalysis {
    const allMaps = this.getAllMaps();
    const mapAnalyses: MapAnalysis[] = [];

    for (const map of allMaps) {
      const statA = teamA.mapPool.maps.find((m) => m.map === map);
      const statB = teamB.mapPool.maps.find((m) => m.map === map);

      const winRateA = statA?.winRate ?? 0.5;
      const winRateB = statB?.winRate ?? 0.5;
      const diff = winRateA - winRateB;

      const confidence = Math.min(
        0.9,
        ((statA?.matchesPlayed ?? 0) + (statB?.matchesPlayed ?? 0)) / 20,
      );

      mapAnalyses.push({
        map,
        teamAWinRate: winRateA,
        teamBWinRate: winRateB,
        advantage: diff > 0.05 ? 'team_a' : diff < -0.05 ? 'team_b' : 'neutral',
        confidence,
      });
    }

    const vetoResult = this.simulateVeto(mapAnalyses, match.format);

    // Calculate overall advantage
    const totalAdvantage = mapAnalyses.reduce((sum, m) => {
      return sum + (m.teamAWinRate - m.teamBWinRate);
    }, 0);

    return {
      matchId: match.matchId,
      mapAnalyses,
      vetoSimulation: vetoResult,
      overallAdvantage:
        totalAdvantage > 0.2 ? 'team_a' : totalAdvantage < -0.2 ? 'team_b' : 'neutral',
      advantageScore: Math.round(totalAdvantage * 100) / 100,
    };
  }

  /**
   * Simulate a BO3 veto process.
   * Standard CS2 BO3 veto: Ban-Ban-Pick-Pick-Ban-Ban-Decider
   */
  simulateVeto(mapAnalyses: MapAnalysis[], format: MatchInfo['format']): VetoResult {
    if (format === 'BO1') {
      const best = [...mapAnalyses].sort(
        (a, b) => Math.abs(b.teamAWinRate - b.teamBWinRate) - Math.abs(a.teamAWinRate - a.teamBWinRate),
      );
      return {
        remainingMaps: [best[0].map],
        teamAPick: best[0].map,
        teamBPick: best[0].map,
        decider: best[0].map,
      };
    }

    // BO3 veto simulation
    let remaining = [...mapAnalyses];

    // Team A bans worst map
    const aWorst = this.findWorstMap(remaining, 'team_a');
    remaining = remaining.filter((m) => m.map !== aWorst.map);

    // Team B bans worst map
    const bWorst = this.findWorstMap(remaining, 'team_b');
    remaining = remaining.filter((m) => m.map !== bWorst.map);

    // Team A picks best map
    const aBest = this.findBestMap(remaining, 'team_a');
    remaining = remaining.filter((m) => m.map !== aBest.map);

    // Team B picks best map
    const bBest = this.findBestMap(remaining, 'team_b');
    remaining = remaining.filter((m) => m.map !== bBest.map);

    // Team B bans
    const bBan2 = this.findWorstMap(remaining, 'team_b');
    remaining = remaining.filter((m) => m.map !== bBan2.map);

    // Team A bans
    const aBan2 = this.findWorstMap(remaining, 'team_a');
    remaining = remaining.filter((m) => m.map !== aBan2.map);

    return {
      remainingMaps: remaining.map((m) => m.map),
      teamAPick: aBest.map,
      teamBPick: bBest.map,
      decider: remaining[0]?.map ?? 'Inferno',
    };
  }

  /**
   * Compare two teams side by side.
   */
  compareTeams(teamA: Team, teamB: Team): TeamComparison {
    return {
      teamA: {
        name: teamA.name,
        rank: teamA.rank,
        winRate: teamA.recentForm.winRate,
        streak: teamA.recentForm.streak,
        avgRating: teamA.recentForm.averageRating,
        topPlayer: this.getTopPlayer(teamA),
      },
      teamB: {
        name: teamB.name,
        rank: teamB.rank,
        winRate: teamB.recentForm.winRate,
        streak: teamB.recentForm.streak,
        avgRating: teamB.recentForm.averageRating,
        topPlayer: this.getTopPlayer(teamB),
      },
      rankAdvantage: teamA.rank < teamB.rank ? 'team_a' : 'team_b',
      formAdvantage:
        teamA.recentForm.winRate > teamB.recentForm.winRate
          ? 'team_a'
          : 'team_b',
    };
  }

  private findBestMap(maps: MapAnalysis[], team: 'team_a' | 'team_b'): MapAnalysis {
    return [...maps].sort((a, b) => {
      const rateA = team === 'team_a' ? a.teamAWinRate : a.teamBWinRate;
      const rateB = team === 'team_a' ? b.teamAWinRate : b.teamBWinRate;
      return rateB - rateA;
    })[0];
  }

  private findWorstMap(maps: MapAnalysis[], team: 'team_a' | 'team_b'): MapAnalysis {
    return [...maps].sort((a, b) => {
      const rateA = team === 'team_a' ? a.teamAWinRate : a.teamBWinRate;
      const rateB = team === 'team_a' ? b.teamAWinRate : b.teamBWinRate;
      return rateA - rateB;
    })[0];
  }

  private getAllMaps(): string[] {
    return ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];
  }

  private getTopPlayer(team: Team): string {
    return [...team.players].sort((a, b) => b.rating - a.rating)[0]?.nickname ?? 'N/A';
  }
}

export interface TeamComparison {
  teamA: TeamSummary;
  teamB: TeamSummary;
  rankAdvantage: 'team_a' | 'team_b';
  formAdvantage: 'team_a' | 'team_b';
}

export interface TeamSummary {
  name: string;
  rank: number;
  winRate: number;
  streak: number;
  avgRating: number;
  topPlayer: string;
}
