import cron from 'node-cron';
import { MarketService } from '../services/market-service';
import { DailyService } from '../services/daily-service';
import { AiConfigService } from '../services/ai-config-service';
import { SignalService } from '../services/signal-service';
import { HLTVCrawler, PolymarketGammaClient, MarketRepository, CsApiClient, GridClient, closeBrowser } from '@polyrader/infra';
import { LLMRepository, EsportsRepository } from '@polyrader/infra';
import { runMigrations, query, queryOne } from '@polyrader/infra';
import { SettlementEngine, MatchStateMachine, EsportsEnricher, type EnricherSources } from '@polyrader/core';
import type { SimulatedBet, Team, Player, HeadToHead } from '@polyrader/core';
import { sharedWhaleIngestion } from '../services/whale-ingestion-service';
import { WalletPerformanceService } from '../services/wallet-performance-service';
import { WalletFollowService } from '../services/wallet-follow-service';
import { trackTask } from '../services/task-tracker-service';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

const marketService = new MarketService();
const dailyService = new DailyService();
const aiConfigService = new AiConfigService();
const signalService = new SignalService();
const hltvCrawler = new HLTVCrawler();
const csApiClient = new CsApiClient();
const gridClient = new GridClient();
const llmRepo = new LLMRepository();
const esportsRepo = new EsportsRepository();
const enricher = new EsportsEnricher();
const marketRepo = new MarketRepository();
const pmGammaClient = new PolymarketGammaClient();
const settlementEngine = new SettlementEngine();
const whaleIngestion = sharedWhaleIngestion;
const walletPerformance = new WalletPerformanceService();
const walletFollow = new WalletFollowService();
whaleIngestion.setWalletFollowService(walletFollow);

// Track which matches have already been auto-analyzed to avoid duplicates
const analyzedMatches = new Map<string, number>(); // matchId → last analysis timestamp

/**
 * Build the EnricherSources adapter that connects the enricher to
 * CS API, HLTV crawler, and the database.
 */
function buildEnricherSources(historyMonths = 3): EnricherSources {
  return {
    // ── GRID (priority 1: official data) ──
    async getTeamFromGrid(teamId: string): Promise<Team | null> {
      return gridClient.getTeam(teamId);
    },
    async searchTeamsGrid(name: string) {
      return gridClient.searchTeams(name);
    },
    async getRosterFromGrid(teamId: string, months?: number) {
      return gridClient.getTeamRoster(teamId, months ?? historyMonths);
    },
    async getH2HFromGrid(teamAId: string, teamBId: string, months?: number): Promise<HeadToHead> {
      return gridClient.getHeadToHead(teamAId, teamBId, months ?? historyMonths);
    },
    // ── CS API (priority 2) ──
    async getTeamFromCsApi(teamId: string): Promise<Team | null> {
      return csApiClient.getTeam(teamId);
    },
    async searchTeamsCsApi(name: string) {
      return csApiClient.searchTeams(name);
    },
    // ── HLTV (priority 3: fallback) ──
    async getTeamFromHltv(teamId: string): Promise<Team | null> {
      return hltvCrawler.getTeam(teamId);
    },
    async getH2HFromCsApi(teamAId: string, teamBId: string, months?: number): Promise<HeadToHead> {
      return csApiClient.getHeadToHead(teamAId, teamBId, months ?? historyMonths);
    },
    async getH2HFromHltv(teamAId: string, teamBId: string): Promise<HeadToHead> {
      return hltvCrawler.getHeadToHead(teamAId, teamBId);
    },
    lookupTeamInDb(name: string) {
      // Prefer teams with real data (rank > 0 or has players), avoid stub records
      const row = queryOne<{ team_id: string; name: string; rank: number }>(
        `SELECT team_id, name, rank FROM teams
         WHERE LOWER(name) = LOWER(?) COLLATE NOCASE
         ORDER BY (players != '[]' AND players != '') DESC, rank DESC
         LIMIT 1`,
        name,
      );
      return row ? { teamId: row.team_id, name: row.name, rank: row.rank } : null;
    },
    getAllTeamsFromDb() {
      return query<{ team_id: string; name: string; rank: number }>(
        `SELECT team_id, name, rank FROM teams WHERE name != ''`,
      ).map((r) => ({ teamId: r.team_id, name: r.name, rank: r.rank }));
    },
    upsertTeam(team: Team): void {
      llmRepo.upsertTeam({
        teamId: team.teamId,
        name: team.name,
        rank: team.rank,
        region: team.region,
        players: JSON.stringify(team.players),
        recentForm: JSON.stringify(team.recentForm),
        mapPool: JSON.stringify(team.mapPool),
      });
    },
    upsertPlayer(player: Player, source: string): void {
      esportsRepo.upsertPlayer({
        playerId: player.playerId,
        nickname: player.nickname,
        realName: player.name,
        role: player.role,
        rating: player.rating,
        kdRatio: player.kdRatio,
        hsPercent: player.headshotPercent,
        mapsPlayed: player.mapsPlayed,
        source,
      });
    },
    upsertRoster(teamId: string, playerIds: string[]): string {
      return esportsRepo.upsertTeamRoster(teamId, playerIds);
    },
    upsertH2H(teamAId: string, teamBId: string, h2h: HeadToHead): void {
      esportsRepo.upsertHeadToHead(teamAId, teamBId, h2h);
    },
  };
}

export function startCronJobs(): void {
  // Run migrations on startup
  runMigrations();

  // ============================================================
  // Polymarket: Refresh every 30 minutes
  // ============================================================
  cron.schedule('*/30 * * * *', () => {
    void trackTask('polymarket-refresh', {
      name: 'Polymarket 市场刷新',
      category: 'market',
      trigger: 'scheduled',
    }, async (ctx) => {
    logger.info('Cron: Refreshing Polymarket markets');
      const markets = await marketService.refreshMarkets();
      ctx.log(`已刷新 ${markets.length} 个市场`);
      ctx.setProgress(30, '更新比赛状态');

      // Update match states based on scheduled time and market status
      const activeMatches = llmRepo.getActiveMatches();
      let stateUpdates = 0;
      for (const m of activeMatches) {
        const matchId = String(m.match_id ?? '');
        const scheduledAt = String(m.scheduled_at ?? '');
        if (!matchId || !scheduledAt) continue;
        const marketStatus = (String(m.status ?? 'active') === 'settled') ? 'resolved' : 'active';
        const newState = MatchStateMachine.determineState(scheduledAt, marketStatus as 'active' | 'closed' | 'resolved', false);
        const currentStatus = String(m.status ?? '');
        if (newState !== currentStatus && newState !== 'scheduled') {
          llmRepo.updateMatchStatus(matchId, newState);
          stateUpdates++;
        }
      }
      if (stateUpdates > 0) {
        logger.info('Cron: Match states updated', { count: stateUpdates });
      }

      ctx.setProgress(50, '电竞数据 enrich');
      const filterConfig = esportsRepo.getAnalysisFilterConfig();
      const historyMonths = filterConfig.historyMonths;
      const minVolumeUsd = filterConfig.minVolumeUsd;
      const sources = buildEnricherSources(historyMonths);
      let enriched = 0;
      let skipped = 0;
      let skippedLowVolume = 0;
      for (const market of markets) {
        const q = market.question.toLowerCase();
        if (!q.startsWith('counter-strike') && !q.includes('cs2') && !q.includes('csgo')) continue;
        if (market.volume < minVolumeUsd) {
          skippedLowVolume++;
          continue;
        }

        try {
          const result = await enricher.enrich(market, sources, historyMonths);
          if (result.teamA && result.teamB) {
            const matchId = market.conditionId;
            let hltvMatchId: string | null = null;
            try {
              hltvMatchId = await hltvCrawler.findMatchIdByTeams(result.teamA.name, result.teamB.name);
            } catch {
              // best-effort HLTV link
            }
            llmRepo.upsertMatch({
              matchId,
              teamAId: result.teamA.teamId,
              teamBId: result.teamB.teamId,
              teamAName: result.teamA.name,
              teamBName: result.teamB.name,
              eventName: result.parsed.eventName,
              eventType: result.parsed.eventName.toLowerCase().includes('online') ? 'Online' : 'LAN',
              format: result.parsed.format ?? 'BO3',
              scheduledAt: market.endDate || new Date().toISOString(),
              status: 'scheduled',
              maps: [],
              hasTeamData: true,
              hltvMatchId,
              lineups: result.teamA.players.length > 0 && result.teamB.players.length > 0
                ? JSON.stringify({
                    teamA: { players: result.teamA.players.slice(0, 5), isConfirmed: true, hasStandin: false, standinCount: 0, missingKeyPlayers: [] },
                    teamB: { players: result.teamB.players.slice(0, 5), isConfirmed: true, hasStandin: false, standinCount: 0, missingKeyPlayers: [] },
                  })
                : null,
            });
            enriched++;
          } else {
            skipped++;
          }
        } catch (err) {
          logger.warn('Cron: Market enrichment failed', { market: market.question.substring(0, 60), error: (err as Error).message });
        }
      }
      ctx.log(`Enrich 完成: ${enriched} 成功, ${skipped} 跳过, ${skippedLowVolume} 低成交量`);
      ctx.setMetadata({ markets: markets.length, enriched, stateUpdates });
      ctx.setProgress(100);
    });
  });

  // ============================================================
  // Price polling: every minute (replaces removed Polymarket WS)
  // ============================================================
  cron.schedule('* * * * *', () => {
    void trackTask('price-poll', {
      name: '价格轮询',
      category: 'market',
      trigger: 'scheduled',
      silent: true,
    }, async (ctx) => {
      const count = await marketService.pollAndBroadcastPrices(20);
      if (count > 0) ctx.log(`更新了 ${count} 个市场价格`);
      return { updated: count };
    });
  });

  // ============================================================
  // HLTV delayed/postponed detection: every 30 minutes
  // ============================================================
  cron.schedule('*/30 * * * *', () => {
    void trackTask('hltv-delayed-check', {
      name: 'HLTV 延期检测',
      category: 'esports',
      trigger: 'scheduled',
    }, async (ctx) => {
      const activeMatches = llmRepo.getActiveMatches();
      let delayedCount = 0;
      for (const m of activeMatches) {
        const hltvId = m.hltv_match_id ? String(m.hltv_match_id) : null;
        if (!hltvId) continue;
        const status = await hltvCrawler.getMatchLiveStatus(hltvId);
        if (status === 'postponed') {
          const matchId = String(m.match_id ?? '');
          if (matchId && String(m.status ?? '') !== 'delayed') {
            llmRepo.updateMatchStatus(matchId, 'delayed');
            delayedCount++;
          }
        }
      }
      if (delayedCount > 0) ctx.log(`标记 ${delayedCount} 场比赛为延期`);
      return { delayedCount };
    });
  });

  // ============================================================
  // Whale ingestion: Scan Polygon chain every 5 minutes
  // ============================================================
  cron.schedule('*/5 * * * *', () => {
    void trackTask('whale-ingestion', {
      name: '巨鲸链上扫描',
      category: 'whale',
      trigger: 'scheduled',
    }, async (ctx) => {
      const count = await whaleIngestion.scanRecentTrades();
      broadcast('whales', { newTrades: count });
      if (count > 0) {
        ctx.log(`发现 ${count} 笔新交易`);
        const whales = whaleIngestion.getRecentWhales(10);
        for (const whale of whales) {
          const trades = whaleIngestion.getRecentTrades(whale.address, 5);
          for (const trade of trades) {
            if (trade.amount >= 10000) {
              const market = marketRepo.findByConditionId(trade.marketId);
              broadcast('whale-trades', {
                address: whale.address,
                marketId: trade.marketId,
                marketQuestion: market?.question ?? 'Unknown market',
                side: trade.type,
                outcome: trade.outcome,
                size: trade.amount,
                price: trade.price,
                timestamp: trade.timestamp,
              });
            }
          }
        }
      }
      return { newTrades: count };
    });
  });

  // ============================================================
  // Wallet performance: Recalculate win rates hourly
  // ============================================================
  cron.schedule('20 * * * *', () => {
    void trackTask('wallet-performance', {
      name: '钱包胜率重算',
      category: 'whale',
      trigger: 'scheduled',
    }, async (ctx) => {
      const result = await walletPerformance.recalculateAll();
      if (result.addressesUpdated > 0) {
        broadcast('whales', { performanceUpdated: result.addressesUpdated });
        ctx.log(`已更新 ${result.addressesUpdated} 个地址的胜率统计`);
      }
      return result as Record<string, unknown>;
    });
  });

  // ============================================================
  // Copy trade settlement: after markets resolve
  // ============================================================
  cron.schedule('35 * * * *', () => {
    void trackTask('copy-trade-settlement', {
      name: '纸面跟单结算',
      category: 'whale',
      trigger: 'scheduled',
    }, async (ctx) => {
      const result = walletFollow.settleCopyTrades();
      if (result.settled > 0) {
        broadcast('copy-signals', { type: 'copy-trades:settled', settled: result.settled });
        ctx.log(`已结算 ${result.settled} 笔纸面跟单`);
      }
      return result as Record<string, unknown>;
    });
  });

  // ============================================================
  // Arbitrage scanner: Scan every 2 minutes
  // Detects Yes/No price sum < 1 and cross-market spreads,
  // broadcasts opportunities via WebSocket 'arbitrage' channel.
  // ============================================================
  cron.schedule('*/2 * * * *', () => {
    void trackTask('arbitrage-scan', {
      name: '套利扫描',
      category: 'signal',
      trigger: 'scheduled',
      silent: true,
    }, async () => {
      await signalService.scanAndBroadcastArbitrage();
    });
  });

  // ============================================================
  // HLTV: Full pipeline every 2 hours
  // Pipeline:
  //   1. Fetch match list
  //   2. Identify high-profile matches (LAN, 3+ stars, BO5)
  //   3. For high-profile matches, fetch team data + map data
  //   4. Store everything locally in SQLite
  // ============================================================
  cron.schedule('0 */2 * * *', () => {
    void trackTask('esports-pipeline', {
      name: '电竞数据管道',
      category: 'esports',
      trigger: 'scheduled',
    }, async (ctx) => {
    logger.info('Cron: Starting esports data pipeline (CS API + HLTV)');
      const historyMonths = esportsRepo.getAnalysisFilterConfig().historyMonths;
      ctx.setProgress(10, '拉取 CS API 比赛');
      // --- Step 1: CS API (primary) — fetch recent matches ---
      let matches: Array<{ matchId: string; teamAId: string; teamBId: string; teamAName: string; teamBName: string; event: string; eventType: 'LAN' | 'Online'; format: 'BO1' | 'BO3' | 'BO5'; date: string; maps: string[] }> = [];

      try {
        const csMatches = await csApiClient.getMatches(100, historyMonths);
        matches = csMatches.map((m) => ({
          matchId: m.matchId, teamAId: m.teamAId, teamBId: m.teamBId,
          teamAName: m.teamAName, teamBName: m.teamBName,
          event: m.event, eventType: m.eventType, format: m.format,
          date: m.date, maps: m.maps,
        }));
        logger.info('Cron: CS API matches found', { count: matches.length });
      } catch (err) {
        logger.warn('Cron: CS API failed, trying HLTV', { error: (err as Error).message });
      }

      // --- Step 1b: HLTV fallback for upcoming matches (CS API is daily-refresh, no upcoming) ---
      try {
        const hltvMatches = await hltvCrawler.getMatches();
        // Merge: only add HLTV matches not already in CS API results
        const existingIds = new Set(matches.map((m) => m.matchId));
        for (const m of hltvMatches) {
          if (!existingIds.has(m.matchId)) {
            matches.push({
              matchId: m.matchId, teamAId: m.teamAId, teamBId: m.teamBId,
              teamAName: m.teamAName, teamBName: m.teamBName,
              event: m.event, eventType: m.eventType, format: m.format,
              date: m.date, maps: [],
            });
          }
        }
        logger.info('Cron: HLTV matches merged', { hltvCount: hltvMatches.length, total: matches.length });
      } catch (err) {
        logger.warn('Cron: HLTV fetch failed (non-critical)', { error: (err as Error).message });
      }

      // --- Step 2: Store all matches in local DB ---
      for (const m of matches) {
        llmRepo.upsertMatch({
          matchId: m.matchId,
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          teamAName: m.teamAName,
          teamBName: m.teamBName,
          eventName: m.event,
          eventType: m.eventType,
          format: m.format,
          scheduledAt: m.date,
          status: 'upcoming',
          maps: m.maps,
          hasTeamData: false,
        });
      }

      // --- Step 3: Fetch team data for unique teams (CS API first, HLTV fallback) ---
      const teamIds = new Set<string>();
      for (const m of matches.slice(0, 40)) {
        teamIds.add(m.teamAId);
        teamIds.add(m.teamBId);
      }

      logger.info('Cron: Fetching team data', { count: teamIds.size });
      for (const teamId of teamIds) {
        try {
          let team = await csApiClient.getTeam(teamId);
          if (!team) {
            team = await hltvCrawler.getTeam(teamId);
          }
          if (team) {
            llmRepo.upsertTeam({
              teamId: team.teamId,
              name: team.name,
              rank: team.rank,
              region: team.region,
              players: JSON.stringify(team.players),
              recentForm: JSON.stringify(team.recentForm),
              mapPool: JSON.stringify(team.mapPool),
            });
          }
        } catch (err) {
          logger.error('Cron: Team fetch failed', { teamId, error: (err as Error).message });
        }
      }

      ctx.log(`完成: ${matches.length} 场比赛, ${teamIds.size} 支队伍`);
      ctx.setMetadata({ matches: matches.length, teams: teamIds.size });
      ctx.setProgress(100);
    });
  });

  // ============================================================
  // HLTV Rankings: Update every 6 hours
  // ============================================================
  cron.schedule('0 */6 * * *', () => {
    void trackTask('hltv-rankings', {
      name: 'HLTV 排名更新',
      category: 'esports',
      trigger: 'scheduled',
    }, async (ctx) => {
      const historyMonths = esportsRepo.getAnalysisFilterConfig().historyMonths;
      let rankings: Array<{ rank: number; teamId: string; name: string }>;
      try {
        rankings = await csApiClient.getRankings(historyMonths);
        if (rankings.length === 0) throw new Error('CS API returned no rankings');
      } catch {
        rankings = await hltvCrawler.getRankings();
      }
      for (const r of rankings) {
        llmRepo.upsertTeam({
          teamId: r.teamId,
          name: r.name,
          rank: r.rank,
          region: '',
          players: '[]',
          recentForm: '{}',
          mapPool: '{}',
        });
      }
      ctx.log(`更新了 ${rankings.length} 支队伍排名`);
      return { count: rankings.length };
    });
  });

  // ============================================================
  // Daily dashboard: Generate at 00:05 UTC
  // ============================================================
  cron.schedule('5 0 * * *', () => {
    void trackTask('daily-dashboard', {
      name: '每日看板生成',
      category: 'system',
      trigger: 'scheduled',
    }, async (ctx) => {
      const dashboard = await dailyService.refreshDashboard();
      broadcast('daily', dashboard);
      ctx.log(`${dashboard.totalMatches} 场比赛, ${dashboard.highAttentionMatches.length} 条高关注推荐`);
      return { totalMatches: dashboard.totalMatches };
    });
  });

  // ============================================================
  // Daily cleanup: Purge data older than configured history window (00:15 UTC)
  // ============================================================
  cron.schedule('15 0 * * *', () => {
    void trackTask('data-cleanup', {
      name: '历史数据清理',
      category: 'system',
      trigger: 'scheduled',
    }, async (ctx) => {
      const config = esportsRepo.getAnalysisFilterConfig();
      const counts = esportsRepo.cleanupOldData(config.historyMonths);
      ctx.log(`清理 ${config.historyMonths} 个月前的数据`);
      return counts as Record<string, unknown>;
    });
  });

  // ============================================================
  // Settlement check: Every 10 minutes, check for resolved markets
  // ============================================================
  cron.schedule('*/10 * * * *', () => {
    void trackTask('settlement-check', {
      name: '模拟单结算',
      category: 'market',
      trigger: 'scheduled',
      silent: true,
    }, async (ctx) => {
      const pendingBets = llmRepo.getPendingBets();
      const activeIds = [...new Set(pendingBets.map((b: SimulatedBet) => b.matchId))];

      if (activeIds.length === 0) return;

      let settledTotal = 0;
      for (const conditionId of activeIds) {
        try {
          const market = await pmGammaClient.getMarket(conditionId);
          if (!market || market.status !== 'resolved') continue;

          // Determine winner from resolution data
          // Look up match data to get actual team names
          const matchData = llmRepo.getMatch(conditionId);
          let winner: string | undefined;

          if (matchData) {
            const teamAName = matchData.team_a_name as string | undefined;
            const teamBName = matchData.team_b_name as string | undefined;
            // "Yes" = first team (teamA) won, "No" = second team (teamB) won
            winner = market.resolvedOutcome === 'Yes' ? teamAName : teamBName;
          }

          // Fallback: extract from question text for CS2 format
          // "Counter-Strike: TeamA vs TeamB (BO3) - ..."
          if (!winner) {
            const question = market.question ?? '';
            const vsMatch = question.match(/:\s*(.+?)\s+vs\s+(.+?)(?:\s*\(|\s*-\s|$)/i);
            if (vsMatch) {
              winner = market.resolvedOutcome === 'Yes' ? vsMatch[1].trim() : vsMatch[2].trim();
            }
          }

          if (!winner) continue;

          const result = await settlementEngine.settleMarket(
            conditionId,
            winner,
            market.resolvedPrice ?? 1.0,
            async (mid) => llmRepo.getBetsByMatch(mid),
            async (provider, stats) => {
              // Merge with existing stats instead of overwriting
              const existing = llmRepo.getStats(provider);
              if (existing) {
                const mergedPredictions = (Number(existing.totalPredictions) || 0) + (stats.totalPredictions || 0);
                const mergedCorrect = (Number(existing.correctPredictions) || 0) + (stats.correctPredictions || 0);
                const mergedPnl = (Number(existing.profitLoss) || 0) + (stats.profitLoss || 0);
                llmRepo.upsertStats({
                  provider,
                  model: stats.model ?? 'default',
                  totalPredictions: mergedPredictions,
                  correctPredictions: mergedCorrect,
                  accuracy: mergedPredictions > 0 ? mergedCorrect / mergedPredictions : 0,
                  profitLoss: mergedPnl,
                  roi: mergedPredictions > 0 ? mergedPnl / (mergedPredictions * 100) : 0,
                  calibrationError: stats.calibrationError ?? 0,
                  averageConfidence: existing.averageConfidence ?? 0,
                  sharpeRatio: existing.sharpeRatio ?? 0,
                  maxDrawdown: existing.maxDrawdown ?? 0,
                  lastUpdated: stats.lastUpdated,
                });
              } else {
                llmRepo.upsertStats({ ...stats, provider });
              }
            },
            async (bet) => llmRepo.upsertBet(bet),
          );

          if (result.settledCount > 0) {
            settledTotal += result.settledCount;
            logger.info('Cron: Settlement processed', { conditionId, settledCount: result.settledCount, winner });

            // Update match state to 'settled' via state machine
            llmRepo.updateMatchStatus(conditionId, 'settled');

            // Broadcast with fields matching frontend SettlementEvent interface
            broadcast('settlement', {
              marketId: conditionId,
              question: market.question ?? '',
              outcome: winner,
              pnl: result.providerResults.reduce((s, r) => s + r.pnl, 0),
              settledCount: result.settledCount,
            });
          }
        } catch {
          // Individual market check failure is non-critical
        }
      }
      if (settledTotal > 0) ctx.log(`结算 ${settledTotal} 笔模拟单`);
    });
  });

  // ============================================================
  // LLM Auto-Analysis: Check every 15 minutes for matches starting soon
  // Triggers LLM analysis for matches starting within 30 minutes
  // that haven't been analyzed yet
  // ============================================================
  cron.schedule('*/15 * * * *', () => {
    void trackTask('llm-auto-analysis', {
      name: 'LLM 自动分析',
      category: 'ai',
      trigger: 'scheduled',
    }, async (ctx) => {
      const upcoming = llmRepo.getUpcomingMatches(50);
      const now = Date.now();

      // Prune analyzed matches older than 24h to bound memory growth
      for (const [id, ts] of analyzedMatches) {
        if (now - ts > 24 * 60 * 60 * 1000) analyzedMatches.delete(id);
      }

      // Hoist config check out of the loop — provider config does not change per-match
      const configs = llmRepo.getAllConfigs();
      const enabledCount = configs.filter((c: { isEnabled: boolean; apiKey: string }) => c.isEnabled && c.apiKey).length;

      let analyzedCount = 0;
      for (const match of upcoming as Array<Record<string, unknown>>) {
        const matchId = match.match_id as string;
        const teamAId = match.team_a_id as string;
        const teamBId = match.team_b_id as string;
        const teamAName = match.team_a_name as string;
        const teamBName = match.team_b_name as string;
        const hasTeamData = match.has_team_data as boolean;
        const scheduledAt = match.scheduled_at as string | null;

        if (!hasTeamData) continue;

        const scheduledTime = scheduledAt ? new Date(scheduledAt).getTime() : 0;
        if (scheduledTime === 0) continue;

        const matchState = MatchStateMachine.determineState(scheduledAt!, 'active', false);
        const freqs = MatchStateMachine.getUpdateFrequencies(matchState);

        if (matchState !== 'scheduled' && matchState !== 'pre_match') continue;
        if (freqs.llm === 0) continue;

        const lastAnalyzed = analyzedMatches.get(matchId);
        if (lastAnalyzed && freqs.llm > 0 && now - lastAnalyzed < freqs.llm * 1000) {
          continue;
        }

        if (enabledCount === 0) continue;

        const timeUntilStart = scheduledTime - now;
        logger.info('Cron: Auto-analyzing match', {
          match: `${teamAName} vs ${teamBName}`,
          state: matchState,
          startsInMin: Math.round(timeUntilStart / 60000),
        });

        try {
          const aggregation = await aiConfigService.analyze(matchId, teamAId, teamBId);
          analyzedMatches.set(matchId, now);

          // Broadcast analysis result to frontend
          broadcast('analysis', {
            matchId,
            teamA: teamAName,
            teamB: teamBName,
            aggregation,
            providerCount: aggregation.results.length,
          });

          logger.info('Cron: Auto-analysis complete', { match: `${teamAName} vs ${teamBName}`, providers: aggregation.results.length });
          analyzedCount++;
          ctx.log(`已分析: ${teamAName} vs ${teamBName}`);
        } catch (err) {
          logger.error('Cron: Auto-analysis failed', { matchId, error: (err as Error).message });
        }
      }
      return { analyzedCount, candidates: upcoming.length };
    });
  });

  // ============================================================
  // Initial run: Execute immediately on startup
  // ============================================================
  logger.info('Cron: Running initial data fetch');
  setTimeout(() => {
    void trackTask('startup-init', {
      name: '启动初始化',
      category: 'system',
      trigger: 'startup',
    }, async (ctx) => {
      ctx.setProgress(10, '加载 Polymarket 市场');
      const markets = await marketService.refreshMarkets();
      ctx.log(`已加载 ${markets.length} 个市场`);
      ctx.setProgress(40, '加载电竞数据');
      const historyMonths = esportsRepo.getAnalysisFilterConfig().historyMonths;
      let matchesLoaded = 0;
      let teamsLoaded = 0;
      try {
        const csMatches = await csApiClient.getMatches(100, historyMonths);
        for (const m of csMatches) {
          llmRepo.upsertMatch({
            matchId: m.matchId,
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            teamAName: m.teamAName,
            teamBName: m.teamBName,
            eventName: m.event,
            eventType: m.eventType,
            format: m.format,
            scheduledAt: m.date,
            status: 'finished',
            maps: m.maps,
            hasTeamData: true,
          });
        }
        matchesLoaded = csMatches.length;
        const teamIds = new Set<string>();
        for (const m of csMatches.slice(0, 30)) {
          teamIds.add(m.teamAId);
          teamIds.add(m.teamBId);
        }
        for (const teamId of teamIds) {
          try {
            const team = await csApiClient.getTeam(teamId);
            if (team) {
              llmRepo.upsertTeam({
                teamId: team.teamId,
                name: team.name,
                rank: team.rank,
                region: team.region,
                players: JSON.stringify(team.players),
                recentForm: JSON.stringify(team.recentForm),
                mapPool: JSON.stringify(team.mapPool),
              });
              teamsLoaded++;
            }
          } catch { /* best-effort */ }
        }
      } catch (err) {
        ctx.log(`CS API 失败: ${(err as Error).message}`, 'warn');
      }

      if (matchesLoaded === 0) {
        const hltvMatches = await hltvCrawler.getMatches();
        for (const m of hltvMatches) {
          llmRepo.upsertMatch({
            matchId: m.matchId,
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            teamAName: m.teamAName,
            teamBName: m.teamBName,
            eventName: m.event,
            eventType: m.eventType,
            format: m.format,
            scheduledAt: m.date,
            status: 'upcoming',
            maps: [],
            hasTeamData: false,
          });
        }
        matchesLoaded = hltvMatches.length;
      }
      ctx.log(`电竞数据: ${matchesLoaded} 场, ${teamsLoaded} 队`);

      ctx.setProgress(80, '预热缓存');
      const topMarkets = await marketService.getMarkets(20, 0);
      for (const market of topMarkets.slice(0, 5)) {
        try {
          await marketService.getOrderBook(market.conditionId);
        } catch { /* non-critical */ }
      }
      llmRepo.getTopTeams(10);
      ctx.setProgress(100);
      return { markets: markets.length, matchesLoaded, teamsLoaded };
    });
  }, 2000);

  // Cleanup Playwright browser on process exit
  process.on('beforeExit', () => {
    closeBrowser().catch(() => { /* ignore */ });
  });

  logger.info('Cron: All scheduled jobs started');
}
