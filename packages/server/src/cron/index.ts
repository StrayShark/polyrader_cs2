import cron from 'node-cron';
import { MarketService } from '../services/market-service';
import { DailyService } from '../services/daily-service';
import { AiConfigService } from '../services/ai-config-service';
import { HLTVCrawler, PolymarketWsClient, PolymarketGammaClient, MarketRepository } from '@polyrader/infra';
import { LLMRepository } from '@polyrader/infra';
import { runMigrations } from '@polyrader/infra';
import { SettlementEngine, MatchStateMachine } from '@polyrader/core';
import type { SimulatedBet } from '@polyrader/core';
import { WhaleIngestionService } from '../services/whale-ingestion-service';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

const marketService = new MarketService();
const dailyService = new DailyService();
const aiConfigService = new AiConfigService();
const hltvCrawler = new HLTVCrawler();
const llmRepo = new LLMRepository();
const marketRepo = new MarketRepository();
const pmWsClient = new PolymarketWsClient();
const pmGammaClient = new PolymarketGammaClient();
const settlementEngine = new SettlementEngine();
const whaleIngestion = new WhaleIngestionService();

// Track which matches have already been auto-analyzed to avoid duplicates
const analyzedMatches = new Map<string, number>(); // matchId → timestamp
// Track WS unsubscribe functions to avoid handler accumulation across cron runs
const wsUnsubscribers = new Map<string, () => void>();

export function startCronJobs(): void {
  // Run migrations on startup
  runMigrations();

  // ============================================================
  // Polymarket: Refresh every 30 minutes
  // ============================================================
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Cron: Refreshing Polymarket markets');
    try {
      const markets = await marketService.refreshMarkets();
      logger.info('Cron: Polymarket markets refreshed', { count: markets.length });

      // Subscribe to WS price updates for active markets
      for (const market of markets.slice(0, 20)) {
        // Polymarket WS expects an assetId/clobTokenId, not a conditionId
        const tokenId = market.clobTokenIds?.[0];
        if (!tokenId) continue;
        try {
          // Unsubscribe old handler if exists to avoid accumulation across cron runs
          const oldUnsub = wsUnsubscribers.get(market.conditionId);
          if (oldUnsub) oldUnsub();
          const unsub = pmWsClient.subscribeMarket(tokenId, (price: number, timestamp: string) => {
            // Broadcast to market-specific channel (frontend TickerBar subscribes to this)
            broadcast(`prices:${market.conditionId}`, { price, timestamp });
            // Also broadcast to generic prices channel
            broadcast('prices', { marketId: market.conditionId, price, timestamp });
          });
          wsUnsubscribers.set(market.conditionId, unsub);
        } catch {
          // Subscription failure is non-critical
        }
      }
      logger.info('Cron: Polymarket WS subscribed', { count: Math.min(markets.length, 20) });
    } catch (err) {
      logger.error('Cron: Polymarket refresh failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // Whale ingestion: Scan Polygon chain every 5 minutes
  // ============================================================
  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await whaleIngestion.scanRecentTrades();
      broadcast('whales', { newTrades: count });
      if (count > 0) {
        logger.info('Cron: Whale ingestion trades found', { count });

        // Broadcast individual large trades to whale-trades channel
        // (frontend useWhaleAlerts hook subscribes to this for toast notifications)
        const whales = whaleIngestion.getRecentWhales(10);
        for (const whale of whales) {
          const trades = whaleIngestion.getRecentTrades(whale.address, 5);
          for (const trade of trades) {
            if (trade.amount >= 10000) {
              // Find market question from local DB
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
    } catch (err) {
      logger.error('Cron: Whale ingestion failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // HLTV: Full pipeline every 2 hours
  // Pipeline:
  //   1. Fetch match list
  //   2. Identify high-profile matches (LAN, 3+ stars, BO5)
  //   3. For high-profile matches, fetch team data + map data
  //   4. Store everything locally in SQLite
  // ============================================================
  cron.schedule('0 */2 * * *', async () => {
    logger.info('Cron: Starting HLTV data pipeline');
    try {
      // Step 1: Fetch all upcoming matches
      const matches = await hltvCrawler.getMatches();
      logger.info('Cron: HLTV matches found', { count: matches.length });

      // Step 2: Store all matches in local DB
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
          maps: [],
          hasTeamData: false,
        });
      }

      // Step 3: Identify high-profile matches
      const highProfile = hltvCrawler.getHighProfileMatches(matches);
      logger.info('Cron: HLTV high-profile matches', { count: highProfile.length });

      // Step 4: For each high-profile match, fetch detailed team data
      const teamIds = new Set<string>();
      for (const m of highProfile) {
        teamIds.add(m.teamAId);
        teamIds.add(m.teamBId);
      }

      logger.info('Cron: HLTV fetching team data', { count: teamIds.size });
      for (const teamId of teamIds) {
        try {
          const team = await hltvCrawler.getTeam(teamId);
          llmRepo.upsertTeam({
            teamId: team.teamId,
            name: team.name,
            rank: team.rank,
            region: team.region,
            players: JSON.stringify(team.players),
            recentForm: JSON.stringify(team.recentForm),
            mapPool: JSON.stringify(team.mapPool),
          });
          logger.info('Cron: HLTV team data saved', { team: team.name, rank: team.rank });
        } catch (err) {
          logger.error('Cron: HLTV team fetch failed', { teamId, error: (err as Error).message });
        }
      }

      // Step 5: Fetch match details (maps + lineups) for high-profile matches
      for (const m of highProfile) {
        try {
          const detail = await hltvCrawler.getMatchDetail(m.matchId);

          // Also try to get lineup data
          let lineups: string | null = null;
          try {
            const lu = await hltvCrawler.getMatchLineups(m.matchId);
            if (lu) lineups = JSON.stringify(lu);
          } catch {
            // lineup fetch is best-effort
          }

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
            maps: detail.maps,
            hasTeamData: true,
            lineups,
          });
          logger.info('Cron: HLTV match detail saved', { match: `${m.teamAName} vs ${m.teamBName}`, maps: detail.maps.join(', '), lineups: !!lineups });
        } catch (err) {
          logger.error('Cron: HLTV match detail fetch failed', { matchId: m.matchId, error: (err as Error).message });
        }
      }

      logger.info('Cron: HLTV pipeline completed');
    } catch (err) {
      logger.error('Cron: HLTV pipeline failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // HLTV Rankings: Update every 6 hours
  // ============================================================
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Cron: Updating HLTV rankings');
    try {
      const rankings = await hltvCrawler.getRankings();
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
      logger.info('Cron: HLTV rankings updated', { count: rankings.length });
    } catch (err) {
      logger.error('Cron: HLTV rankings update failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // Daily dashboard: Generate at 00:05 UTC
  // ============================================================
  cron.schedule('5 0 * * *', async () => {
    logger.info('Cron: Generating daily dashboard');
    try {
      const dashboard = await dailyService.refreshDashboard();
      logger.info('Cron: Daily dashboard generated', { totalMatches: dashboard.totalMatches, recommendations: dashboard.highAttentionMatches.length });
      broadcast('daily', dashboard);
    } catch (err) {
      logger.error('Cron: Daily dashboard generation failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // Settlement check: Every 10 minutes, check for resolved markets
  // ============================================================
  cron.schedule('*/10 * * * *', async () => {
    try {
      // Get all active market IDs with pending bets
      const pendingBets = llmRepo.getPendingBets();
      const activeIds = [...new Set(pendingBets.map((b: SimulatedBet) => b.matchId))];

      if (activeIds.length === 0) return;

      for (const conditionId of activeIds) {
        try {
          // Check Polymarket Gamma API for resolution
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
            logger.info('Cron: Settlement processed', { conditionId, settledCount: result.settledCount, winner });

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
    } catch (err) {
      logger.error('Cron: Settlement check failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // LLM Auto-Analysis: Check every 15 minutes for matches starting soon
  // Triggers LLM analysis for matches starting within 30 minutes
  // that haven't been analyzed yet
  // ============================================================
  cron.schedule('*/15 * * * *', async () => {
    try {
      const upcoming = llmRepo.getUpcomingMatches(50);
      const now = Date.now();

      // Prune analyzed matches older than 24h to bound memory growth
      for (const [id, ts] of analyzedMatches) {
        if (now - ts > 24 * 60 * 60 * 1000) analyzedMatches.delete(id);
      }

      // Hoist config check out of the loop — provider config does not change per-match
      const configs = llmRepo.getAllConfigs();
      const enabledCount = configs.filter((c: { isEnabled: boolean; apiKey: string }) => c.isEnabled && c.apiKey).length;

      for (const match of upcoming as Array<Record<string, unknown>>) {
        const matchId = match.match_id as string;
        const teamAId = match.team_a_id as string;
        const teamBId = match.team_b_id as string;
        const teamAName = match.team_a_name as string;
        const teamBName = match.team_b_name as string;
        const hasTeamData = match.has_team_data as boolean;
        const scheduledAt = match.scheduled_at as string | null;

        // Skip already analyzed matches (within 24h)
        if (analyzedMatches.has(matchId)) {
          const age = now - analyzedMatches.get(matchId)!;
          if (age < 24 * 60 * 60 * 1000) continue;
        }

        // Skip matches without team data
        if (!hasTeamData) continue;

        // Use MatchStateMachine to determine the correct state
        const scheduledTime = scheduledAt ? new Date(scheduledAt).getTime() : 0;
        if (scheduledTime === 0) continue;

        const matchState = MatchStateMachine.determineState(scheduledAt!, 'active', false);
        const freqs = MatchStateMachine.getUpdateFrequencies(matchState);

        // Only analyze matches in scheduled or pre_match state
        // (LLM analysis is paused for live/finished/settled/cancelled)
        if (matchState !== 'scheduled' && matchState !== 'pre_match') continue;
        if (freqs.llm === 0) continue;

        // Skip if no LLM providers are configured
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
        } catch (err) {
          logger.error('Cron: Auto-analysis failed', { matchId, error: (err as Error).message });
        }
      }
    } catch (err) {
      logger.error('Cron: LLM auto-analysis check failed', { error: (err as Error).message });
    }
  });

  // ============================================================
  // Initial run: Execute immediately on startup
  // ============================================================
  logger.info('Cron: Running initial data fetch');
  setTimeout(async () => {
    try {
      // Fetch Polymarket markets
      const markets = await marketService.refreshMarkets();
      logger.info('Cron: Initial markets loaded', { count: markets.length });

      // Also fetch HLTV data on startup (don't wait for the 2h cycle)
      logger.info('Cron: Initial HLTV fetch starting');
      try {
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

        // Fetch team data for high-profile matches
        const highProfile = hltvCrawler.getHighProfileMatches(hltvMatches);
        const teamIds = new Set<string>();
        for (const m of highProfile) {
          teamIds.add(m.teamAId);
          teamIds.add(m.teamBId);
        }
        for (const teamId of teamIds) {
          try {
            const team = await hltvCrawler.getTeam(teamId);
            llmRepo.upsertTeam({
              teamId: team.teamId,
              name: team.name,
              rank: team.rank,
              region: team.region,
              players: JSON.stringify(team.players),
              recentForm: JSON.stringify(team.recentForm),
              mapPool: JSON.stringify(team.mapPool),
            });
          } catch {
            // Team fetch failure is non-critical
          }
        }
        logger.info('Cron: Initial HLTV data loaded', { matches: hltvMatches.length, teams: teamIds.size });
      } catch (err) {
        logger.error('Cron: Initial HLTV fetch failed', { error: (err as Error).message });
      }
    } catch (err) {
      logger.error('Cron: Initial market fetch failed', { error: (err as Error).message });
    }

    // Cache prewarming: preload TOP markets and their orderbooks
    logger.info('Cron: Prewarming caches');
    try {
      const topMarkets = await marketService.getMarkets(20, 0);
      // Preload orderbook for top 5 markets (most likely to be viewed)
      for (const market of topMarkets.slice(0, 5)) {
        try {
          await marketService.getOrderBook(market.conditionId);
        } catch {
          // Orderbook preload failure is non-critical
        }
      }
      // Preload TOP teams cache
      const topTeams = llmRepo.getTopTeams(10);
      logger.info('Cron: Cache prewarmed', { markets: topMarkets.length, orderbooks: 5, teams: topTeams.length });
    } catch (err) {
      logger.error('Cron: Cache prewarming failed', { error: (err as Error).message });
    }
  }, 2000);

  // ============================================================
  // Polymarket WebSocket: Real-time price streaming
  // ============================================================
  pmWsClient.connect();

  // Subscribe to asset price updates and broadcast to WS clients
  // Asset IDs are discovered dynamically from active markets during refresh
  logger.info('Cron: Polymarket WebSocket connected for real-time prices');

  logger.info('Cron: All scheduled jobs started');
}
