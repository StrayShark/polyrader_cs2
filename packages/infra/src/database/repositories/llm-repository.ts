import { query, queryOne } from '../connection';
import type { LLMConfig, LLMStats, SimulatedBet, LLMProvider, PromptVariant, LLMAnalysisResult, EquityCurvePoint } from '@polyrader/core';

export class LLMRepository {
  // --- LLM Config ---
  getConfig(provider: LLMProvider): LLMConfig | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM llm_configs WHERE provider = ?`,
      provider,
    );
    return row ? this.mapConfig(row) : null;
  }

  getAllConfigs(): LLMConfig[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM llm_configs ORDER BY provider`,
    );
    return rows.map(this.mapConfig);
  }

  upsertConfig(config: LLMConfig): void {
    query(
      `INSERT INTO llm_configs (provider, model, api_key, is_enabled, is_connected, last_tested_at, quota_used, quota_limit, cost_estimate, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET
         model = excluded.model,
         api_key = excluded.api_key,
         is_enabled = excluded.is_enabled,
         is_connected = excluded.is_connected,
         last_tested_at = excluded.last_tested_at,
         quota_used = excluded.quota_used,
         quota_limit = excluded.quota_limit,
         cost_estimate = excluded.cost_estimate,
         updated_at = datetime('now')`,
      config.provider,
      config.model,
      config.apiKey,
      config.isEnabled ? 1 : 0,
      config.isConnected ? 1 : 0,
      config.lastTestedAt ?? null,
      config.quotaUsed,
      config.quotaLimit,
      config.costEstimate,
    );
  }

  // --- LLM Stats ---
  getStats(provider: LLMProvider): LLMStats | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM llm_stats WHERE provider = ?`,
      provider,
    );
    return row ? this.mapStats(row) : null;
  }

  getAllStats(): LLMStats[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM llm_stats ORDER BY accuracy DESC`,
    );
    return rows.map(this.mapStats);
  }

  upsertStats(stats: LLMStats): void {
    query(
      `INSERT INTO llm_stats (provider, model, total_predictions, correct_predictions, accuracy, average_confidence, calibration_error, profit_loss, roi, sharpe_ratio, max_drawdown, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         model = excluded.model,
         total_predictions = excluded.total_predictions,
         correct_predictions = excluded.correct_predictions,
         accuracy = excluded.accuracy,
         average_confidence = excluded.average_confidence,
         calibration_error = excluded.calibration_error,
         profit_loss = excluded.profit_loss,
         roi = excluded.roi,
         sharpe_ratio = excluded.sharpe_ratio,
         max_drawdown = excluded.max_drawdown,
         last_updated = excluded.last_updated`,
      stats.provider,
      stats.model,
      stats.totalPredictions,
      stats.correctPredictions,
      stats.accuracy,
      stats.averageConfidence,
      stats.calibrationError,
      stats.profitLoss,
      stats.roi,
      stats.sharpeRatio,
      stats.maxDrawdown,
      stats.lastUpdated,
    );
  }

  // --- Simulated Bets ---
  getBets(limit = 100): SimulatedBet[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets ORDER BY placed_at DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapBet);
  }

  getBetsByProvider(provider: LLMProvider, limit = 50): SimulatedBet[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets WHERE provider = ? ORDER BY placed_at DESC LIMIT ?`,
      provider,
      limit,
    );
    return rows.map(this.mapBet);
  }

  getEquityCurveByProvider(provider: LLMProvider, initialCapital: number): EquityCurvePoint[] {
    const rows = query<Record<string, unknown>>(
      `SELECT placed_at, profit_loss, settled_at, result FROM simulated_bets
       WHERE provider = ? AND result != 'pending'
       ORDER BY settled_at ASC`,
      provider,
    );
    let cumulative = 0;
    return rows.map((row) => {
      const pnl = Number(row.profit_loss) || 0;
      cumulative += pnl;
      return {
        timestamp: String(row.settled_at ?? row.placed_at),
        cumulativePnl: Math.round(cumulative * 100) / 100,
        equity: Math.round((initialCapital + cumulative) * 100) / 100,
        provider,
      };
    });
  }

  getBetsByProviders(providers: LLMProvider[], limit = 500): SimulatedBet[] {
    if (providers.length === 0) return [];
    const placeholders = providers.map(() => '?').join(',');
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets WHERE provider IN (${placeholders}) ORDER BY placed_at DESC LIMIT ?`,
      ...providers, limit,
    );
    return rows.map(this.mapBet);
  }

  getPendingBets(): SimulatedBet[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets WHERE result = 'pending' ORDER BY placed_at ASC`,
    );
    return rows.map(this.mapBet);
  }

  getBetsByMatch(matchId: string): SimulatedBet[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets WHERE match_id = ? ORDER BY placed_at ASC`,
      matchId,
    );
    return rows.map(this.mapBet);
  }

  upsertBet(bet: SimulatedBet): void {
    query(
      `INSERT INTO simulated_bets (id, match_id, provider, team, amount, odds, result, profit_loss, placed_at, settled_at, reasoning, variant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         result = excluded.result,
         profit_loss = excluded.profit_loss,
         settled_at = excluded.settled_at,
         reasoning = excluded.reasoning,
         variant_id = excluded.variant_id`,
      bet.id,
      bet.matchId,
      bet.provider,
      bet.team,
      bet.amount,
      bet.odds,
      bet.result,
      bet.profitLoss,
      bet.placedAt,
      bet.settledAt ?? null,
      bet.reasoning ?? '',
      bet.variantId ?? 'baseline',
    );
  }

  getBetById(id: string): SimulatedBet | null {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM simulated_bets WHERE id = ?`,
      id,
    );
    return rows.length > 0 ? this.mapBet(rows[0]) : null;
  }

  deleteBet(id: string): void {
    query(`DELETE FROM simulated_bets WHERE id = ?`, id);
  }

  // --- Match/Team local cache ---
  upsertMatch(match: {
    matchId: string;
    teamAId: string;
    teamBId: string;
    teamAName: string;
    teamBName: string;
    eventName: string;
    eventType: string;
    format: string;
    scheduledAt: string;
    status: string;
    maps: string[];
    hasTeamData: boolean;
    lineups?: string | null;
  }): void {
    query(
      `INSERT INTO matches (match_id, team_a_id, team_b_id, team_a_name, team_b_name, event_name, event_type, format, scheduled_at, status, maps, has_team_data, lineups, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(match_id) DO UPDATE SET
         team_a_name = excluded.team_a_name,
         team_b_name = excluded.team_b_name,
         event_name = excluded.event_name,
         event_type = excluded.event_type,
         format = excluded.format,
         scheduled_at = excluded.scheduled_at,
         status = excluded.status,
         maps = excluded.maps,
         has_team_data = excluded.has_team_data,
         lineups = COALESCE(excluded.lineups, matches.lineups),
         updated_at = datetime('now')`,
      match.matchId,
      match.teamAId,
      match.teamBId,
      match.teamAName,
      match.teamBName,
      match.eventName,
      match.eventType,
      match.format,
      match.scheduledAt,
      match.status,
      JSON.stringify(match.maps),
      match.hasTeamData ? 1 : 0,
      match.lineups ?? null,
    );
  }

  upsertTeam(team: {
    teamId: string;
    name: string;
    rank: number;
    region: string;
    players: string;
    recentForm: string;
    mapPool: string;
  }): void {
    query(
      `INSERT INTO teams (team_id, name, rank, region, players, recent_form, map_pool, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(team_id) DO UPDATE SET
         name = excluded.name,
         rank = excluded.rank,
         region = excluded.region,
         players = excluded.players,
         recent_form = excluded.recent_form,
         map_pool = excluded.map_pool,
         updated_at = datetime('now')`,
      team.teamId,
      team.name,
      team.rank,
      team.region,
      team.players,
      team.recentForm,
      team.mapPool,
    );
  }

  getUpcomingMatches(limit = 50): Array<Record<string, unknown>> {
    return query<Record<string, unknown>>(
      `SELECT * FROM matches WHERE status = 'upcoming' ORDER BY scheduled_at ASC LIMIT ?`,
      limit,
    );
  }

  getMatch(matchId: string): Record<string, unknown> | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM matches WHERE match_id = ?`,
      matchId,
    );
    if (!row) return null;
    return {
      ...row,
      maps: row.maps ? JSON.parse(row.maps as string) : [],
      lineups: row.lineups as string | null,
    };
  }

  getMatchesNeedingTeamData(limit = 10): Array<Record<string, unknown>> {
    return query<Record<string, unknown>>(
      `SELECT * FROM matches WHERE status = 'upcoming' AND has_team_data = 0 ORDER BY scheduled_at ASC LIMIT ?`,
      limit,
    );
  }

  getTeam(teamId: string): Record<string, unknown> | null {
    return queryOne<Record<string, unknown>>(
      `SELECT * FROM teams WHERE team_id = ?`,
      teamId,
    ) ?? null;
  }

  getTopTeams(limit = 10): Array<Record<string, unknown>> {
    return query<Record<string, unknown>>(
      `SELECT * FROM teams ORDER BY rank ASC LIMIT ?`,
      limit,
    );
  }

  // --- Prompt Variants (A/B testing) ---
  getVariant(variantId: string): PromptVariant | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM prompt_variants WHERE variant_id = ?`,
      variantId,
    );
    return row ? this.mapVariant(row) : null;
  }

  getAllVariants(): PromptVariant[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM prompt_variants ORDER BY created_at ASC`,
    );
    return rows.map((r) => this.mapVariant(r));
  }

  getEnabledVariants(): PromptVariant[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM prompt_variants WHERE is_enabled = 1 ORDER BY traffic_weight DESC`,
    );
    return rows.map((r) => this.mapVariant(r));
  }

  upsertVariant(variant: Partial<PromptVariant> & { variantId: string }): void {
    query(
      `INSERT INTO prompt_variants (variant_id, name, system_prompt, context_template, output_schema, is_enabled, traffic_weight, is_control, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(variant_id) DO UPDATE SET
         name = excluded.name,
         system_prompt = excluded.system_prompt,
         context_template = excluded.context_template,
         output_schema = excluded.output_schema,
         is_enabled = excluded.is_enabled,
         traffic_weight = excluded.traffic_weight,
         is_control = excluded.is_control,
         notes = excluded.notes,
         updated_at = datetime('now')`,
      variant.variantId,
      variant.name ?? '',
      variant.systemPrompt ?? '',
      variant.contextTemplate ?? '',
      variant.outputSchema ?? '',
      (variant.isEnabled ?? true) ? 1 : 0,
      Number.isFinite(variant.trafficWeight) ? variant.trafficWeight : 1.0,
      (variant.isControl ?? false) ? 1 : 0,
      variant.notes ?? '',
    );
  }

  deleteVariant(variantId: string): void {
    query(
      `DELETE FROM prompt_variants WHERE variant_id = ? AND is_control = 0`,
      variantId,
    );
  }

  insertAnalysis(matchId: string, result: LLMAnalysisResult, variantId?: string): void {
    query(
      `INSERT INTO llm_analyses (match_id, provider, model, team_a_prob, team_b_prob, confidence, reasoning, key_factors, risk_assessment, latency, token_usage, error, variant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      matchId,
      result.provider,
      result.model,
      result.winProbability.teamA,
      result.winProbability.teamB,
      result.confidence,
      result.reasoning,
      JSON.stringify(result.keyFactors),
      result.riskAssessment,
      result.latency,
      JSON.stringify(result.tokenUsage),
      result.error ?? null,
      variantId ?? 'baseline',
    );
  }

  // --- A/B variant comparison stats ---
  getVariantStats(variantId: string): {
    totalAnalyses: number;
    totalBets: number;
    wonBets: number;
    lostBets: number;
    pendingBets: number;
    profitLoss: number;
    roi: number;
    accuracy: number;
  } {
    const analysisRow = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM llm_analyses WHERE variant_id = ?`,
      variantId,
    );
    const totalAnalyses = Number.isFinite(analysisRow?.total) ? Number(analysisRow!.total) : 0;

    const betRow = queryOne<{
      total_bets: number;
      won_bets: number;
      lost_bets: number;
      pending_bets: number;
      profit_loss: number;
      total_staked: number;
    }>(
      `SELECT
         COUNT(*) as total_bets,
         SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as won_bets,
         SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as lost_bets,
         SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) as pending_bets,
         COALESCE(SUM(profit_loss), 0) as profit_loss,
         COALESCE(SUM(amount), 0) as total_staked
       FROM simulated_bets WHERE variant_id = ?`,
      variantId,
    );

    const totalBets = Number.isFinite(betRow?.total_bets) ? Number(betRow!.total_bets) : 0;
    const wonBets = Number.isFinite(betRow?.won_bets) ? Number(betRow!.won_bets) : 0;
    const lostBets = Number.isFinite(betRow?.lost_bets) ? Number(betRow!.lost_bets) : 0;
    const pendingBets = Number.isFinite(betRow?.pending_bets) ? Number(betRow!.pending_bets) : 0;
    const profitLoss = Number.isFinite(betRow?.profit_loss) ? Number(betRow!.profit_loss) : 0;
    const totalStaked = Number.isFinite(betRow?.total_staked) ? Number(betRow!.total_staked) : 0;

    const settledBets = wonBets + lostBets;
    const accuracy = settledBets > 0 ? wonBets / settledBets : 0;
    const roi = totalStaked > 0 ? profitLoss / totalStaked : 0;

    return {
      totalAnalyses,
      totalBets,
      wonBets,
      lostBets,
      pendingBets,
      profitLoss,
      roi,
      accuracy,
    };
  }

  // --- Mappers ---
  private mapConfig(row: Record<string, unknown>): LLMConfig {
    return {
      provider: row.provider as LLMProvider,
      model: row.model as string,
      apiKey: row.api_key as string,
      isEnabled: !!row.is_enabled,
      isConnected: !!row.is_connected,
      lastTestedAt: row.last_tested_at as string | undefined,
      quotaUsed: row.quota_used as number,
      quotaLimit: row.quota_limit as number,
      costEstimate: row.cost_estimate as number,
    };
  }

  private mapStats(row: Record<string, unknown>): LLMStats {
    return {
      provider: row.provider as LLMProvider,
      model: row.model as string,
      totalPredictions: row.total_predictions as number,
      correctPredictions: row.correct_predictions as number,
      accuracy: row.accuracy as number,
      averageConfidence: row.average_confidence as number,
      calibrationError: row.calibration_error as number,
      profitLoss: row.profit_loss as number,
      roi: row.roi as number,
      sharpeRatio: row.sharpe_ratio as number,
      maxDrawdown: row.max_drawdown as number,
      lastUpdated: row.last_updated as string,
    };
  }

  private mapBet(row: Record<string, unknown>): SimulatedBet {
    return {
      id: row.id as string,
      matchId: row.match_id as string,
      provider: row.provider as LLMProvider,
      team: row.team as string,
      amount: row.amount as number,
      odds: row.odds as number,
      result: row.result as SimulatedBet['result'],
      profitLoss: row.profit_loss as number,
      placedAt: row.placed_at as string,
      settledAt: row.settled_at as string | undefined,
      reasoning: (row.reasoning as string) ?? undefined,
      variantId: (row.variant_id as string) ?? undefined,
    };
  }

  private mapVariant(row: Record<string, unknown>): PromptVariant {
    return {
      variantId: row.variant_id as string,
      name: row.name as string,
      systemPrompt: row.system_prompt as string,
      contextTemplate: (row.context_template as string) ?? '',
      outputSchema: (row.output_schema as string) ?? '',
      isEnabled: !!row.is_enabled,
      trafficWeight: row.traffic_weight as number,
      isControl: !!row.is_control,
      notes: (row.notes as string) ?? '',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
