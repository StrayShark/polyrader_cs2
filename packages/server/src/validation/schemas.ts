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

// ============================================================
// Signals schemas
// ============================================================
export const signalParamsSchema = z.object({
  marketId: z.string().min(1, 'marketId is required'),
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
