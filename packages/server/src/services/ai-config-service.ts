import type { LLMConfig, LLMAnalysisResult, LLMAggregation, ConnectivityResult, LLMProvider, MatchInfo, Team, PromptVariant } from '@polyrader/core';
import { KeyManager, PromptEngine, ResultAggregator, selectWeightedVariant, getLLMPricing } from '@polyrader/core';
import type { PromptTemplate } from '@polyrader/core';
import { LLMClientFactory, LLMRepository, CircuitBreakerLLMClient } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';
import { buildFallbackTeam, mapLegacyMatchStatus, parseJsonField } from './match-helpers';
import { SimulationService } from './simulation-service';
import { MarketService } from './market-service';

export class AiConfigService {
  private llmRepo = new LLMRepository();
  private promptEngine = new PromptEngine();
  private resultAggregator = new ResultAggregator();
  private keyManager: KeyManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerLLMClient>();
  private simulationService = new SimulationService();
  private marketService = new MarketService();

  /**
   * Compute provider weights from historical calibration data.
   * Used by ResultAggregator to weight LLM predictions by reliability.
   */
  private getCalibratedWeights(): Record<string, number> | undefined {
    try {
      const stats = this.llmRepo.getAllStats();
      if (stats.length === 0) return undefined;
      return ResultAggregator.computeProviderWeights(stats);
    } catch {
      return undefined;
    }
  }

  // In-flight analysis dedup: prevents duplicate LLM calls for the same matchId
  private inflightAnalyses = new Map<string, Promise<LLMAggregation>>();

  // Global concurrency limiter: max simultaneous LLM calls across all matches
  private static readonly MAX_CONCURRENT_LLM = 4;
  private activeLlmCalls = 0;
  private waitQueue: Array<() => void> = [];

  /**
   * Acquire a concurrency slot. Blocks if MAX_CONCURRENT_LLM is reached.
   */
  private async acquireSlot(): Promise<void> {
    if (this.activeLlmCalls < AiConfigService.MAX_CONCURRENT_LLM) {
      this.activeLlmCalls++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeLlmCalls++;
        resolve();
      });
    });
  }

  /** Release a concurrency slot and wake up the next waiter */
  private releaseSlot(): void {
    this.activeLlmCalls--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private getKeyManager(): KeyManager {
    if (!this.keyManager) {
      // Tauri sidecar mode: POLYRADER_ENCRYPTION_KEY set by Rust backend
      // Standalone mode: ENCRYPTION_KEY from .env
      const encKey = process.env.POLYRADER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
      if (!encKey) {
        throw new Error('Encryption key is required. Set POLYRADER_ENCRYPTION_KEY or ENCRYPTION_KEY.');
      }
      this.keyManager = new KeyManager(encKey);
    }
    return this.keyManager;
  }

  private getClient(provider: LLMProvider, apiKey: string, model: string): CircuitBreakerLLMClient {
    const key = `${provider}:${model}`;
    let wrapped = this.circuitBreakers.get(key);
    if (!wrapped) {
      const inner = LLMClientFactory.create(provider, apiKey, model);
      wrapped = new CircuitBreakerLLMClient(provider, inner);
      this.circuitBreakers.set(key, wrapped);
    }
    return wrapped;
  }

  private async getMarketProbA(matchId: string): Promise<number | undefined> {
    try {
      const market = await this.marketService.getMarket(matchId);
      const raw = market?.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : undefined;
      return raw !== undefined && Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : undefined;
    } catch {
      return undefined;
    }
  }

  async getKeys(): Promise<LLMConfig[]> {
    const configs = await this.llmRepo.getAllConfigs();
    return configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? this.getKeyManager().maskKey(c.apiKey) : '',
    }));
  }

  async setKey(providerId: string, apiKey: string, model?: string): Promise<void> {
    const provider = providerId as LLMProvider;
    const encrypted = this.getKeyManager().encrypt(apiKey);
    await this.llmRepo.upsertConfig({
      provider,
      model: model ?? this.getDefaultModel(provider),
      apiKey: encrypted,
      isEnabled: true,
      isConnected: false,
      quotaUsed: 0,
      quotaLimit: 1000000,
      costEstimate: 0,
    });
    // Invalidate cached circuit breaker clients so the new API key takes effect
    this.circuitBreakers.clear();
  }

  async testConnection(providerId: string): Promise<ConnectivityResult> {
    const provider = providerId as LLMProvider;
    const config = await this.llmRepo.getConfig(provider);
    if (!config || !config.apiKey) {
      return { provider, success: false, latency: 0, error: 'API Key not configured', testedAt: new Date().toISOString() };
    }

    const startTime = Date.now();
    try {
      const apiKey = this.getKeyManager().decrypt(config.apiKey);
      const client = this.getClient(provider, apiKey, config.model);
      const success = await client.testConnection();
      const latency = Date.now() - startTime;
      await this.llmRepo.upsertConfig({ ...config, isConnected: success, lastTestedAt: new Date().toISOString() });
      return { provider, success, latency, testedAt: new Date().toISOString() };
    } catch (err) {
      return { provider, success: false, latency: Date.now() - startTime, error: (err as Error).message, testedAt: new Date().toISOString() };
    }
  }

  async getUsage(): Promise<Array<{ provider: LLMProvider; used: number; limit: number; cost: number }>> {
    const configs = await this.llmRepo.getAllConfigs();
    const result: Array<{ provider: LLMProvider; used: number; limit: number; cost: number }> = [];

    for (const c of configs) {
      if (!c.isEnabled) continue;
      // Refresh quota from aggregated token usage
      try {
        const pricing = getLLMPricing(c.provider);
        this.llmRepo.refreshQuota(c.provider, pricing);
        const refreshed = this.llmRepo.getConfig(c.provider);
        result.push({
          provider: c.provider,
          used: refreshed?.quotaUsed ?? 0,
          limit: c.quotaLimit,
          cost: refreshed?.costEstimate ?? 0,
        });
      } catch {
        result.push({ provider: c.provider, used: c.quotaUsed, limit: c.quotaLimit, cost: c.costEstimate });
      }
    }
    return result;
  }

  /**
   * Select a prompt variant for A/B testing using weighted random selection.
   * Returns null if no enabled variants exist.
   */
  selectVariant(): PromptVariant | null {
    try {
      const variants = this.llmRepo.getEnabledVariants();
      return selectWeightedVariant(variants);
    } catch (err) {
      logger.warn('Failed to select prompt variant', { error: (err as Error).message });
      return null;
    }
  }

  /**
   * Run multi-LLM analysis for a match.
   * Loads real match/team/lineup data from SQLite.
   * Deduplicates concurrent calls for the same matchId.
   */
  async analyze(matchId: string, teamAId: string, teamBId: string): Promise<LLMAggregation> {
    // Dedup: if analysis for this matchId is already in-flight, return the same Promise
    const existing = this.inflightAnalyses.get(matchId);
    if (existing) return existing;

    const promise = this._doAnalyze(matchId, teamAId, teamBId).finally(() => {
      this.inflightAnalyses.delete(matchId);
    });

    this.inflightAnalyses.set(matchId, promise);
    return promise;
  }

  private async _doAnalyze(matchId: string, teamAId: string, teamBId: string): Promise<LLMAggregation> {
    // Select prompt variant for A/B testing
    const variant = this.selectVariant();
    const variantId = variant?.variantId;

    const configs = await this.llmRepo.getAllConfigs();
    const enabledConfigs = configs.filter((c) => c.isEnabled && c.apiKey);
    if (enabledConfigs.length === 0) {
      throw new Error('No LLM providers configured');
    }

    // Load match data from local DB — use getMatch for direct lookup
    const matchData = this.llmRepo.getMatch(matchId);
    // Business rule: only analyze upcoming matches (not live/finished)
    const matchStatus = matchData ? String(matchData.status ?? 'scheduled') : 'scheduled';
    const scheduledAt = matchData ? String(matchData.scheduled_at ?? '') : '';
    if (!['scheduled', 'upcoming', 'pre_match'].includes(matchStatus)) {
      throw new Error(`Refused to analyze match ${matchId}: status is "${matchStatus}", only upcoming matches can be analyzed`);
    }
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now()) {
      throw new Error(`Refused to analyze match ${matchId}: scheduled time ${scheduledAt} is in the past`);
    }
    const teamAData = await this.loadTeamData(teamAId);
    const teamBData = await this.loadTeamData(teamBId);
    const mappedStatus = mapLegacyMatchStatus(matchStatus, scheduledAt || new Date().toISOString());

    // Build match info with real data
    const match: MatchInfo = {
      matchId,
      teamA: { teamId: teamAId, name: teamAData?.name ?? teamAId, logo: '', rank: teamAData?.rank ?? 10, region: teamAData?.region ?? '' },
      teamB: { teamId: teamBId, name: teamBData?.name ?? teamBId, logo: '', rank: teamBData?.rank ?? 10, region: teamBData?.region ?? '' },
      eventName: matchData ? String(matchData.event_name ?? 'Unknown Event') : 'Unknown Event',
      eventType: matchData ? (String(matchData.event_type ?? 'Online') as 'LAN' | 'Online') : 'Online',
      format: matchData ? (String(matchData.format ?? 'BO3') as 'BO1' | 'BO3' | 'BO5') : 'BO3',
      scheduledAt: scheduledAt || new Date().toISOString(),
      status: mappedStatus,
      maps: (parseJsonField(matchData?.maps) as string[]) ?? [],
      lineups: parseJsonField(matchData?.lineups) as MatchInfo['lineups'],
    };

    const prompt = this.promptEngine.buildPrompt({
      match,
      teamA: teamAData ?? buildFallbackTeam(teamAId, teamAId, 10, 0.5),
      teamB: teamBData ?? buildFallbackTeam(teamBId, teamBId, 10, 0.5),
    });

    // Override system prompt if an A/B variant was selected
    if (variant) {
      prompt.system = variant.systemPrompt;
    }

    // Run all LLMs in parallel with circuit breaker + timeout + fallback
    // Concurrency controlled: max MAX_CONCURRENT_LLM simultaneous calls
    const results = await Promise.allSettled(
      enabledConfigs.map(async (config) => {
        await this.acquireSlot();
        try {
          const apiKey = this.getKeyManager().decrypt(config.apiKey);
          const client = this.getClient(config.provider, apiKey, config.model);
          return this.invokeWithRetry(client, prompt, config.provider);
        } finally {
          this.releaseSlot();
        }
      }),
    );

    const analysisResults: LLMAnalysisResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return { ...r.value, variantId };
      return {
        provider: enabledConfigs[i].provider,
        model: enabledConfigs[i].model,
        winProbability: { teamA: 0.5, teamB: 0.5 },
        confidence: 0, reasoning: '', keyFactors: [], riskAssessment: '',
        latency: 0, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        error: (r.reason as Error)?.message ?? 'Unknown error',
        variantId,
      };
    });

    const providerWeights = this.getCalibratedWeights();
    const marketProbA = await this.getMarketProbA(matchId);
    const aggregation = this.resultAggregator.aggregate(matchId, analysisResults, providerWeights, marketProbA);
    aggregation.variantId = variantId;

    // Persist analysis results to DB
    try {
      // Ensure teams + match rows exist (FK targets for llm_analyses).
      // HLTV may not have upserted them yet (e.g. 403 or manual analysis trigger).
      const existingMatch = this.llmRepo.getMatch(matchId);
      if (!existingMatch) {
        this.llmRepo.upsertTeam({
          teamId: teamAId, name: teamAData?.name ?? teamAId,
          rank: teamAData?.rank ?? 0, region: teamAData?.region ?? '',
          players: JSON.stringify(teamAData?.players ?? []),
          recentForm: JSON.stringify(teamAData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamAData?.mapPool ?? {}),
        });
        this.llmRepo.upsertTeam({
          teamId: teamBId, name: teamBData?.name ?? teamBId,
          rank: teamBData?.rank ?? 0, region: teamBData?.region ?? '',
          players: JSON.stringify(teamBData?.players ?? []),
          recentForm: JSON.stringify(teamBData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamBData?.mapPool ?? {}),
        });
        this.llmRepo.upsertMatch({
          matchId,
          teamAId,
          teamBId,
          teamAName: teamAData?.name ?? teamAId,
          teamBName: teamBData?.name ?? teamBId,
          eventName: match.eventName,
          eventType: match.eventType,
          format: match.format,
          scheduledAt: match.scheduledAt,
          status: 'scheduled',
          maps: [],
          hasTeamData: !!(teamAData && teamBData),
        });
      }
      for (const result of analysisResults) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
      // Refresh quota/cost for each provider that participated
      for (const result of analysisResults) {
        if (!result.error && result.tokenUsage.totalTokens > 0) {
          const pricing = getLLMPricing(result.provider);
          this.llmRepo.refreshQuota(result.provider, pricing);
        }
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
    }

    // Auto-place simulation bets for each LLM based on simulation config
    try {
      const marketProb = marketProbA ?? 0.5;
      const teamAName = match.teamA.name;
      const teamBName = match.teamB.name;
      this.simulationService.autoBetFromAnalysis(matchId, analysisResults, marketProb, teamAName, teamBName);
    } catch (simErr) {
      logger.warn('Simulation auto-bet failed', { error: (simErr as Error).message });
    }

    // Cache result
    await cacheSet(`analysis:${matchId}`, aggregation, 600);

    return aggregation;
  }

  /**
   * Run multi-LLM analysis with streaming progress.
   * Calls onProgress as each LLM completes, then returns the full aggregation.
   */
  async analyzeWithProgress(
    matchId: string,
    teamAId: string,
    teamBId: string,
    onProgress: (result: LLMAnalysisResult) => void,
  ): Promise<LLMAggregation> {
    // Dedup: if analysis for this matchId is already in-flight, return the same Promise
    const existing = this.inflightAnalyses.get(matchId);
    if (existing) return existing;

    const promise = this._doAnalyzeWithProgress(matchId, teamAId, teamBId, onProgress).finally(() => {
      this.inflightAnalyses.delete(matchId);
    });

    this.inflightAnalyses.set(matchId, promise);
    return promise;
  }

  private async _doAnalyzeWithProgress(
    matchId: string,
    teamAId: string,
    teamBId: string,
    onProgress: (result: LLMAnalysisResult) => void,
  ): Promise<LLMAggregation> {
    // Select prompt variant for A/B testing
    const variant = this.selectVariant();
    const variantId = variant?.variantId;

    const configs = await this.llmRepo.getAllConfigs();
    const enabledConfigs = configs.filter((c) => c.isEnabled && c.apiKey);
    if (enabledConfigs.length === 0) {
      throw new Error('No LLM providers configured');
    }

    const matchData = this.llmRepo.getMatch(matchId);
    // Business rule: only analyze upcoming matches (not live/finished)
    const matchStatus = matchData ? String(matchData.status ?? 'scheduled') : 'scheduled';
    const scheduledAt = matchData ? String(matchData.scheduled_at ?? '') : '';
    if (!['scheduled', 'upcoming', 'pre_match'].includes(matchStatus)) {
      throw new Error(`Refused to analyze match ${matchId}: status is "${matchStatus}", only upcoming matches can be analyzed`);
    }
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now()) {
      throw new Error(`Refused to analyze match ${matchId}: scheduled time ${scheduledAt} is in the past`);
    }
    const teamAData = await this.loadTeamData(teamAId);
    const teamBData = await this.loadTeamData(teamBId);
    const mappedStatus = mapLegacyMatchStatus(matchStatus, scheduledAt || new Date().toISOString());

    const match: MatchInfo = {
      matchId,
      teamA: { teamId: teamAId, name: teamAData?.name ?? teamAId, logo: '', rank: teamAData?.rank ?? 10, region: teamAData?.region ?? '' },
      teamB: { teamId: teamBId, name: teamBData?.name ?? teamBId, logo: '', rank: teamBData?.rank ?? 10, region: teamBData?.region ?? '' },
      eventName: matchData ? String(matchData.event_name ?? 'Unknown Event') : 'Unknown Event',
      eventType: matchData ? (String(matchData.event_type ?? 'Online') as 'LAN' | 'Online') : 'Online',
      format: matchData ? (String(matchData.format ?? 'BO3') as 'BO1' | 'BO3' | 'BO5') : 'BO3',
      scheduledAt: scheduledAt || new Date().toISOString(),
      status: mappedStatus,
      maps: (parseJsonField(matchData?.maps) as string[]) ?? [],
      lineups: parseJsonField(matchData?.lineups) as MatchInfo['lineups'],
    };

    const prompt = this.promptEngine.buildPrompt({
      match,
      teamA: teamAData ?? buildFallbackTeam(teamAId, teamAId, 10, 0.5),
      teamB: teamBData ?? buildFallbackTeam(teamBId, teamBId, 10, 0.5),
    });

    // Override system prompt if an A/B variant was selected
    if (variant) {
      prompt.system = variant.systemPrompt;
    }

    // Run all LLMs in parallel — call onProgress as each one resolves
    const results = await Promise.all(
      enabledConfigs.map(async (config) => {
        await this.acquireSlot();
        try {
          const apiKey = this.getKeyManager().decrypt(config.apiKey);
          const client = this.getClient(config.provider, apiKey, config.model);
          const result = await this.invokeWithRetry(client, prompt, config.provider);
          const tagged: LLMAnalysisResult = { ...result, variantId };
          // Notify progress immediately when this LLM completes
          onProgress(tagged);
          return tagged;
        } catch (err) {
          const errorResult: LLMAnalysisResult = {
            provider: config.provider,
            model: config.model,
            winProbability: { teamA: 0.5, teamB: 0.5 },
            confidence: 0, reasoning: '', keyFactors: [], riskAssessment: '',
            latency: 0, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            error: (err as Error)?.message ?? 'Unknown error',
            variantId,
          };
          onProgress(errorResult);
          return errorResult;
        } finally {
          this.releaseSlot();
        }
      }),
    );

    const providerWeights2 = this.getCalibratedWeights();
    const marketProbA = await this.getMarketProbA(matchId);
    const aggregation = this.resultAggregator.aggregate(matchId, results, providerWeights2, marketProbA);
    aggregation.variantId = variantId;

    // Persist analysis results to DB
    try {
      // Ensure teams + match rows exist (FK targets for llm_analyses).
      const existingMatch = this.llmRepo.getMatch(matchId);
      if (!existingMatch) {
        this.llmRepo.upsertTeam({
          teamId: teamAId, name: teamAData?.name ?? teamAId,
          rank: teamAData?.rank ?? 0, region: teamAData?.region ?? '',
          players: JSON.stringify(teamAData?.players ?? []),
          recentForm: JSON.stringify(teamAData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamAData?.mapPool ?? {}),
        });
        this.llmRepo.upsertTeam({
          teamId: teamBId, name: teamBData?.name ?? teamBId,
          rank: teamBData?.rank ?? 0, region: teamBData?.region ?? '',
          players: JSON.stringify(teamBData?.players ?? []),
          recentForm: JSON.stringify(teamBData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamBData?.mapPool ?? {}),
        });
        this.llmRepo.upsertMatch({
          matchId,
          teamAId,
          teamBId,
          teamAName: teamAData?.name ?? teamAId,
          teamBName: teamBData?.name ?? teamBId,
          eventName: match.eventName,
          eventType: match.eventType,
          format: match.format,
          scheduledAt: match.scheduledAt,
          status: 'scheduled',
          maps: [],
          hasTeamData: !!(teamAData && teamBData),
        });
      }
      for (const result of results) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
      // Refresh quota/cost for each provider that participated
      for (const result of results) {
        if (!result.error && result.tokenUsage.totalTokens > 0) {
          const pricing = getLLMPricing(result.provider);
          this.llmRepo.refreshQuota(result.provider, pricing);
        }
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
    }

    // Auto-place simulation bets for each LLM based on simulation config
    try {
      const marketProb = marketProbA ?? 0.5;
      this.simulationService.autoBetFromAnalysis(matchId, results, marketProb, match.teamA.name, match.teamB.name);
    } catch (simErr) {
      logger.warn('Simulation auto-bet failed (stream)', { error: (simErr as Error).message });
    }

    await cacheSet(`analysis:${matchId}`, aggregation, 600);
    return aggregation;
  }

  async getAnalysis(analysisId: string): Promise<LLMAggregation | null> {
    return cacheGet<LLMAggregation>(`analysis:${analysisId}`);
  }

  /**
   * Race a promise against a timeout, always clearing the timer to avoid leaks.
   */
  private async invokeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Invoke LLM with retry and timeout.
   * Strategy: 2 retries, exponential backoff (1s, 2s), 30s timeout per attempt.
   */
  private async invokeWithRetry(
    client: CircuitBreakerLLMClient,
    prompt: PromptTemplate,
    provider: string,
  ): Promise<LLMAnalysisResult> {
    const maxRetries = 2;
    const timeout = 60000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.invokeWithTimeout(client.analyze(prompt), timeout);
        return result;
      } catch (err) {
        lastError = err as Error;
        logger.warn(`[LLM] ${provider} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    return {
      provider: provider as LLMProvider,
      model: 'unknown',
      winProbability: { teamA: 0.5, teamB: 0.5 },
      confidence: 0,
      reasoning: '',
      keyFactors: [],
      riskAssessment: '',
      latency: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: lastError?.message ?? 'All retries exhausted',
    };
  }

  private async loadTeamData(teamId: string): Promise<Team | null> {
    try {
      const { queryOne } = await import('@polyrader/infra');
      const teamRow = queryOne<Record<string, unknown>>(
        `SELECT * FROM teams WHERE team_id = ?`,
        teamId,
      );
      if (!teamRow) return null;
      return {
        teamId: teamRow.team_id as string,
        name: teamRow.name as string,
        logo: (teamRow.logo as string) ?? '',
        rank: teamRow.rank as number,
        region: (teamRow.region as string) ?? '',
        players: (parseJsonField(teamRow.players) as Team['players']) ?? [],
        recentForm: parseJsonField(teamRow.recent_form) as Team['recentForm'],
        mapPool: parseJsonField(teamRow.map_pool) as Team['mapPool'],
        headToHead: [],
      };
    } catch (err) {
      logger.warn('Failed to load team data from DB', { error: (err as Error).message });
      return null;
    }
  }

  private getDefaultModel(provider: LLMProvider): string {
    const defaults: Record<LLMProvider, string> = {
      openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-2.0-flash', deepseek: 'deepseek-chat',
      xai: 'grok-2', groq: 'llama-3.3-70b-versatile',
      qwen: 'qwen-max', moonshot: 'moonshot-v1-128k',
      zhipu: 'glm-4-plus', doubao: 'doubao-seed-2.0-pro',
      minimax: 'abab6.5s-chat', hunyuan: 'hunyuan-large',
      user: 'manual',
    };
    return defaults[provider];
  }
}
