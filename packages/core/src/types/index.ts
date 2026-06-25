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
  /** Optional chain-of-thought / reasoning trace returned by some models (e.g. Qwen, GLM, MiniMax). */
  thinkingProcess?: string;
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
  /** Settled buy trades used for win-rate calculation */
  settledBets?: number;
  wins?: number;
  losses?: number;
  roi?: number;
  totalWagered?: number;
  performanceUpdatedAt?: string;
}

export interface WhaleDetail extends Whale {
  performance?: {
    settledBets: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    totalWagered: number;
    roi: number;
    pendingTrades: number;
  };
  winRateTimeline: Array<{
    date: string;
    winRate: number;
    settledBets: number;
    cumulativePnl: number;
  }>;
  marketBreakdown: Array<{
    marketId: string;
    marketQuestion: string;
    settledBets: number;
    wins: number;
    losses: number;
    winRate: number;
    pnl: number;
    totalWagered: number;
  }>;
  isFollowed: boolean;
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

export interface FollowedWallet {
  address: string;
  label?: string;
  minTradeUsd: number;
  alertsEnabled: boolean;
  autoCopyEnabled: boolean;
  createdAt: string;
  /** Enriched from whales table when listing */
  winRate?: number;
  settledBets?: number;
  pnl?: number;
}

export type CopyTradeMode = 'paper' | 'live';

export interface WalletCopyConfig {
  enabled: boolean;
  mode: CopyTradeMode;
  copyRatio: number;
  maxOrderUsd: number;
  minLeaderTradeUsd: number;
  maxSlippage: number;
  cs2Only: boolean;
  minLeaderWinRate: number;
  minLeaderSamples: number;
  dailyCapUsd: number;
  requireUserConfirm: boolean;
  /** Leader trade must be at least this share of market 24h volume (0.02 = 2%) */
  minMarketVolumeShare: number;
  /** Market must have at least this much 24h volume to qualify */
  minMarketVolumeUsd: number;
  updatedAt?: string;
}

export type WalletCopySignalStatus = 'pending' | 'executed' | 'skipped' | 'failed';

export interface WalletCopySignal {
  id: string;
  leaderAddress: string;
  leaderTxHash: string;
  tokenId: string;
  conditionId?: string;
  marketQuestion?: string;
  outcome?: string;
  side: 'buy' | 'sell';
  leaderAmount: number;
  leaderPrice: number;
  suggestedAmount?: number;
  leaderWinRate?: number;
  leaderSettledBets?: number;
  status: WalletCopySignalStatus;
  skipReason?: string;
  /** Leader trade size / market 24h volume */
  leaderVolumeShare?: number;
  /** Resolved market slug for navigation */
  marketSlug?: string;
  createdAt: string;
}

export type CopyTradeStatus = 'pending' | 'filled' | 'failed' | 'rejected';
export type CopyTradeSettlementStatus = 'pending' | 'won' | 'lost';

export interface CopyTrade {
  id: string;
  signalId: string;
  mode: CopyTradeMode;
  tokenId: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  status: CopyTradeStatus;
  errorMessage?: string;
  clobOrderId?: string;
  executedAt?: string;
  createdAt: string;
  /** Settled PnL for paper trades */
  pnl?: number;
  settlementStatus?: CopyTradeSettlementStatus;
  marketQuestion?: string;
  outcome?: string;
  resolvedAt?: string;
}

export interface CopyTradeSizingResult {
  amount: number;
  price: number;
  accepted: boolean;
  reason: string;
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
// Polymarket Data & Account
// ============================================================

export interface PolymarketHolder {
  address: string;
  outcome?: string;
  tokenId?: string;
  shares: number;
  value: number;
  avgPrice?: number;
  percentage?: number;
}

export interface PolymarketMarketPosition {
  address: string;
  marketId: string;
  outcome: string;
  tokenId?: string;
  shares: number;
  value: number;
  avgPrice?: number;
  currentPrice?: number;
  unrealizedPnl?: number;
}

export interface PolymarketUserPosition {
  marketId: string;
  conditionId?: string;
  question: string;
  outcome: string;
  tokenId?: string;
  shares: number;
  value: number;
  avgPrice?: number;
  currentPrice?: number;
  initialValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  endDate?: string;
}

export interface PolymarketUserActivity {
  id: string;
  marketId?: string;
  question?: string;
  outcome?: string;
  type: string;
  side?: 'buy' | 'sell';
  price?: number;
  size?: number;
  value?: number;
  timestamp: string;
  txHash?: string;
}

export interface PolymarketUserTrade {
  id: string;
  marketId?: string;
  assetId?: string;
  outcome?: string;
  side?: 'buy' | 'sell';
  price: number;
  size: number;
  value: number;
  fee?: number;
  status?: string;
  timestamp: string;
  txHash?: string;
}

export interface PolymarketOpenOrder {
  id: string;
  marketId?: string;
  assetId?: string;
  outcome?: string;
  side?: 'buy' | 'sell';
  price: number;
  originalSize: number;
  sizeMatched: number;
  remainingSize: number;
  status?: string;
  createdAt?: string;
  expiration?: string;
}

export interface PolymarketBalance {
  assetType: string;
  tokenId?: string;
  balance: number;
  allowance?: number;
  raw?: Record<string, unknown>;
}

export interface PolymarketAccountStatus {
  hasApiCredentials: boolean;
  hasAddress: boolean;
  address?: string;
  canReadPrivate: boolean;
  message?: string;
}

export interface PolymarketAccountDiagnostic {
  source: 'data-api' | 'clob-api';
  operation: string;
  ok: boolean;
  message?: string;
  checkedAt: string;
}

export interface PolymarketAccountOverview {
  status: PolymarketAccountStatus;
  totalPositionValue: number;
  balances: PolymarketBalance[];
  positions: PolymarketUserPosition[];
  activity: PolymarketUserActivity[];
  trades: PolymarketUserTrade[];
  openOrders: PolymarketOpenOrder[];
  diagnostics: PolymarketAccountDiagnostic[];
  updatedAt: string;
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
  llmPrediction?: number;   // 0-1, from lightweight LLM pre-analysis
  llmSource?: string;       // provider name used for pre-analysis
}

export interface DeviationAlert {
  marketId: string;
  question: string;
  polymarketProb: number;
  predictedProb: number;
  deviation: number;
  direction: 'overvalued' | 'undervalued';
  llmProb?: number;         // LLM pre-analysis probability
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
// Market Behavior & AI Debate
// ============================================================

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface MarketBehaviorResult {
  probability: number;
  confidence: number;
  capitalWeightedProb: number;
  meanReversionProb: number;
  whaleAdjustedProb: number;
  smartMoneyProb?: number;
  holderWeightedProb?: number;
  zScore: number;
  bubbleScore: number;
  concentrationRisk: number;
  holderConcentrationRisk?: number;
  holderDirectionalBias?: number;
  topHolders?: PolymarketHolder[];
  orderBookImbalance?: number;
  spread?: number;
  slippageRisk?: number;
  topDepth?: number;
  meanReversionSuppressed?: boolean;
  direction: 'buy_yes' | 'buy_no' | 'neutral';
  reasons: string[];
  updatedAt: string;
}

export interface DebateArgument {
  stance: 'yes' | 'no';
  probability: number;
  confidence: number;
  evidence: string[];
  reasoning: string;
  risks: string[];
}

export interface DebateInferenceResult {
  marketId: string;
  yesCase: DebateArgument;
  noCase: DebateArgument;
  judgeProbability: number;
  calibratedProbability: number;
  confidence: number;
  marketMispricing: number;
  verdict: 'buy_yes' | 'buy_no' | 'skip';
  evidenceStrength: number;
  generatedAt: string;
}

// ============================================================
// Signals
// ============================================================

export interface SignalComparison {
  marketId: string;
  polymarketProb: number;
  predictedProb: number;
  finalProb?: number;
  finalConfidence?: number;
  edge?: number;
  riskAdjustedEdge?: number;
  recommendation?: 'buy_yes' | 'buy_no' | 'skip';
  deviation: number;
  signals: SignalSource[];
  marketBehavior?: MarketBehaviorResult;
  aiDebate?: DebateInferenceResult;
  arbitrageOpportunity: boolean;
}

export interface SignalSnapshot {
  id?: number;
  marketId: string;
  question: string;
  marketProb: number;
  predictedProb: number;
  behaviorProb?: number;
  aiDebateProb?: number;
  finalProb: number;
  edge: number;
  riskAdjustedEdge: number;
  recommendation: 'buy_yes' | 'buy_no' | 'skip';
  resolvedOutcome?: string;
  resolvedPrice?: number;
  signals: SignalSource[];
  marketBehavior?: MarketBehaviorResult;
  aiDebate?: DebateInferenceResult;
  createdAt: string;
}

export type SignalSourceKind =
  | 'polymarket'
  | 'prediction_model'
  | 'hltv_odds'
  | 'community'
  | 'capital_flow'
  | 'whale_flow'
  | 'smart_wallet'
  | 'mean_reversion'
  | 'market_behavior'
  | 'ai_debate';

export interface SignalSource {
  source: SignalSourceKind;
  probability: number;
  confidence: number;
  lastUpdated: string;
  details?: Record<string, string | number | boolean | null>;
}

export type SignalSourceWeights = Record<SignalSourceKind, number>;

export interface SignalBehaviorWeights {
  capitalWithOrderBook: number;
  capitalWithoutOrderBook: number;
  reversionWithHistory: number;
  reversionWithoutHistory: number;
  whaleWithFlow: number;
  whaleWithoutFlow: number;
  market: number;
}

export interface SignalRecommendationConfig {
  minEdge: number;
  bubbleMinEdge: number;
  minConfidence: number;
  bubbleRiskPenalty: number;
}

export interface SignalTuningConfig {
  sourceWeights: SignalSourceWeights;
  behaviorWeights: SignalBehaviorWeights;
  recommendation: SignalRecommendationConfig;
  updatedAt?: string;
}

export interface SignalTuningConfigInput {
  sourceWeights?: Partial<SignalSourceWeights>;
  behaviorWeights?: Partial<SignalBehaviorWeights>;
  recommendation?: Partial<SignalRecommendationConfig>;
  updatedAt?: string;
}

export type SignalBacktestSourceKind =
  | 'market'
  | 'prediction_model'
  | 'market_behavior'
  | 'ai_debate'
  | 'smart_wallet'
  | 'final';

export interface SignalCalibrationBucket {
  lowerBound: number;
  upperBound: number;
  count: number;
  avgPredicted: number;
  actualRate: number;
  brierScore: number;
}

export interface SignalBacktestMetric {
  source: SignalBacktestSourceKind;
  label: string;
  sampleSize: number;
  brierScore: number;
  accuracy: number;
  calibrationError: number;
  avgPredicted: number;
  actualRate: number;
  bets: number;
  wins: number;
  losses: number;
  totalPnl: number;
  roi: number;
  maxDrawdown: number;
  avgEdge: number;
  currentWeight?: number;
  suggestedWeight?: number;
  buckets: SignalCalibrationBucket[];
}

export interface SignalBacktestSummary {
  sampleSize: number;
  resolvedMarkets: number;
  startDate?: string;
  endDate?: string;
  minEdge: number;
  metrics: SignalBacktestMetric[];
  bestBrierSource?: SignalBacktestSourceKind;
  bestRoiSource?: SignalBacktestSourceKind;
  generatedAt: string;
  tuningConfig: SignalTuningConfig;
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

// ============================================================
// Analysis Filter Configuration
// ============================================================

/**
 * Configuration for the batch analysis cron job.
 * Controls which matches are eligible for automatic LLM analysis.
 */
export interface AnalysisFilterConfig {
  /** Minimum event tier to analyze ('S' | 'A' | 'B' | 'C'). */
  minTier: 'S' | 'A' | 'B' | 'C';
  /** Master toggle for the 6-hour batch analysis cron. */
  enabled: boolean;
  /** Minimum HLTV star rating (0-5) required to trigger analysis. */
  minStars: number;
  /** If true, only LAN events are analyzed (skips all online). */
  lanOnly: boolean;
  /** If true, skip matches without a confirmed 5-man roster. */
  skipIfNoRoster: boolean;
  /** How many months of match history to fetch for analysis (3-6, default 3). */
  historyMonths: number;
  /** Minimum market volume in USD required to trigger analysis (default 10000). */
  minVolumeUsd: number;
  /** Last update timestamp. */
  updatedAt: string;
}

// ============================================================
// Background Task Monitor
// ============================================================

export type BackgroundTaskStatus = 'queued' | 'running' | 'success' | 'failed';

export type BackgroundTaskCategory = 'market' | 'esports' | 'ai' | 'whale' | 'signal' | 'system';

export type BackgroundTaskTrigger = 'scheduled' | 'manual' | 'startup';

export interface BackgroundTaskLog {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BackgroundTask {
  id: string;
  jobKey: string;
  name: string;
  category: BackgroundTaskCategory;
  trigger: BackgroundTaskTrigger;
  status: BackgroundTaskStatus;
  progress: number;
  progressLabel?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  logs: BackgroundTaskLog[];
  metadata?: Record<string, unknown>;
}

export interface ScheduledJobDefinition {
  jobKey: string;
  name: string;
  category: BackgroundTaskCategory;
  cron: string;
  scheduleLabel: string;
  description?: string;
}

export interface TaskMonitorSnapshot {
  running: BackgroundTask[];
  recent: BackgroundTask[];
  scheduledJobs: ScheduledJobDefinition[];
  stats: {
    runningCount: number;
    completedToday: number;
    failedToday: number;
  };
  updatedAt: string;
}
