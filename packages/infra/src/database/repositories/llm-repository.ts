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
    hltvMatchId?: string | null;
  }): void {
    // Ensure team rows exist to satisfy FOREIGN KEY constraint on matches table
    if (match.teamAId) {
      query(
        `INSERT OR IGNORE INTO teams (team_id, name, rank, region, players, recent_form, map_pool, updated_at)
         VALUES (?, ?, 999, '', '[]', '{}', '{}', datetime('now'))`,
        match.teamAId, match.teamAName,
      );
    }
    if (match.teamBId) {
      query(
        `INSERT OR IGNORE INTO teams (team_id, name, rank, region, players, recent_form, map_pool, updated_at)
         VALUES (?, ?, 999, '', '[]', '{}', '{}', datetime('now'))`,
        match.teamBId, match.teamBName,
      );
    }

    query(
      `INSERT INTO matches (match_id, team_a_id, team_b_id, team_a_name, team_b_name, event_name, event_type, format, scheduled_at, status, maps, has_team_data, lineups, hltv_match_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
         hltv_match_id = COALESCE(excluded.hltv_match_id, matches.hltv_match_id),
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
      match.hltvMatchId ?? null,
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
      `SELECT * FROM matches WHERE status IN ('scheduled', 'pre_match', 'upcoming') ORDER BY scheduled_at ASC LIMIT ?`,
      limit,
    );
  }

  /**
   * Update match status (persist MatchStateMachine state to DB).
   * Allows cron jobs to filter by state instead of guessing from timestamps.
   */
  updateMatchStatus(matchId: string, status: string): void {
    query(
      `UPDATE matches SET status = ?, updated_at = datetime('now') WHERE match_id = ?`,
      status,
      matchId,
    );
  }

  /**
   * Get all matches that are in an active (non-terminal) state.
   * Used by the Polymarket refresh cron to apply state-dependent logic.
   */
  getActiveMatches(): Array<Record<string, unknown>> {
    return query<Record<string, unknown>>(
      `SELECT * FROM matches WHERE status NOT IN ('finished', 'settled', 'cancelled') ORDER BY scheduled_at ASC`,
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

  /**
   * Get historical LLM analyses for backtesting.
   * Returns analyses ordered by created_at for replay.
   */
  getHistoricalAnalyses(limit = 500): Array<{
    matchId: string;
    provider: LLMProvider;
    model: string;
    teamAProb: number;
    teamBProb: number;
    confidence: number;
    variantId: string;
    createdAt: string;
  }> {
    const rows = query<Record<string, unknown>>(
      `SELECT match_id, provider, model, team_a_prob, team_b_prob, confidence, variant_id, created_at
       FROM llm_analyses
       WHERE error IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
      limit,
    );
    return rows.map((r) => ({
      matchId: String(r.match_id),
      provider: String(r.provider) as LLMProvider,
      model: String(r.model),
      teamAProb: Number(r.team_a_prob),
      teamBProb: Number(r.team_b_prob),
      confidence: Number(r.confidence),
      variantId: String(r.variant_id ?? 'baseline'),
      createdAt: String(r.created_at ?? new Date().toISOString()),
    }));
  }

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

  // --- Token Usage Aggregation ---

  /**
   * Aggregate token usage from llm_analyses for a specific provider.
   * Returns total prompt/completion tokens and per-month breakdown.
   */
  getTokenUsageSummary(provider: LLMProvider): {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    monthly: Array<{ month: string; promptTokens: number; completionTokens: number; totalTokens: number }>;
  } {
    const rows = query<{ prompt_tokens: number; completion_tokens: number; total_tokens: number; month: string }>(
      `SELECT
         CAST(json_extract(token_usage, '$.promptTokens') AS INTEGER) AS prompt_tokens,
         CAST(json_extract(token_usage, '$.completionTokens') AS INTEGER) AS completion_tokens,
         CAST(json_extract(token_usage, '$.totalTokens') AS INTEGER) AS total_tokens,
         strftime('%Y-%m', created_at) AS month
       FROM llm_analyses
       WHERE provider = ? AND token_usage IS NOT NULL AND token_usage != '' AND error IS NULL`,
      provider,
    );

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    const monthMap = new Map<string, { promptTokens: number; completionTokens: number; totalTokens: number }>();

    for (const r of rows) {
      const pt = r.prompt_tokens ?? 0;
      const ct = r.completion_tokens ?? 0;
      const tt = r.total_tokens ?? (pt + ct);
      totalPromptTokens += pt;
      totalCompletionTokens += ct;
      totalTokens += tt;

      const m = r.month ?? 'unknown';
      const existing = monthMap.get(m) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      existing.promptTokens += pt;
      existing.completionTokens += ct;
      existing.totalTokens += tt;
      monthMap.set(m, existing);
    }

    const monthly = Array.from(monthMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return { totalPromptTokens, totalCompletionTokens, totalTokens, monthly };
  }

  /**
   * Refresh quota_used and cost_estimate for a provider based on aggregated token usage.
   * Called after each analysis to keep usage stats current.
   */
  refreshQuota(provider: LLMProvider, pricing: { inputPricePerM: number; outputPricePerM: number }): void {
    const summary = this.getTokenUsageSummary(provider);
    const cost =
      (summary.totalPromptTokens / 1_000_000) * pricing.inputPricePerM +
      (summary.totalCompletionTokens / 1_000_000) * pricing.outputPricePerM;

    query(
      `UPDATE llm_configs SET quota_used = ?, cost_estimate = ?, updated_at = datetime('now') WHERE provider = ?`,
      summary.totalTokens,
      cost,
      provider,
    );
  }

  /**
   * Get all analysis snapshots for a match, ordered by time.
   * Used for the 24h win-rate timeline visualization (PRD §9.2).
   */
  getAnalysesByMatch(matchId: string, sinceHours = 24): Array<{
    analysisId: string;
    createdAt: string;
    provider: LLMProvider;
    model: string;
    teamAProb: number;
    teamBProb: number;
    confidence: number;
  }> {
    const rows = query<Record<string, unknown>>(
      `SELECT id, created_at, provider, model, team_a_prob, team_b_prob, confidence
       FROM llm_analyses
       WHERE match_id = ? AND error IS NULL
         AND created_at >= datetime('now', ?)
       ORDER BY created_at ASC`,
      matchId,
      `-${sinceHours} hours`,
    );
    return rows.map((row) => ({
      analysisId: String(row.id),
      createdAt: String(row.created_at),
      provider: row.provider as LLMProvider,
      model: String(row.model ?? ''),
      teamAProb: Number(row.team_a_prob) || 0.5,
      teamBProb: Number(row.team_b_prob) || 0.5,
      confidence: Number(row.confidence) || 0,
    }));
  }

  getAnalysesByProvider(
    provider: LLMProvider,
    limit = 200,
  ): Array<{
    analysisId: string;
    matchId: string;
    createdAt: string;
    model: string;
    teamAProb: number;
    teamBProb: number;
    confidence: number;
    reasoning: string;
    keyFactors: string[];
    teamAName: string;
    teamBName: string;
    scheduledAt: string;
    matchStatus: string;
  }> {
    const rows = query<Record<string, unknown>>(
      `SELECT la.id, la.match_id, la.created_at, la.model, la.team_a_prob,
              la.team_b_prob, la.confidence, la.reasoning, la.key_factors,
              m.team_a_name, m.team_b_name, m.scheduled_at, m.status
       FROM llm_analyses la
       LEFT JOIN matches m ON la.match_id = m.match_id
       WHERE la.provider = ? AND la.error IS NULL
       ORDER BY la.created_at DESC
       LIMIT ?`,
      provider,
      limit,
    );
    return rows.map((row) => {
      let keyFactors: string[] = [];
      try { keyFactors = JSON.parse(String(row.key_factors ?? '[]')); } catch { /* malformed */ }
      return {
        analysisId: String(row.id),
        matchId: String(row.match_id ?? ''),
        createdAt: String(row.created_at ?? ''),
        model: String(row.model ?? ''),
        teamAProb: Number(row.team_a_prob) || 0.5,
        teamBProb: Number(row.team_b_prob) || 0.5,
        confidence: Number(row.confidence) || 0,
        reasoning: String(row.reasoning ?? ''),
        keyFactors,
        teamAName: String(row.team_a_name ?? 'Team A'),
        teamBName: String(row.team_b_name ?? 'Team B'),
        scheduledAt: String(row.scheduled_at ?? ''),
        matchStatus: String(row.status ?? ''),
      };
    });
  }
}
