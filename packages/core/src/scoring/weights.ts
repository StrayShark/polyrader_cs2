/**
 * Factor weights for the 6-factor prediction model.
 * Can be tuned based on backtesting results.
 */
export const FACTOR_WEIGHTS = {
  hltvRank: 0.20,
  recentForm: 0.15,
  lineup: 0.20,
  mapPool: 0.15,
  headToHead: 0.10,
  marketSentiment: 0.20,
} as const;

/**
 * Attention scoring weights for Daily Dashboard.
 */
export const ATTENTION_WEIGHTS = {
  confidence: 0.30,
  deviation: 0.25,
  volume: 0.20,
  whale: 0.15,
  tier: 0.10,
} as const;

/**
 * Suspicious score weights for whale analysis.
 */
export const SUSPICIOUS_WEIGHTS = {
  volumeAnomaly: 0.30,
  timingAnomaly: 0.25,
  patternAnomaly: 0.25,
  correlationAnomaly: 0.20,
} as const;

/**
 * Default Kelly fraction cap to limit risk.
 */
export const KELLY_FRACTION_CAP = 0.25;

/**
 * Minimum confidence threshold to make a recommendation.
 */
export const MIN_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Minimum edge (probability difference from 50%) to bet.
 */
export const MIN_EDGE_THRESHOLD = 0.05;

/**
 * Lineup evaluation weights.
 */
export const LINEUP_WEIGHTS = {
  averageRating: 0.35,
  impactScore: 0.25,
  synergyScore: 0.20,
  roleCompleteness: 0.15,
  standinPenalty: 0.05,
} as const;

/**
 * Standin penalty per substitute player (reduces synergy + impact).
 */
export const STANDIN_PENALTY_PER_PLAYER = 8; // points deducted from synergy score

/**
 * Role importance weights (for detecting critical absences).
 */
export const ROLE_IMPORTANCE: Record<string, number> = {
  AWPer: 0.25,
  IGL: 0.25,
  Rifler: 0.15,
  Entry: 0.15,
  Support: 0.10,
  Lurker: 0.10,
  Coach: 0.05,
};

// ============================================================
// Bet Allocation — risk multipliers by tolerance level
// ============================================================

/**
 * Risk scaling multipliers applied to Kelly fractions based on
 * the user's risk tolerance. Higher tolerance → larger allocations.
 */
export const RISK_MULTIPLIERS: Record<string, number> = {
  conservative: 0.3,
  balanced: 0.5,
  aggressive: 0.8,
};

/**
 * Default maximum fraction of bankroll on a single match.
 */
export const DEFAULT_MAX_BET_FRACTION = 0.15;

/**
 * Default maximum total exposure (fraction of bankroll across all open bets).
 */
export const DEFAULT_MAX_TOTAL_EXPOSURE = 0.6;

/**
 * Minimum Kelly fraction required to include an opportunity in the allocation.
 */
export const MIN_ALLOCATION_KELLY = 0.02;

/**
 * Default target return rate (15% ROI).
 */
export const DEFAULT_TARGET_RETURN_RATE = 0.15;
