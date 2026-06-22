// Domain Types — Shared across all layers

// ============================================================
// Market & Match
// ============================================================

export interface Market {
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds?: string[];
  volume: number;
  volume24h: number;
  liquidity: number;
  endDate: string;
  startDate: string;
  status: 'active' | 'closed' | 'resolved';
  tags: string[];
  match?: MatchInfo;
  resolvedOutcome?: string;
  resolvedPrice?: number;
}

export interface MatchInfo {
  matchId: string;
  teamA: TeamBrief;
  teamB: TeamBrief;
  eventName: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  scheduledAt: string;
  status: 'scheduled' | 'pre_match' | 'live' | 'finished' | 'settled' | 'delayed' | 'cancelled';
  maps?: string[];
  currentScore?: MatchScore;
  lineups?: MatchLineups;
}

export interface MatchLineups {
  teamA: Lineup;
  teamB: Lineup;
}

export interface Lineup {
  players: LineupPlayer[];
  isConfirmed: boolean;
  hasStandin: boolean;
  standinCount: number;
  missingKeyPlayers: string[];
}

export interface TeamBrief {
  teamId: string;
  name: string;
  logo: string;
  rank: number;
  region: string;
}

export interface MatchScore {
  teamA: number;
  teamB: number;
  currentMap: string;
  mapScores: MapScore[];
}

export interface MapScore {
  map: string;
  teamA: number;
  teamB: number;
  status: 'upcoming' | 'live' | 'finished';
}

// ============================================================
// Team & Player
// ============================================================

export interface Team {
  teamId: string;
  name: string;
  logo: string;
  rank: number;
  region: string;
  players: Player[];
  recentForm: RecentForm;
  mapPool: MapPool;
  headToHead: HeadToHead[];
}

export interface Player {
  playerId: string;
  name: string;
  nickname: string;
  rating: number;
  kdRatio: number;
  headshotPercent: number;
  mapsPlayed: number;
  role: string;
}

/** A player in a specific match lineup */
export interface LineupPlayer {
  playerId: string;
  nickname: string;
  rating: number;
  role: PlayerRole;
  isStandin: boolean;
  impactScore: number;   // 0-100, composite impact rating
  mapsOnRecord: number;  // how many maps played with this team
}

export type PlayerRole = 'AWPer' | 'Rifler' | 'IGL' | 'Support' | 'Entry' | 'Lurker' | 'Coach';

/** Team roster — all registered players, used to detect lineup changes */
export interface Roster {
  teamId: string;
  activePlayers: Player[];      // current 5-man roster
  substitutes: Player[];        // bench/substitute players
  historicalLineups: HistoricalLineup[];
  updatedAt: string;
}

export interface HistoricalLineup {
  matchId: string;
  date: string;
  opponent: string;
  players: string[];  // player nicknames
  result: 'win' | 'loss';
}

export interface RecentForm {
  last10Matches: MatchResult[];
  winRate: number;
  streak: number;
  averageRating: number;
}

export interface MatchResult {
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  score: string;
  date: string;
  event: string;
}

export interface MapPool {
  maps: MapStat[];
}

export interface MapStat {
  map: string;
  winRate: number;
  matchesPlayed: number;
  roundsWon: number;
  roundsLost: number;
}

export interface HeadToHead {
  opponent: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  lastMatch: string;
  mapResults: MapResult[];
}

export interface MapResult {
  map: string;
  result: 'win' | 'loss';
  score: string;
}

// ============================================================
// Prediction & Analysis
// ============================================================

export interface Prediction {
  matchId: string;
  teamA: string;
  teamB: string;
  winProbability: WinProbability;
  factors: FactorBreakdown;
  confidence: number;
  recommendation: BetRecommendation;
  lineupAnalysis?: LineupAnalysis;
  generatedAt: string;
}

export interface LineupAnalysis {
  teamA: LineupStrength;
  teamB: LineupStrength;
  advantage: 'team_a' | 'team_b' | 'neutral';
  keyAbsences: KeyAbsence[];
}

export interface LineupStrength {
  totalRating: number;
  averageRating: number;
  impactScore: number;       // 0-100
  synergyScore: number;      // 0-100, based on maps played together
  standinPenalty: number;    // penalty for standins
  roleCompleteness: number;  // 0-1, all roles covered
  missingKeyRoles: PlayerRole[];
}

export interface KeyAbsence {
  team: 'team_a' | 'team_b';
  playerName: string;
  role: PlayerRole;
  impact: 'critical' | 'significant' | 'minor';
  reason: string;
}

export interface WinProbability {
  teamA: number;  // 0-1
  teamB: number;  // 0-1
}

export interface FactorBreakdown {
  hltvRank: FactorScore;
  recentForm: FactorScore;
  lineup: FactorScore;
  mapPool: FactorScore;
  headToHead: FactorScore;
  marketSentiment: FactorScore;
}

export interface FactorScore {
  weight: number;       // 该因子权重
  rawScore: number;     // 原始评分 0-1
  weightedScore: number; // 加权后评分
  teamA: number;        // Team A 得分
  teamB: number;        // Team B 得分
  confidence: number;   // 该因子置信度
}

export interface BetRecommendation {
  action: 'bet_team_a' | 'bet_team_b' | 'skip';
  kellyFraction: number;
  expectedValue: number;
  reasoning: string;
}

// ============================================================
// LLM Analysis
// ============================================================

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'groq' | 'qwen' | 'moonshot' | 'zhipu' | 'doubao' | 'minimax' | 'hunyuan' | 'user';

export interface LLMAnalysisResult {
  provider: LLMProvider;
  model: string;
  winProbability: WinProbability;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  riskAssessment: string;
  latency: number;
  tokenUsage: TokenUsage;
  error?: string;
  variantId?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMAggregation {
  matchId: string;
  results: LLMAnalysisResult[];
  consensus: ConsensusResult;
  kellyAllocation: KellyAllocation;
  aggregatedProbability: WinProbability;
  generatedAt: string;
  variantId?: string;
}

export interface ConsensusResult {
  level: 'strong' | 'moderate' | 'weak' | 'divergent';
  agreementRate: number;
  teamAAvgProb: number;
  teamBAvgProb: number;
  stdDev: number;
  majorityPick: 'team_a' | 'team_b' | 'split';
}

export interface KellyAllocation {
  teamAAllocation: number;  // 建议分配比例
  teamBAllocation: number;
  recommendedBet: 'team_a' | 'team_b' | 'skip';
  kellyFraction: number;
  bankrollFraction: number;
}

// ============================================================
// Whale Tracking
// ============================================================

export interface Whale {
  address: string;
  label?: string;
  totalVolume: number;
  totalPositions: number;
  activePositions: number;
  winRate: number;
  pnl: number;
  suspiciousScore: SuspiciousScore;
  recentTrades: WhaleTrade[];
  lastActive: string;
}

export interface SuspiciousScore {
  total: number;       // 0-100
  volumeAnomaly: number;
  timingAnomaly: number;
  patternAnomaly: number;
  correlationAnomaly: number;
}

export interface WhaleTrade {
  txHash: string;
  marketId: string;
  outcome: string;
  amount: number;
  price: number;
  timestamp: string;
  type: 'buy' | 'sell';
}

/**
 * Cross-address correlation data for whale suspicious scoring.
 * Represents how much an address's trading overlaps with other whale addresses.
 */
export interface CorrelationData {
  /** Number of other whale addresses that traded on the same markets */
  correlatedAddressCount: number;
  /** Ratio of this address's markets shared with others (0-1) */
  marketOverlapRatio: number;
  /** Average suspicious score of correlated addresses (0-100) */
  avgCorrelatedSuspicion: number;
}

// ============================================================
// Address Association Graph
// ============================================================

/** A node in the address association graph (a whale address). */
export interface AddressGraphNode {
  /** Address identifier */
  id: string;
  /** Human-readable label (address alias or truncated address) */
  label: string;
  /** Total trading volume of the address */
  volume: number;
  /** Number of trades associated with the address */
  tradeCount: number;
}

/** A directed link between two addresses representing fund flow. */
export interface AddressGraphLink {
  /** Source address id (the buyer) */
  source: string;
  /** Target address id (the seller) */
  target: string;
  /** Aggregate trade value flowing along this edge */
  value: number;
}

/** Address association graph returned by the whale graph endpoint. */
export interface AddressGraph {
  nodes: AddressGraphNode[];
  links: AddressGraphLink[];
}

// ============================================================
// Daily Dashboard
// ============================================================

export interface DailyDashboard {
  date: string;
  totalMatches: number;
  analyzedMatches: number;
  highAttentionMatches: ScoredMatch[];
  allMatches: ScoredMatch[];
  topDeviations: DeviationAlert[];
  whaleAlerts: WhaleAlert[];
  generatedAt: string;
}

export interface ScoredMatch {
  market: Market;
  attentionScore: number;   // 0-100
  confidenceScore: number;
  deviationScore: number;
  volumeScore: number;
  whaleScore: number;
  tierScore: number;
  recommendation: 'high' | 'medium' | 'low';
}

export interface DeviationAlert {
  marketId: string;
  question: string;
  polymarketProb: number;
  predictedProb: number;
  deviation: number;
  direction: 'overvalued' | 'undervalued';
}

export interface WhaleAlert {
  address: string;
  marketId: string;
  action: string;
  amount: number;
  timestamp: string;
  suspiciousScore: number;
}

// ============================================================
// AI Config & Stats
// ============================================================

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;        // encrypted
  isEnabled: boolean;
  isConnected: boolean;
  lastTestedAt?: string;
  quotaUsed: number;
  quotaLimit: number;
  costEstimate: number;
}

export interface ConnectivityResult {
  provider: LLMProvider;
  success: boolean;
  latency: number;
  error?: string;
  testedAt: string;
}

export interface LLMStats {
  provider: LLMProvider;
  model: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  averageConfidence: number;
  calibrationError: number;
  profitLoss: number;
  roi: number;
  sharpeRatio: number;
  maxDrawdown: number;
  lastUpdated: string;
}

export interface UserStats {
  totalBets: number;
  correctBets: number;
  accuracy: number;
  totalProfitLoss: number;
  roi: number;
  averageKelly: number;
  bestLLM: LLMProvider;
  streak: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface SimulatedBet {
  id: string;
  matchId: string;
  provider: LLMProvider;
  team: string;
  amount: number;
  odds: number;
  result: 'pending' | 'won' | 'lost';
  profitLoss: number;
  placedAt: string;
  settledAt?: string;
  reasoning?: string;
  variantId?: string;
}

export interface CalibrationPoint {
  confidenceBucket: number;  // 0-10, 10-20, ..., 90-100
  sampleCount: number;
  accuracy: number;
  provider: LLMProvider;
}

// ============================================================
// Simulation Config (Paper Trading)
// ============================================================

export interface SimulationConfig {
  id: string;
  enabled: boolean;
  initialCapital: number;
  betStrategy: 'fixed' | 'kelly' | 'proportional';
  betAmount: number;
  maxBetFraction: number;
  minConfidence: number;
  minEdge: number;
  oddsSource: 'market' | 'llm_inverse';
  participatingProviders: LLMProvider[];
  autoSettle: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSimulationStats {
  provider: LLMProvider;
  totalBets: number;
  settledBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  winRate: number;
  totalStaked: number;
  totalPnl: number;
  roi: number;
  currentEquity: number;       // initialCapital + totalPnl
  initialCapital: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface EquityCurvePoint {
  timestamp: string;
  cumulativePnl: number;
  equity: number;
  provider: LLMProvider;
}

// ============================================================
// Signals
// ============================================================

export interface SignalComparison {
  marketId: string;
  polymarketProb: number;
  predictedProb: number;
  deviation: number;
  signals: SignalSource[];
  arbitrageOpportunity: boolean;
}

export interface SignalSource {
  source: 'polymarket' | 'prediction_model' | 'hltv_odds' | 'community';
  probability: number;
  confidence: number;
  lastUpdated: string;
}

// ============================================================
// Prompt A/B Testing
// ============================================================

export interface PromptVariant {
  variantId: string;
  name: string;
  systemPrompt: string;
  contextTemplate?: string;
  outputSchema?: string;
  isEnabled: boolean;
  trafficWeight: number;
  isControl: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Bankroll & AI Bet Allocation
// ============================================================

export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';

/**
 * User bankroll configuration — persists across sessions.
 * `totalCapital` is the initial deposit; `availableCapital` is what remains
 * after deducting amounts locked in pending bets.
 */
export interface BankrollConfig {
  totalCapital: number;
  targetReturnRate: number;   // e.g. 0.15 = 15% target ROI
  riskTolerance: RiskTolerance;
  maxBetFraction: number;     // max % of bankroll on a single match (0-1)
  maxTotalExposure: number;   // max % of bankroll exposed at once (0-1)
  updatedAt: string;
}

/**
 * Runtime bankroll state — derived from config + bet history.
 */
export interface BankrollState {
  totalCapital: number;
  usedCapital: number;        // locked in pending bets
  availableCapital: number;   // totalCapital - usedCapital
  realizedPnL: number;        // cumulative settled profit/loss
  netCapital: number;         // availableCapital + realizedPnL
  targetReturnRate: number;
  targetProfit: number;       // netCapital * targetReturnRate
  riskTolerance: RiskTolerance;
}

/**
 * A single betting opportunity derived from an LLM aggregation.
 */
export interface AllocationOpportunity {
  matchId: string;
  matchLabel: string;         // "TeamA vs TeamB"
  team: string;               // recommended side
  winProbability: number;     // 0-1
  odds: number;               // decimal odds
  kellyFraction: number;      // 0-1, from aggregation
  consensusLevel: ConsensusResult['level'];
  confidence: number;         // 0-1
  expectedValue: number;      // EV as a fraction
}

/**
 * AI-recommended allocation for a single match.
 */
export interface MatchAllocation {
  matchId: string;
  matchLabel: string;
  team: string;
  amount: number;             // USDC to bet
  fraction: number;           // % of available capital (0-1)
  winProbability: number;
  odds: number;
  expectedReturn: number;     // expected profit on this bet
  kellyFraction: number;
}

/**
 * Complete allocation plan produced by the engine.
 */
export interface AllocationPlan {
  allocations: MatchAllocation[];
  totalAllocated: number;
  remainingCapital: number;
  expectedReturn: number;     // sum of expected returns
  expectedROI: number;        // expectedReturn / totalAllocated
  portfolioRisk: number;      // estimated risk score 0-1
  reasoning: string;
  generatedAt: string;
  source: 'algorithmic' | 'llm';
}
