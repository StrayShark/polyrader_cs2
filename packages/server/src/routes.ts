import type { Express } from 'express';
import { MarketController } from './controllers/market-controller';
import { DailyController } from './controllers/daily-controller';
import { WhaleController } from './controllers/whale-controller';
import { EsportsController } from './controllers/esports-controller';
import { SignalController } from './controllers/signal-controller';
import { AiConfigController } from './controllers/ai-config-controller';
import { AiStatsController } from './controllers/ai-stats-controller';
import { AllocationController } from './controllers/allocation-controller';
import { AlertController } from './controllers/alert-controller';
import { SimulationController } from './controllers/simulation-controller';
import { createPromptVariantRouter } from './controllers/prompt-variant-controller';
import { LLMRepository } from '@polyrader/infra';
import { validate } from './validation';
import {
  marketQuerySchema,
  marketParamsSchema,
  priceHistoryQuerySchema,
  analyzeBodySchema,
  analysisParamsSchema,
  setKeyBodySchema,
  providerParamsSchema,
  statsHistoryQuerySchema,
  calibrationParamsSchema,
  whaleQuerySchema,
  whaleParamsSchema,
  teamParamsSchema,
  signalParamsSchema,
  placeBetBodySchema,
  settleBetSchema,
  updateBankrollBodySchema,
  createAllocationBodySchema,
  allocationHistoryQuerySchema,
  createAlertBodySchema,
  updateAlertBodySchema,
  alertParamsSchema,
  alertQuerySchema,
  updateSimulationConfigSchema,
} from './validation';

export function registerRoutes(app: Express): void {
  const marketCtrl = new MarketController();
  const dailyCtrl = new DailyController();
  const whaleCtrl = new WhaleController();
  const esportsCtrl = new EsportsController();
  const signalCtrl = new SignalController();
  const aiConfigCtrl = new AiConfigController();
  const aiStatsCtrl = new AiStatsController();
  const allocationCtrl = new AllocationController();
  const alertCtrl = new AlertController();
  const simulationCtrl = new SimulationController();

  // Markets
  app.get('/api/markets', validate(marketQuerySchema, 'query'), (req, res) => marketCtrl.getMarkets(req, res));
  app.get('/api/markets/:conditionId', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getMarket(req, res));
  app.get('/api/markets/:conditionId/prices', validate(marketParamsSchema, 'params'), validate(priceHistoryQuerySchema, 'query'), (req, res) => marketCtrl.getPrices(req, res));
  app.get('/api/markets/:conditionId/orderbook', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getOrderBook(req, res));

  // Daily Dashboard
  app.get('/api/daily', (req, res) => dailyCtrl.getDashboard(req, res));
  app.post('/api/daily/refresh', (req, res) => dailyCtrl.refresh(req, res));

  // Whales
  app.get('/api/whales', validate(whaleQuerySchema, 'query'), (req, res) => whaleCtrl.getWhales(req, res));
  app.get('/api/whales/graph', (req, res) => whaleCtrl.getAddressGraph(req, res));
  app.get('/api/whales/:address', validate(whaleParamsSchema, 'params'), (req, res) => whaleCtrl.getWhale(req, res));

  // Esports
  app.get('/api/esports/events', (req, res) => esportsCtrl.getEvents(req, res));
  app.get('/api/esports/rankings', (req, res) => esportsCtrl.getRankings(req, res));
  app.get('/api/esports/map-pool', (req, res) => esportsCtrl.getMapPool(req, res));
  app.get('/api/esports/teams/:teamId', validate(teamParamsSchema, 'params'), (req, res) => esportsCtrl.getTeam(req, res));
  app.get('/api/esports/matches/:matchId', validate(signalParamsSchema, 'params'), (req, res) => esportsCtrl.getMatch(req, res));

  // Signals
  app.get('/api/signals/top', (req, res) => signalCtrl.getTopSignals(req, res));
  app.get('/api/signals/stats', (req, res) => signalCtrl.getStats(req, res));
  app.get('/api/signals/arbitrage', (req, res) => signalCtrl.getArbitrage(req, res));
  app.get('/api/signals/:marketId', validate(signalParamsSchema, 'params'), (req, res) => signalCtrl.getSignals(req, res));

  // AI Analysis
  app.post('/api/ai/analyze', validate(analyzeBodySchema, 'body'), (req, res) => aiConfigCtrl.analyze(req, res));
  app.post('/api/ai/analyze/stream', validate(analyzeBodySchema, 'body'), (req, res) => aiConfigCtrl.analyzeStream(req, res));
  app.get('/api/ai/analysis/:analysisId', validate(analysisParamsSchema, 'params'), (req, res) => aiConfigCtrl.getAnalysis(req, res));

  // AI Config
  app.get('/api/ai/config/keys', (req, res) => aiConfigCtrl.getKeys(req, res));
  app.put('/api/ai/config/keys/:providerId', validate(providerParamsSchema, 'params'), validate(setKeyBodySchema, 'body'), (req, res) => aiConfigCtrl.setKey(req, res));
  app.post('/api/ai/config/test/:providerId', validate(providerParamsSchema, 'params'), (req, res) => aiConfigCtrl.testConnection(req, res));
  app.get('/api/ai/config/usage', (req, res) => aiConfigCtrl.getUsage(req, res));

  // AI Stats
  app.get('/api/ai/stats/leaderboard', (req, res) => aiStatsCtrl.getLeaderboard(req, res));
  app.get('/api/ai/stats/user', (req, res) => aiStatsCtrl.getUserStats(req, res));
  app.get('/api/ai/stats/history', validate(statsHistoryQuerySchema, 'query'), (req, res) => aiStatsCtrl.getHistory(req, res));
  app.get('/api/ai/stats/calibration/:providerId', validate(calibrationParamsSchema, 'params'), (req, res) => aiStatsCtrl.getCalibration(req, res));
  app.post('/api/ai/stats/bet', validate(placeBetBodySchema, 'body'), (req, res) => aiStatsCtrl.placeBet(req, res));
  app.patch('/api/ai/stats/bet/:id', validate(settleBetSchema, 'body'), (req, res) => aiStatsCtrl.settleBet(req, res));
  app.delete('/api/ai/stats/bet/:id', (req, res) => aiStatsCtrl.deleteBet(req, res));
  app.get('/api/ai/stats/equity-curve', (req, res) => aiStatsCtrl.getEquityCurve(req, res));

  // AI Bet Allocation
  app.get('/api/allocation/bankroll', (req, res) => allocationCtrl.getBankroll(req, res));
  app.put('/api/allocation/bankroll', validate(updateBankrollBodySchema, 'body'), (req, res) => allocationCtrl.updateBankroll(req, res));
  app.post('/api/allocation/plan', validate(createAllocationBodySchema, 'body'), (req, res) => allocationCtrl.createAllocation(req, res));
  app.get('/api/allocation/plan/latest', (req, res) => allocationCtrl.getLatestPlan(req, res));
  app.get('/api/allocation/plan/history', validate(allocationHistoryQuerySchema, 'query'), (req, res) => allocationCtrl.getPlanHistory(req, res));

  // Prompt Variants (A/B testing)
  const llmRepo = new LLMRepository();
  app.use('/api/ai/prompts', createPromptVariantRouter(llmRepo));

  // Price/Volume Alerts
  app.get('/api/alerts', validate(alertQuerySchema, 'query'), (req, res) => alertCtrl.getAlerts(req, res));
  app.post('/api/alerts', validate(createAlertBodySchema, 'body'), (req, res) => alertCtrl.createAlert(req, res));
  app.put('/api/alerts/:id', validate(alertParamsSchema, 'params'), validate(updateAlertBodySchema, 'body'), (req, res) => alertCtrl.updateAlert(req, res));
  app.delete('/api/alerts/:id', validate(alertParamsSchema, 'params'), (req, res) => alertCtrl.deleteAlert(req, res));

  // Simulation (Paper Trading)
  app.get('/api/simulation/config', (req, res) => simulationCtrl.getConfig(req, res));
  app.put('/api/simulation/config', validate(updateSimulationConfigSchema, 'body'), (req, res) => simulationCtrl.updateConfig(req, res));
  app.get('/api/simulation/stats', (req, res) => simulationCtrl.getProviderStats(req, res));
  app.get('/api/simulation/equity-curves', (req, res) => simulationCtrl.getAllEquityCurves(req, res));
  app.get('/api/simulation/equity-curve/:provider', (req, res) => simulationCtrl.getEquityCurve(req, res));
  app.get('/api/simulation/bets/:provider', (req, res) => simulationCtrl.getBetHistory(req, res));
  app.post('/api/simulation/backtest', (req, res) => simulationCtrl.runBacktest(req, res));
}
