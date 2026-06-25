import { z } from 'zod';

// ============================================================
// Market schemas
// ============================================================
export const marketQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'closed', 'resolved']).optional(),
});

export const marketParamsSchema = z.object({
  conditionId: z.string().min(1, 'conditionId is required'),
});

export const priceHistoryQuerySchema = z.object({
  interval: z.enum(['1h', '6h', '1d']).default('1h'),
});

// ============================================================
// AI Analysis schemas
// ============================================================
export const analyzeBodySchema = z.object({
  matchId: z.string().min(1, 'matchId is required'),
  teamAId: z.string().min(1, 'teamAId is required'),
  teamBId: z.string().min(1, 'teamBId is required'),
});

export const analysisParamsSchema = z.object({
  analysisId: z.string().min(1),
});

// ============================================================
// AI Config schemas
// ============================================================
export const setKeyBodySchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
  model: z.string().optional(),
});

export const providerParamsSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan', 'user']),
});

// ============================================================
// AI Stats schemas
// ============================================================
export const statsHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const calibrationParamsSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan']),
});

// ============================================================
// Whale schemas
// ============================================================
export const whaleQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  minVolume: z.coerce.number().min(0).optional(),
  sort: z.enum(['volume', 'win_rate']).default('volume'),
  minSamples: z.coerce.number().int().min(0).max(1000).default(5),
  minWinRate: z.coerce.number().min(0).max(1).optional(),
});

export const whaleLeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  minSamples: z.coerce.number().int().min(1).max(1000).default(20),
  minWinRate: z.coerce.number().min(0).max(1).default(0.5),
});

export const followWalletBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  label: z.string().max(64).optional(),
  minTradeUsd: z.coerce.number().min(0).max(1_000_000).optional(),
  alertsEnabled: z.boolean().optional(),
  autoCopyEnabled: z.boolean().optional(),
});

export const walletCopyConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['paper']).optional(),
  copyRatio: z.coerce.number().min(0.01).max(1).optional(),
  maxOrderUsd: z.coerce.number().min(1).max(100_000).optional(),
  minLeaderTradeUsd: z.coerce.number().min(0).max(1_000_000).optional(),
  maxSlippage: z.coerce.number().min(0).max(1).optional(),
  cs2Only: z.boolean().optional(),
  minLeaderWinRate: z.coerce.number().min(0).max(1).optional(),
  minLeaderSamples: z.coerce.number().int().min(0).max(10_000).optional(),
  dailyCapUsd: z.coerce.number().min(1).max(1_000_000).optional(),
  minMarketVolumeShare: z.coerce.number().min(0).max(1).optional(),
  minMarketVolumeUsd: z.coerce.number().min(0).max(10_000_000).optional(),
  requireUserConfirm: z.boolean().optional(),
});

export const walletFollowQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['pending', 'executed', 'skipped', 'failed']).optional(),
});

export const walletFollowSignalParamsSchema = z.object({
  signalId: z.string().uuid('Invalid signal id'),
});

export const walletFollowUnfollowParamsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

export const whaleParamsSchema = z.object({
  address: z.string().min(1, 'address is required').regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

// ============================================================
// Esports schemas
// ============================================================
export const teamParamsSchema = z.object({
  teamId: z.string().min(1, 'teamId is required'),
});

export const matchParamsSchema = z.object({
  matchId: z.string().min(1, 'matchId is required'),
});

// ============================================================
// Signals schemas
// ============================================================
export const signalParamsSchema = z.object({
  marketId: z.string().min(1, 'marketId is required'),
});

export const signalSnapshotQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const signalBacktestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  minEdge: z.coerce.number().min(0).max(0.5).optional(),
});

const signalSourceWeightsSchema = z.object({
  polymarket: z.coerce.number().min(0).max(5).optional(),
  prediction_model: z.coerce.number().min(0).max(5).optional(),
  hltv_odds: z.coerce.number().min(0).max(5).optional(),
  community: z.coerce.number().min(0).max(5).optional(),
  capital_flow: z.coerce.number().min(0).max(5).optional(),
  whale_flow: z.coerce.number().min(0).max(5).optional(),
  smart_wallet: z.coerce.number().min(0).max(5).optional(),
  mean_reversion: z.coerce.number().min(0).max(5).optional(),
  market_behavior: z.coerce.number().min(0).max(5).optional(),
  ai_debate: z.coerce.number().min(0).max(5).optional(),
});

const signalBehaviorWeightsSchema = z.object({
  capitalWithOrderBook: z.coerce.number().min(0).max(5).optional(),
  capitalWithoutOrderBook: z.coerce.number().min(0).max(5).optional(),
  reversionWithHistory: z.coerce.number().min(0).max(5).optional(),
  reversionWithoutHistory: z.coerce.number().min(0).max(5).optional(),
  whaleWithFlow: z.coerce.number().min(0).max(5).optional(),
  whaleWithoutFlow: z.coerce.number().min(0).max(5).optional(),
  market: z.coerce.number().min(0).max(5).optional(),
});

const signalRecommendationSchema = z.object({
  minEdge: z.coerce.number().min(0).max(0.5).optional(),
  bubbleMinEdge: z.coerce.number().min(0).max(0.5).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  bubbleRiskPenalty: z.coerce.number().min(0).max(5).optional(),
});

export const signalTuningConfigBodySchema = z.object({
  sourceWeights: signalSourceWeightsSchema.optional(),
  behaviorWeights: signalBehaviorWeightsSchema.optional(),
  recommendation: signalRecommendationSchema.optional(),
});

// ============================================================
// Betting schemas
// ============================================================
export const placeBetBodySchema = z.object({
  matchId: z.string().min(1),
  team: z.string().min(1),
  amount: z.number().min(10).max(10000),
  odds: z.number().min(1.01).max(100),
  reasoning: z.string().optional(),
});

export const settleBetSchema = z.object({
  result: z.enum(['won', 'lost']),
  profitLoss: z.number().optional(),
});

// ============================================================
// Allocation schemas
// ============================================================
export const updateBankrollBodySchema = z.object({
  totalCapital: z.number().min(0),
  targetReturnRate: z.number().min(0).max(1),
  riskTolerance: z.enum(['conservative', 'balanced', 'aggressive']),
  maxBetFraction: z.number().min(0.01).max(1).optional(),
  maxTotalExposure: z.number().min(0.01).max(1).optional(),
});

export const createAllocationBodySchema = z.object({
  opportunities: z.array(z.object({
    matchId: z.string().min(1),
    matchLabel: z.string().min(1),
    team: z.string().min(1),
    winProbability: z.number().min(0).max(1),
    odds: z.number().min(1.01).max(100),
    kellyFraction: z.number().min(0).max(1),
    consensusLevel: z.enum(['strong', 'moderate', 'weak', 'divergent']),
    confidence: z.number().min(0).max(1),
    expectedValue: z.number(),
  })).min(1),
  useLLM: z.boolean().optional(),
});

export const allocationHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================
// Prompt Variant schemas (A/B testing)
// ============================================================
export const createVariantSchema = z.object({
  variantId: z.string().min(1),
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  contextTemplate: z.string().optional(),
  outputSchema: z.string().optional(),
  trafficWeight: z.number().min(0).max(1).default(1),
  notes: z.string().optional(),
});

export const updateVariantSchema = z.object({
  name: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  contextTemplate: z.string().optional(),
  outputSchema: z.string().optional(),
  isEnabled: z.boolean().optional(),
  trafficWeight: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const variantParamsSchema = z.object({
  variantId: z.string().min(1),
});

export const abCompareQuerySchema = z.object({
  variantA: z.string().min(1),
  variantB: z.string().min(1),
});

// ============================================================
// Alert schemas
// ============================================================
export const createAlertBodySchema = z.object({
  marketSlug: z.string().min(1, 'marketSlug is required'),
  marketQuestion: z.string().min(1, 'marketQuestion is required'),
  alertType: z.enum(['price_above', 'price_below', 'volume_above']),
  threshold: z.number().min(0),
});

export const updateAlertBodySchema = z.object({
  threshold: z.number().min(0).optional(),
  currentValue: z.number().min(0).optional(),
  triggered: z.boolean().optional(),
});

export const alertParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export const alertQuerySchema = z.object({
  triggered: z.enum(['true', 'false']).optional(),
});

// ============================================================
// Type exports
// ============================================================
export type MarketQuery = z.infer<typeof marketQuerySchema>;
export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type SetKeyBody = z.infer<typeof setKeyBodySchema>;
export type PlaceBetBody = z.infer<typeof placeBetBodySchema>;
export type UpdateBankrollBody = z.infer<typeof updateBankrollBodySchema>;
export type CreateAllocationBody = z.infer<typeof createAllocationBodySchema>;
export type CreateVariantBody = z.infer<typeof createVariantSchema>;
export type UpdateVariantBody = z.infer<typeof updateVariantSchema>;
export type CreateAlertBody = z.infer<typeof createAlertBodySchema>;
export type UpdateAlertBody = z.infer<typeof updateAlertBodySchema>;

// ============================================================
// Simulation Config
// ============================================================

export const updateSimulationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  initialCapital: z.number().min(100).max(10000000).optional(),
  betStrategy: z.enum(['fixed', 'kelly', 'proportional']).optional(),
  betAmount: z.number().min(1).max(1000000).optional(),
  maxBetFraction: z.number().min(0.001).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  minEdge: z.number().min(0).max(1).optional(),
  oddsSource: z.enum(['market', 'llm_inverse']).optional(),
  participatingProviders: z.array(z.string()).optional(),
  autoSettle: z.boolean().optional(),
});
