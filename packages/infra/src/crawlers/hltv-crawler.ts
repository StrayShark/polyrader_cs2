import * as cheerio from 'cheerio';
import { fetchWithBrowser } from './anti-detect';
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

export interface HltvCommunityPrediction {
  matchId: string;
  teamAProb: number;
  teamBProb: number;
  teamAName: string;
  teamBName: string;
}

export type HltvMatchLiveStatus = 'upcoming' | 'live' | 'finished' | 'postponed';

/**
 * Parse a team ID from an HLTV team URL.
 * e.g. "/team/9565/vitality" → "9565"
 */
function parseTeamId(href: string): string {
  const match = href.match(/\/team\/(\d+)/);
  return match ? match[1] : '';
}

/**
 * Parse a match ID from an HLTV match URL.
 * e.g. "/matches/2395371/inner-circle-vs-am-..." → "2395371"
 */
function parseMatchId(href: string): string {
  const match = href.match(/\/matches\/(\d+)/);
  return match ? match[1] : '';
}

export class HLTVCrawler {
  /**
   * Get the current HLTV world ranking.
   * Uses Playwright to bypass Cloudflare, then extracts data via page.evaluate.
   */
  async getRankings(): Promise<Array<{ rank: number; teamId: string; name: string }>> {
    const html = await fetchWithBrowser(`${HLTV_BASE}/ranking/teams`);
    const $ = cheerio.load(html);

    const rankings: Array<{ rank: number; teamId: string; name: string }> = [];

    $('.ranked-team').each((_i, el) => {
      const rankText = $(el).find('.position').text().trim().replace('#', '');
      // Team name: try multiple selectors for the new page structure
      const name = $(el).find('.name, .team-ranking-header, .team-name, img[title]').attr('title')
        || $(el).find('.name').text().trim()
        || $(el).find('.team-name').text().trim();
      // Team ID: extract from any team link href
      const teamHref = $(el).find('a[href*="/team/"]').attr('href') ?? '';
      const teamId = parseTeamId(teamHref);

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
    const html = await fetchWithBrowser(`${HLTV_BASE}/matches`);
    const $ = cheerio.load(html);

    const matches: HltvMatchSummary[] = [];
    const seenMatchIds = new Set<string>();

    // New HLTV structure: matches are in .match-day containers with .match links
    // Each match has team names in .team, format in .boX, event in match link text
    $('.match-day, .matches-day, [class*="match-day"]').each((_dayIdx, dayEl) => {
      // Date from the day header
      const dateAttr = $(dayEl).find('.match-time, [data-unix]').attr('data-unix');
      const dateUnix = dateAttr ? parseInt(dateAttr, 10) : 0;

      $(dayEl).find('a[href*="/matches/"]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        const matchId = parseMatchId(href);
        if (!matchId || seenMatchIds.has(matchId)) return;

        const $el = $(el);
        const text = $el.text();

        // Extract team names: look for team divs/spans
        let teamA = '';
        let teamB = '';
        const teamEls = $el.find('.team, .team-name, [class*="team"]');
        if (teamEls.length >= 2) {
          teamA = $(teamEls[0]).text().trim();
          teamB = $(teamEls[1]).text().trim();
        }

        // Fallback: parse from URL slug (e.g. /matches/123/team-a-vs-team-b-event)
        if (!teamA || !teamB) {
          const slug = href.split('/').pop() ?? '';
          const parts = slug.split('-vs-');
          if (parts.length >= 2) {
            teamA = teamA || parts[0].replace(/-/g, ' ').trim();
            // team B is everything after "vs" up to the event name
            const afterVs = parts[1].split('-');
            // Take first 2-3 words as team name (heuristic)
            teamB = teamB || afterVs.slice(0, 2).join(' ').trim();
          }
        }

        // Extract format
        const formatMatch = text.match(/\b(bo1|bo3|bo5)\b/i);
        const format = (formatMatch ? formatMatch[1].toUpperCase() : 'BO3') as HltvMatchSummary['format'];

        // Extract event name (usually the text without team names and format)
        let event = '';
        const eventEl = $el.find('.event-name, .event, [class*="event"]');
        if (eventEl.length) {
          event = eventEl.first().text().trim();
        }
        if (!event) {
          // Try to extract from the match URL slug after team names
          const slug = href.split('/').pop() ?? '';
          const parts = slug.split('-vs-');
          if (parts.length >= 2) {
            const eventParts = parts[1].split('-').slice(2);
            event = eventParts.join(' ').trim() || 'Unknown Event';
          }
        }

        // Extract date
        const matchTimeEl = $el.find('[data-unix], .match-time');
        const matchDateAttr = matchTimeEl.attr('data-unix');
        const date = matchDateAttr
          ? new Date(parseInt(matchDateAttr, 10) * 1000).toISOString()
          : dateUnix
            ? new Date(dateUnix * 1000).toISOString()
            : '';

        // Extract star rating
        const starsEl = $el.find('.match-stars i.fa-star, .stars i, [class*="star"]');
        const stars = starsEl.length || 0;

        // Extract team IDs from team links within this match
        const teamAHref = $el.find('a[href*="/team/"]').first().attr('href') ?? '';
        const teamBHrefs = $el.find('a[href*="/team/"]');
        const teamBHref = teamBHrefs.length > 1 ? $(teamBHrefs[1]).attr('href') ?? '' : '';
        const teamAId = parseTeamId(teamAHref);
        const teamBId = parseTeamId(teamBHref);

        // Determine event type
        const eventType: 'LAN' | 'Online' =
          event.toLowerCase().includes('online') ? 'Online' : 'LAN';

        if (teamA && teamB) {
          seenMatchIds.add(matchId);
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
    });

    // Fallback: if match-day containers not found, try direct match links
    if (matches.length === 0) {
      $('a[href*="/matches/"]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        const matchId = parseMatchId(href);
        if (!matchId || seenMatchIds.has(matchId)) return;

        // This is a less detailed fallback — skip if we can't get team names
        const slug = href.split('/').pop() ?? '';
        const parts = slug.split('-vs-');
        if (parts.length < 2) return;

        const teamA = parts[0].replace(/-/g, ' ').trim();
        const afterVs = parts[1].split('-');
        const teamB = afterVs.slice(0, 2).join(' ').trim();
        const event = afterVs.slice(2).join(' ').trim() || 'Unknown Event';

        seenMatchIds.add(matchId);
        matches.push({
          matchId,
          teamAId: '',
          teamBId: '',
          teamAName: teamA,
          teamBName: teamB,
          event,
          eventType: 'LAN',
          format: 'BO3',
          date: '',
          stars: 0,
        });
      });
    }

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
    const html = await fetchWithBrowser(`${HLTV_BASE}/matches/${matchId}`);
    const $ = cheerio.load(html);

    const teamA = $('.team1 .team-name, .team-1 .team-name').text().trim();
    const teamB = $('.team2 .team-name, .team-2 .team-name').text().trim();
    const event = $('.event-name, .event').text().trim();
    const format = $('.match-format, .format').text().trim() || 'BO3';

    const teamAHref = $('.team1 a[href*="/team/"], .team-1 a[href*="/team/"]').attr('href') ?? '';
    const teamBHref = $('.team2 a[href*="/team/"], .team-2 a[href*="/team/"]').attr('href') ?? '';
    const teamAId = parseTeamId(teamAHref);
    const teamBId = parseTeamId(teamBHref);

    const maps: string[] = [];
    $('.map-name, .map, [class*="map-name"]').each((_i, el) => {
      const map = $(el).text().trim();
      if (map && !maps.includes(map)) maps.push(map);
    });

    return { matchId, teamA, teamB, maps, format, event, date: '', teamAId, teamBId };
  }

  /**
   * HLTV community "Pick a winner" vote percentages.
   * Selectors follow the public HLTV match page structure.
   */
  async getCommunityPrediction(matchId: string): Promise<HltvCommunityPrediction | null> {
    try {
      const html = await fetchWithBrowser(`${HLTV_BASE}/matches/${matchId}/pick`);
      const $ = cheerio.load(html);
      if (!$('.pick-a-winner').length) return null;

      const parsePct = (selector: string): number | null => {
        const text = $(selector).first().text().trim().replace('%', '');
        const n = parseFloat(text);
        return Number.isFinite(n) ? n / 100 : null;
      };

      let teamAProb = parsePct('.pick-a-winner-team.team1 > .percentage')
        ?? parsePct('.pick-a-winner .team1 .percentage');
      let teamBProb = parsePct('.pick-a-winner-team.team2 > .percentage')
        ?? parsePct('.pick-a-winner .team2 .percentage');

      if (teamAProb === null || teamBProb === null) return null;

      const sum = teamAProb + teamBProb;
      if (sum <= 0) return null;

      teamAProb /= sum;
      teamBProb /= sum;

      const teamAName = $('.pick-a-winner-team.team1 .team-name, .team1-gradient .team-name').first().text().trim()
        || $('.team1 .team-name').first().text().trim();
      const teamBName = $('.pick-a-winner-team.team2 .team-name, .team2-gradient .team-name').first().text().trim()
        || $('.team2 .team-name').first().text().trim();

      return { matchId, teamAProb, teamBProb, teamAName, teamBName };
    } catch {
      return null;
    }
  }

  /**
   * Find an upcoming HLTV match ID by fuzzy team name match.
   */
  async findMatchIdByTeams(teamAName: string, teamBName: string): Promise<string | null> {
    try {
      const matches = await this.getMatches();
      for (const m of matches) {
        const direct = this.teamsMatch(m.teamAName, teamAName) && this.teamsMatch(m.teamBName, teamBName);
        const swapped = this.teamsMatch(m.teamAName, teamBName) && this.teamsMatch(m.teamBName, teamAName);
        if (direct || swapped) return m.matchId;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Community vote probability for team A (0-1), aligned to the given team names.
   */
  async getCommunityProbForTeams(teamAName: string, teamBName: string, hltvMatchId?: string): Promise<number | undefined> {
    const matchId = hltvMatchId ?? await this.findMatchIdByTeams(teamAName, teamBName);
    if (!matchId) return undefined;

    const pred = await this.getCommunityPrediction(matchId);
    if (!pred) return undefined;

    const hltvAIsOurA = this.teamsMatch(pred.teamAName || teamAName, teamAName)
      || this.teamsMatch(pred.teamAName, teamAName);
    const hltvAIsOurB = this.teamsMatch(pred.teamAName || teamBName, teamBName);

    if (hltvAIsOurA) return pred.teamAProb;
    if (hltvAIsOurB) return pred.teamBProb;
    return pred.teamAProb;
  }

  /** Read match page status (upcoming / live / finished / postponed). */
  async getMatchLiveStatus(matchId: string): Promise<HltvMatchLiveStatus> {
    try {
      const html = await fetchWithBrowser(`${HLTV_BASE}/matches/${matchId}`);
      const $ = cheerio.load(html);
      const pageText = $('body').text().toLowerCase();
      if (/postponed|delayed|rescheduled/.test(pageText)) return 'postponed';
      if ($('.team1-gradient .won, .team2-gradient .won').length) return 'finished';
      if ($('.countdown[data-time-countdown], .live-indicator, .match-page-live').length) {
        const countdown = $('.countdown').text().toLowerCase();
        if (countdown.includes('live')) return 'live';
      }
      if ($('.standard-box .live').length) return 'live';
      return 'upcoming';
    } catch {
      return 'upcoming';
    }
  }

  private teamsMatch(a: string, b: string): boolean {
    const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
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
      const html = await fetchWithBrowser(`${HLTV_BASE}/matches/${matchId}`);
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
    const html = await fetchWithBrowser(`${HLTV_BASE}/team/${teamId}/_`);
    const $ = cheerio.load(html);

    const name = $('.profile-team-name, .team-name, h1').first().text().trim();
    const rankText = $('.team-world-ranking, .rank, [class*="ranking"]').text().trim().replace('#', '');
    const rank = parseInt(rankText, 10) || 999;

    // Players
    const players: Player[] = [];
    $('.players-table tbody tr, .player, [class*="player-card"]').each((_i, el) => {
      const nickname = $(el).find('.player-nickname, .nickname').text().trim();
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
      const html = await fetchWithBrowser(`${HLTV_BASE}/stats/teams/compare/${teamAId}/${teamBId}`);
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
      const html = await fetchWithBrowser(`${HLTV_BASE}/team/${teamAId}/matches`);
      const $ = cheerio.load(html);

      let wins = 0;
      let losses = 0;
      let lastMatch = '';

      $('.results-table tbody tr').each((_i, el) => {
        const opponentHref = $(el).find('.opponent a').attr('href') ?? '';
        const opponentId = parseTeamId(opponentHref);

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
