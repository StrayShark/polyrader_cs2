import type { LLMConfig, LLMAnalysisResult, LLMAggregation, ConnectivityResult, LLMProvider, MatchInfo, Team, PromptVariant } from '@polyrader/core';
import { KeyManager, PromptEngine, ResultAggregator, selectWeightedVariant } from '@polyrader/core';
import type { PromptTemplate } from '@polyrader/core';
import { LLMClientFactory, LLMRepository, CircuitBreakerLLMClient } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';
import { buildFallbackTeam, parseJsonField } from './match-helpers';

export class AiConfigService {
  private llmRepo = new LLMRepository();
  private promptEngine = new PromptEngine();
  private resultAggregator = new ResultAggregator();
  private keyManager: KeyManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerLLMClient>();

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
    return configs.filter((c) => c.isEnabled).map((c) => ({
      provider: c.provider, used: c.quotaUsed, limit: c.quotaLimit, cost: c.costEstimate,
    }));
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
    const teamAData = await this.loadTeamData(teamAId);
    const teamBData = await this.loadTeamData(teamBId);

    // Build match info with real data
    const match: MatchInfo = {
      matchId,
      teamA: { teamId: teamAId, name: teamAData?.name ?? teamAId, logo: '', rank: teamAData?.rank ?? 10, region: teamAData?.region ?? '' },
      teamB: { teamId: teamBId, name: teamBData?.name ?? teamBId, logo: '', rank: teamBData?.rank ?? 10, region: teamBData?.region ?? '' },
      eventName: matchData ? String(matchData.event_name ?? 'Unknown Event') : 'Unknown Event',
      eventType: matchData ? (String(matchData.event_type ?? 'Online') as 'LAN' | 'Online') : 'Online',
      format: matchData ? (String(matchData.format ?? 'BO3') as 'BO1' | 'BO3' | 'BO5') : 'BO3',
      scheduledAt: matchData ? String(matchData.scheduled_at ?? new Date().toISOString()) : new Date().toISOString(),
      status: 'scheduled',
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

    const aggregation = this.resultAggregator.aggregate(matchId, analysisResults);
    aggregation.variantId = variantId;

    // Persist analysis results to DB
    try {
      for (const result of analysisResults) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
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
    const teamAData = await this.loadTeamData(teamAId);
    const teamBData = await this.loadTeamData(teamBId);

    const match: MatchInfo = {
      matchId,
      teamA: { teamId: teamAId, name: teamAData?.name ?? teamAId, logo: '', rank: teamAData?.rank ?? 10, region: teamAData?.region ?? '' },
      teamB: { teamId: teamBId, name: teamBData?.name ?? teamBId, logo: '', rank: teamBData?.rank ?? 10, region: teamBData?.region ?? '' },
      eventName: matchData ? String(matchData.event_name ?? 'Unknown Event') : 'Unknown Event',
      eventType: matchData ? (String(matchData.event_type ?? 'Online') as 'LAN' | 'Online') : 'Online',
      format: matchData ? (String(matchData.format ?? 'BO3') as 'BO1' | 'BO3' | 'BO5') : 'BO3',
      scheduledAt: matchData ? String(matchData.scheduled_at ?? new Date().toISOString()) : new Date().toISOString(),
      status: 'scheduled',
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

    const aggregation = this.resultAggregator.aggregate(matchId, results);
    aggregation.variantId = variantId;

    // Persist analysis results to DB
    try {
      for (const result of results) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
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
    const timeout = 30000;
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
      user: 'manual',
    };
    return defaults[provider];
  }
}
