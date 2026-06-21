import * as cheerio from 'cheerio';
import { fetchWithRetry } from './anti-detect';
import type { Team, Player, RecentForm, MatchResult, MapPool, MapStat, HeadToHead, Lineup, LineupPlayer, PlayerRole } from '@polyrader/core';

const HLTV_BASE = 'https://www.hltv.org';

export interface HltvMatchSummary {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  event: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  date: string;
  stars: number; // HLTV star rating (match importance)
}

export interface HltvMatchDetail {
  matchId: string;
  teamA: string;
  teamB: string;
  maps: string[];
  format: string;
  event: string;
  date: string;
  teamAId: string;
  teamBId: string;
}

export class HLTVCrawler {
  /**
   * Get the current HLTV world ranking.
   */
  async getRankings(): Promise<Array<{ rank: number; teamId: string; name: string }>> {
    const html = await fetchWithRetry(`${HLTV_BASE}/ranking/teams`);
    const $ = cheerio.load(html);

    const rankings: Array<{ rank: number; teamId: string; name: string }> = [];

    $('.ranked-team').each((_i, el) => {
      const rankText = $(el).find('.position').text().trim().replace('#', '');
      const name = $(el).find('.name').text().trim();
      const href = $(el).find('.name').attr('href') ?? '';
      const teamId = href.split('/').pop() ?? '';

      if (rankText && name) {
        rankings.push({ rank: parseInt(rankText, 10), teamId, name });
      }
    });

    return rankings;
  }

  /**
   * Get upcoming matches with star ratings.
   * Returns all upcoming matches sorted by star rating (importance).
   */
  async getMatches(): Promise<HltvMatchSummary[]> {
    const html = await fetchWithRetry(`${HLTV_BASE}/matches`);
    const $ = cheerio.load(html);

    const matches: HltvMatchSummary[] = [];

    $('.upcoming-match').each((_i, el) => {
      const teamA = $(el).find('.team1 .team-name').text().trim();
      const teamB = $(el).find('.team2 .team-name').text().trim();
      const event = $(el).find('.event-name').text().trim();
      const format = ($(el).find('.match-format').text().trim() || 'BO3') as HltvMatchSummary['format'];
      const dateAttr = $(el).find('.match-time').attr('data-unix');
      const date = dateAttr ? new Date(parseInt(dateAttr, 10) * 1000).toISOString() : '';

      // Extract star rating
      const starsEl = $(el).find('.match-stars i.fa-star');
      const stars = starsEl.length || 0;

      // Extract team links for IDs
      const teamAHref = $(el).find('.team1 a').attr('href') ?? '';
      const teamBHref = $(el).find('.team2 a').attr('href') ?? '';
      const teamAId = teamAHref.split('/').pop() ?? teamA.toLowerCase();
      const teamBId = teamBHref.split('/').pop() ?? teamB.toLowerCase();

      // Extract match link for ID
      const matchHref = $(el).find('a.match').attr('href') ?? '';
      const matchId = matchHref.split('/').pop() ?? `${teamAId}-vs-${teamBId}`;

      // Determine event type
      const eventType: 'LAN' | 'Online' =
        event.toLowerCase().includes('online') ? 'Online' : 'LAN';

      if (teamA && teamB) {
        matches.push({
          matchId,
          teamAId,
          teamBId,
          teamAName: teamA,
          teamBName: teamB,
          event,
          eventType,
          format,
          date,
          stars,
        });
      }
    });

    // Sort by stars descending (most important first), then by date
    return matches.sort((a, b) => b.stars - a.stars || a.date.localeCompare(b.date));
  }

  /**
   * Get high-importance matches (3+ stars, LAN events, BO3/BO5).
   * These are the matches worth fetching detailed team data for.
   */
  getHighProfileMatches(matches: HltvMatchSummary[]): HltvMatchSummary[] {
    return matches.filter((m) => {
      // LAN events are always high profile
      if (m.eventType === 'LAN') return true;
      // 3+ star matches
      if (m.stars >= 3) return true;
      // BO5 matches
      if (m.format === 'BO5') return true;
      return false;
    });
  }

  /**
   * Get match details including map picks and team IDs.
   */
  async getMatchDetail(matchId: string): Promise<HltvMatchDetail> {
    const html = await fetchWithRetry(`${HLTV_BASE}/matches/${matchId}`);
    const $ = cheerio.load(html);

    const teamA = $('.team1 .team-name').text().trim();
    const teamB = $('.team2 .team-name').text().trim();
    const event = $('.event-name').text().trim();
    const format = $('.match-format').text().trim() || 'BO3';

    const teamAHref = $('.team1 a').attr('href') ?? '';
    const teamBHref = $('.team2 a').attr('href') ?? '';
    const teamAId = teamAHref.split('/').pop() ?? '';
    const teamBId = teamBHref.split('/').pop() ?? '';

    const maps: string[] = [];
    $('.map-name').each((_i, el) => {
      const map = $(el).text().trim();
      if (map) maps.push(map);
    });

    return { matchId, teamA, teamB, maps, format, event, date: '', teamAId, teamBId };
  }

  /**
   * Extract lineup data from a match page.
   * Parses the starting five for each team, detecting standins and key absences.
   */
  async getMatchLineups(matchId: string): Promise<{
    teamA: Lineup;
    teamB: Lineup;
  } | null> {
    try {
      const html = await fetchWithRetry(`${HLTV_BASE}/matches/${matchId}`);
      const $ = cheerio.load(html);

      const parseLineup = (teamSelector: string): Lineup => {
        const players: LineupPlayer[] = [];
        const playerEls = $(teamSelector).find('.lineup-player, .player');

        // If no lineup-specific class, try the standard player table
        if (playerEls.length === 0) {
          $(teamSelector).find('.players-table tbody tr, .lineup-table tr').each((_i, el) => {
            const nickname = $(el).find('.player-nickname, .nickname').text().trim();
            const ratingText = $(el).find('.rating, .player-rating').text().trim();
            const rating = parseFloat(ratingText) || 1.0;
            const isStandin = $(el).find('.standin, .substitute').length > 0 ||
              $(el).text().toLowerCase().includes('stand-in');

            if (nickname) {
              players.push({
                playerId: nickname.toLowerCase(),
                nickname,
                rating,
                role: this.inferRole($(el).text()),
                isStandin,
                impactScore: Math.round(rating * 80),
                mapsOnRecord: 50,
              });
            }
          });
        } else {
          playerEls.each((_i, el) => {
            const nickname = $(el).find('.player-nickname, .nickname').text().trim();
            const ratingText = $(el).find('.rating').text().trim();
            const rating = parseFloat(ratingText) || 1.0;
            const isStandin = $(el).hasClass('standin') || $(el).hasClass('substitute');

            if (nickname) {
              players.push({
                playerId: nickname.toLowerCase(),
                nickname,
                rating,
                role: this.inferRole($(el).text()),
                isStandin,
                impactScore: Math.round(rating * 80),
                mapsOnRecord: isStandin ? 5 : 50,
              });
            }
          });
        }

        const standins = players.filter((p) => p.isStandin);
        const isConfirmed = players.length >= 5;

        return {
          players: players.slice(0, 5),
          isConfirmed,
          hasStandin: standins.length > 0,
          standinCount: standins.length,
          missingKeyPlayers: [],
        };
      };

      const teamA = parseLineup('.team1, .team-left, .team-a');
      const teamB = parseLineup('.team2, .team-right, .team-b');

      if (teamA.players.length === 0 && teamB.players.length === 0) {
        return null;
      }

      return { teamA, teamB };
    } catch {
      return null;
    }
  }

  /**
   * Infer player role from context text.
   */
  private inferRole(text: string): PlayerRole {
    const lower = text.toLowerCase();
    if (lower.includes('awp') || lower.includes('sniper')) return 'AWPer';
    if (lower.includes('igl') || lower.includes('captain') || lower.includes('leader')) return 'IGL';
    if (lower.includes('entry')) return 'Entry';
    if (lower.includes('support')) return 'Support';
    if (lower.includes('lurk')) return 'Lurker';
    if (lower.includes('coach')) return 'Coach';
    return 'Rifler';
  }

  /**
   * Get detailed team information including players, recent form, and map pool.
   */
  async getTeam(teamId: string): Promise<Team> {
    const html = await fetchWithRetry(`${HLTV_BASE}/team/${teamId}`);
    const $ = cheerio.load(html);

    const name = $('.profile-team-name').text().trim();
    const rankText = $('.team-world-ranking').text().trim().replace('#', '');
    const rank = parseInt(rankText, 10) || 999;

    // Players
    const players: Player[] = [];
    $('.players-table tbody tr').each((_i, el) => {
      const nickname = $(el).find('.player-nickname').text().trim();
      const nameText = $(el).find('.player-name').text().trim();
      const ratingText = $(el).find('.rating').text().trim();
      const mapsText = $(el).find('.maps').text().trim();

      if (nickname) {
        players.push({
          playerId: nickname.toLowerCase(),
          name: nameText,
          nickname,
          rating: parseFloat(ratingText) || 1.0,
          kdRatio: 1.0,
          headshotPercent: 0,
          mapsPlayed: parseInt(mapsText, 10) || 0,
          role: '',
        });
      }
    });

    const recentForm = this.parseRecentForm($);
    const mapPool = this.parseMapPool($);

    return {
      teamId,
      name,
      logo: '',
      rank,
      region: '',
      players,
      recentForm,
      mapPool,
      headToHead: [],
    };
  }

  /**
   * Get head-to-head history between two teams.
   * Scrapes the HLTV head-to-head comparison page.
   */
  async getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHead> {
    try {
      const html = await fetchWithRetry(`${HLTV_BASE}/stats/teams/compare/${teamAId}/${teamBId}`);
      const $ = cheerio.load(html);

      // Parse overall stats
      const matchesPlayedText = $('.matches-played .value').text().trim();
      const matchesPlayed = parseInt(matchesPlayedText, 10) || 0;

      const winsText = $('.team-a-wins .value, .wins .value').first().text().trim();
      const wins = parseInt(winsText, 10) || 0;

      const lossesText = $('.team-b-wins .value, .losses .value').first().text().trim();
      const losses = parseInt(lossesText, 10) || 0;

      // Parse last match date
      const lastMatchText = $('.last-match-date, .recent-match-date').text().trim();
      const lastMatch = lastMatchText || '';

      // Parse map-specific results
      const mapResults: Array<{ map: string; teamAWins: number; teamBWins: number }> = [];
      $('.map-stats-row, .map-result-row').each((_i, el) => {
        const mapName = $(el).find('.map-name').text().trim();
        const teamAWinsText = $(el).find('.team-a-wins, .wins-a').text().trim();
        const teamBWinsText = $(el).find('.team-b-wins, .wins-b').text().trim();

        if (mapName) {
          mapResults.push({
            map: mapName,
            teamAWins: parseInt(teamAWinsText, 10) || 0,
            teamBWins: parseInt(teamBWinsText, 10) || 0,
          });
        }
      });

      // Fallback: try the matches history page if compare page fails
      if (matchesPlayed === 0) {
        return this.getHeadToHeadFromMatches(teamAId, teamBId);
      }

      return {
        opponent: teamBId,
        matchesPlayed,
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

  /**
   * Fallback H2H: parse from team A's match history page.
   */
  private async getHeadToHeadFromMatches(teamAId: string, teamBId: string): Promise<HeadToHead> {
    try {
      const html = await fetchWithRetry(`${HLTV_BASE}/team/${teamAId}/matches`);
      const $ = cheerio.load(html);

      let wins = 0;
      let losses = 0;
      let lastMatch = '';

      $('.results-table tbody tr').each((_i, el) => {
        const opponentHref = $(el).find('.opponent a').attr('href') ?? '';
        const opponentId = opponentHref.split('/').pop() ?? '';

        if (opponentId === teamBId) {
          const resultText = $(el).find('.result').text().trim();
          const dateAttr = $(el).find('.date').attr('data-unix');
          const date = dateAttr ? new Date(parseInt(dateAttr, 10) * 1000).toISOString() : '';

          if (resultText === 'W') wins++;
          else if (resultText === 'L') losses++;

          if (!lastMatch) lastMatch = date;
        }
      });

      return {
        opponent: teamBId,
        matchesPlayed: wins + losses,
        wins,
        losses,
        lastMatch,
        mapResults: [],
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

  private parseRecentForm($: cheerio.CheerioAPI): RecentForm {
    const results: MatchResult[] = [];
    let wins = 0;

    $('.results-table tbody tr').each((_i, el) => {
      const opponent = $(el).find('.opponent').text().trim();
      const resultText = $(el).find('.result').text().trim();
      const score = $(el).find('.score').text().trim();
      const event = $(el).find('.event-name').text().trim();
      const dateAttr = $(el).find('.date').attr('data-unix');
      const date = dateAttr ? new Date(parseInt(dateAttr, 10) * 1000).toISOString() : '';

      const result: 'win' | 'loss' | 'draw' =
        resultText === 'W' ? 'win' : resultText === 'L' ? 'loss' : 'draw';

      if (result === 'win') wins++;
      results.push({ opponent, result, score, date, event });
    });

    const last10 = results.slice(0, 10);
    const winRate = last10.length > 0 ? wins / last10.length : 0.5;

    // Calculate streak
    let streak = 0;
    for (const r of last10) {
      if (r.result === 'win') streak++;
      else break;
    }

    return {
      last10Matches: last10,
      winRate,
      streak,
      averageRating: 1.0,
    };
  }

  private parseMapPool($: cheerio.CheerioAPI): MapPool {
    const maps: MapStat[] = [];

    $('.map-stats-row').each((_i, el) => {
      const mapName = $(el).find('.map-name').text().trim();
      const winRateText = $(el).find('.win-rate').text().trim().replace('%', '');
      const matchesText = $(el).find('.matches-played').text().trim();

      if (mapName) {
        maps.push({
          map: mapName,
          winRate: parseFloat(winRateText) / 100 || 0.5,
          matchesPlayed: parseInt(matchesText, 10) || 0,
          roundsWon: 0,
          roundsLost: 0,
        });
      }
    });

    return { maps };
  }
}
