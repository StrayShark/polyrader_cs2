import type { Page } from '@playwright/test';

const SAMPLE_MARKET = {
  conditionId: '0xcs2_1',
  slug: 'spirit-vs-g2-bo3',
  question: 'Counter-Strike: Spirit vs G2 (BO3) - IEM Cologne',
  description: 'IEM Cologne Major Playoffs',
  outcomes: ['Yes', 'No'],
  outcomePrices: ['0.65', '0.35'],
  clobTokenIds: ['token1', 'token2'],
  volume: 50000,
  volume24h: 12000,
  liquidity: 8000,
  endDate: '2026-06-20T00:00:00Z',
  startDate: '2026-06-19T00:00:00Z',
  status: 'active',
  tags: [],
};

const MOCK_SCORED_MATCH = {
  market: SAMPLE_MARKET,
  attentionScore: 85,
  confidenceScore: 72,
  deviationScore: 15,
  volumeScore: 90,
  whaleScore: 40,
  tierScore: 80,
  recommendation: 'high' as const,
  llmPrediction: 0.68,
  llmSource: 'openai',
};

export const MOCK_AGGREGATION = {
  matchId: 'spirit-vs-g2-bo3',
  results: [
    {
      provider: 'openai',
      model: 'gpt-4o',
      winProbability: { teamA: 0.62, teamB: 0.38 },
      confidence: 0.75,
      reasoning: 'Spirit strong form',
      keyFactors: ['map pool', 'recent form'],
      riskAssessment: 'moderate',
      latency: 1200,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  ],
  consensus: {
    level: 'moderate' as const,
    agreementRate: 0.8,
    teamAAvgProb: 0.62,
    teamBAvgProb: 0.38,
    stdDev: 0.05,
    majorityPick: 'team_a' as const,
  },
  kellyAllocation: {
    teamAAllocation: 0.12,
    teamBAllocation: 0.03,
    recommendedBet: 'team_a' as const,
    kellyFraction: 0.08,
    bankrollFraction: 0.05,
  },
  aggregatedProbability: { teamA: 0.62, teamB: 0.38 },
  generatedAt: '2026-06-25T10:00:00Z',
};

const MOCK_BACKTEST = {
  sampleSize: 42,
  resolvedMarkets: 18,
  minEdge: 0.05,
  bestBrierSource: 'prediction_model',
  bestRoiSource: 'final',
  generatedAt: '2026-06-25T10:00:00Z',
  metrics: [
    {
      source: 'prediction_model',
      label: 'Prediction Model',
      sampleSize: 42,
      brierScore: 0.18,
      accuracy: 0.64,
      calibrationError: 0.05,
      avgPredicted: 0.58,
      actualRate: 0.62,
      bets: 30,
      wins: 19,
      losses: 11,
      totalPnl: 120,
      roi: 0.12,
      maxDrawdown: 0.08,
      avgEdge: 0.07,
      buckets: [],
    },
  ],
  tuningConfig: {
    sourceWeights: {
      polymarket: 0.1,
      prediction_model: 0.2,
      hltv_odds: 0.1,
      community: 0.05,
      capital_flow: 0.15,
      whale_flow: 0.1,
      smart_wallet: 0.75,
      mean_reversion: 0.1,
      market_behavior: 0.1,
      ai_debate: 0.1,
    },
    behaviorWeights: {
      capitalWithOrderBook: 0.2,
      capitalWithoutOrderBook: 0.1,
      reversionWithHistory: 0.15,
      reversionWithoutHistory: 0.1,
      whaleWithFlow: 0.15,
      whaleWithoutFlow: 0.1,
      market: 0.2,
    },
    recommendation: { minEdge: 0.05, bubbleMinEdge: 0.1, minConfidence: 0.6, bubbleRiskPenalty: 0.15 },
  },
};

export async function setupCommonMocks(page: Page): Promise<void> {
  await page.route('**/api/markets/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            conditionId: '0xcs2_1',
            question: 'Counter-Strike: Spirit vs G2 (BO3)',
            type: 'volume_surge',
            severity: 'high',
            detail: '+120% volume',
            value: 120,
          },
        ],
      }),
    }),
  );

  await page.route('**/api/markets**', (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/markets\/[^/?]+/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SAMPLE_MARKET }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
    });
  });

  await page.route('**/api/daily**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          date: '2026-06-25',
          totalMatches: 5,
          analyzedMatches: 3,
          highAttentionMatches: [MOCK_SCORED_MATCH],
          allMatches: [MOCK_SCORED_MATCH],
          topDeviations: [
            {
              marketId: 'm1',
              question: 'Spirit vs G2',
              polymarketProb: 0.55,
              predictedProb: 0.7,
              deviation: 0.15,
              direction: 'undervalued',
            },
          ],
          whaleAlerts: [
            {
              address: '0xabc',
              marketId: 'm1',
              action: 'BUY',
              amount: 5000,
              timestamp: '2026-06-25T10:00:00Z',
              suspiciousScore: 80,
            },
          ],
          generatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/backup/**', (route) => {
    const url = route.request().url();
    if (url.includes('/info')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            fileSize: 1024 * 1024,
            fileSizeFormatted: '1.00 MB',
            tableCounts: { matches: 10, markets: 20, simulated_bets: 5 },
            dbPath: 'polyrader.db',
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });

  await page.route('**/api/whale-follow**', (route) => {
    const url = route.request().url();
    if (url.includes('/config')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            enabled: false,
            mode: 'paper',
            copyRatio: 0.1,
            maxOrderUsd: 200,
            minLeaderTradeUsd: 500,
            maxSlippage: 0.05,
            cs2Only: true,
            minLeaderWinRate: 0.55,
            minLeaderSamples: 10,
            dailyCapUsd: 2000,
            minMarketVolumeShare: 0.02,
            minMarketVolumeUsd: 5000,
            requireUserConfirm: true,
          },
        }),
      });
    }
    if (url.includes('/signals')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
    if (url.includes('/trades/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { totalPnl: 42, settled: 3, wins: 2, losses: 1 } }),
      });
    }
    if (url.includes('/trades')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route('**/api/whales**', (route) => {
    const url = route.request().url();
    if (url.includes('/whales/graph')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { nodes: [], links: [] } }),
      });
    }
    const detailMatch = url.match(/\/whales\/(0x[a-fA-F0-9]+)/);
    if (detailMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            address: detailMatch[1],
            totalVolume: 500000,
            totalPositions: 10,
            activePositions: 3,
            winRate: 0.65,
            pnl: 1200,
            suspiciousScore: { total: 35, volumeAnomaly: 10, timingAnomaly: 10, patternAnomaly: 8, correlationAnomaly: 7 },
            recentTrades: [
              { txHash: '0x1', marketId: 'token1', outcome: 'Yes', amount: 5000, price: 0.6, timestamp: '2026-06-20T00:00:00Z', type: 'buy' },
            ],
            lastActive: '2026-06-25T10:00:00Z',
            performance: {
              settledBets: 12,
              wins: 8,
              losses: 4,
              winRate: 0.667,
              totalPnl: 1200,
              totalWagered: 8000,
              roi: 0.15,
              pendingTrades: 2,
            },
            winRateTimeline: [
              { date: '2026-06-01', winRate: 1, settledBets: 1, cumulativePnl: 100 },
              { date: '2026-06-10', winRate: 0.5, settledBets: 2, cumulativePnl: 0 },
            ],
            marketBreakdown: [
              { marketId: 'm1', marketQuestion: 'Spirit vs G2', settledBets: 5, wins: 4, losses: 1, winRate: 0.8, pnl: 900, totalWagered: 3000 },
            ],
            isFollowed: false,
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            address: '0xabc123def456',
            label: 'Whale #1',
            totalVolume: 500000,
            totalPositions: 10,
            activePositions: 3,
            winRate: 0.65,
            pnl: 1200,
            suspiciousScore: { total: 75, volumeAnomaly: 20, timingAnomaly: 25, patternAnomaly: 15, correlationAnomaly: 15 },
            recentTrades: [],
            lastActive: '2026-06-25T10:00:00Z',
          },
        ],
        total: 1,
      }),
    });
  });

  await page.route('**/api/esports/events**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ matchId: 'm1', teamA: 'Spirit', teamB: 'G2', format: 'BO3', date: '2026-06-26', event: 'IEM Cologne' }],
      }),
    }),
  );

  await page.route('**/api/esports/rankings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ rank: 1, teamId: 'spirit', name: 'Team Spirit' }] }),
    }),
  );

  await page.route('**/api/esports/map-pool**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
  );

  // Generic handler first; specific routes below override (Playwright LIFO).
  await page.route('**/api/signals/**', (route) => {
    const url = route.request().url();
    if (url.includes('/stats')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accuracy: 0.65, brierScore: 0.18, totalPredictions: 20 } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            marketId: 'm1',
            polymarketProb: 0.55,
            predictedProb: 0.7,
            finalProb: 0.68,
            finalConfidence: 0.75,
            edge: 0.13,
            riskAdjustedEdge: 0.1,
            recommendation: 'buy_yes',
            deviation: 0.15,
            signals: [
              { source: 'polymarket', probability: 0.55, confidence: 0.9, lastUpdated: '2026-06-25T10:00:00Z' },
              { source: 'prediction_model', probability: 0.7, confidence: 0.8, lastUpdated: '2026-06-25T10:00:00Z' },
            ],
            arbitrageOpportunity: false,
          },
        ],
      }),
    });
  });

  await page.route('**/api/signals/backtest**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_BACKTEST }),
    }),
  );

  await page.route('**/api/signals/config**', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as typeof MOCK_BACKTEST.tuningConfig;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...MOCK_BACKTEST.tuningConfig, ...body, updatedAt: '2026-06-25T12:00:00Z' } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_BACKTEST.tuningConfig }),
    });
  });

  await page.route('**/api/signals/arbitrage**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { opportunities: [] } }),
    }),
  );

  await page.route('**/api/polymarket/account**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          status: {
            hasApiCredentials: true,
            hasAddress: true,
            address: '0x1234567890abcdef',
            canReadPrivate: true,
          },
          totalPositionValue: 1250.5,
          balances: [{ assetType: 'USDC', balance: 500 }],
          positions: [
            {
              marketId: '0xcs2_1',
              question: 'Spirit vs G2',
              outcome: 'Yes',
              shares: 100,
              value: 65,
              avgPrice: 0.62,
              currentPrice: 0.65,
              cashPnl: 3,
            },
          ],
          activity: [],
          trades: [{ id: 't1', side: 'buy', outcome: 'Yes', price: 0.62, size: 50, value: 31, timestamp: '2026-06-25T09:00:00Z' }],
          openOrders: [{ id: 'o1', outcome: 'Yes', side: 'buy', price: 0.6, originalSize: 20, sizeMatched: 0, remainingSize: 20 }],
          diagnostics: [
            { source: 'data-api', operation: 'positions', ok: true, checkedAt: '2026-06-25T10:00:00Z' },
            { source: 'clob-api', operation: 'orders', ok: true, checkedAt: '2026-06-25T10:00:00Z' },
          ],
          updatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/system/tasks**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          running: [],
          recent: [],
          scheduledJobs: [
            { jobKey: 'price-poll', name: '价格轮询', category: 'market', cron: '*/30 * * * * *', scheduleLabel: '每 30 秒' },
          ],
          stats: { runningCount: 0, completedToday: 1, failedToday: 0 },
          updatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/ai/config/**', (route) => {
    const url = route.request().url();
    if (url.includes('/usage')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ provider: 'openai', used: 5000, limit: 10000, cost: 12.5 }] }),
      });
    }
    if (url.includes('/analysis-filter')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { historyMonths: 3, minVolumeUsd: 1000 } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-xxx', isEnabled: true, isConnected: true, quotaUsed: 5000, quotaLimit: 10000, costEstimate: 12.5 },
        ],
      }),
    });
  });

  await page.route('**/api/ai/stats/**', (route) => {
    const url = route.request().url();
    if (url.includes('/leaderboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              provider: 'openai',
              model: 'gpt-4o',
              totalPredictions: 20,
              correctPredictions: 14,
              accuracy: 0.7,
              averageConfidence: 0.65,
              calibrationError: 0.05,
              profitLoss: 200,
              roi: 0.15,
              sharpeRatio: 1.5,
              maxDrawdown: 0.1,
              lastUpdated: '2026-06-25T10:00:00Z',
            },
          ],
        }),
      });
    }
    if (url.includes('/calibration')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
    if (url.includes('/history')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { totalBets: 10, correctBets: 6, accuracy: 0.6, totalProfitLoss: 50, roi: 0.05, sharpeRatio: 1.2, maxDrawdown: 0.08 },
      }),
    });
  });

  await page.route('**/api/ai/prompts**', (route) => {
    const url = route.request().url();
    if (url.includes('/ab/compare')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            variantA: { totalAnalyses: 10, totalBets: 5, wonBets: 3, lostBets: 2, pendingBets: 0, profitLoss: 20, roi: 0.1, accuracy: 0.6 },
            variantB: { totalAnalyses: 8, totalBets: 4, wonBets: 2, lostBets: 2, pendingBets: 0, profitLoss: 5, roi: 0.02, accuracy: 0.5 },
          },
        }),
      });
    }
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            variantId: 'baseline',
            name: 'Default',
            isEnabled: true,
            trafficWeight: 1,
            isControl: true,
            systemPrompt: 'test',
            notes: '',
            createdAt: '2026-06-19T00:00:00Z',
            updatedAt: '2026-06-19T00:00:00Z',
          },
        ],
      }),
    });
  });

  const MOCK_BANKROLL = {
    config: {
      totalCapital: 10000,
      targetReturnRate: 0.15,
      riskTolerance: 'balanced' as const,
      maxBetFraction: 0.1,
      maxTotalExposure: 0.5,
      updatedAt: '2026-06-25T10:00:00Z',
    },
    state: {
      totalCapital: 10000,
      usedCapital: 2000,
      availableCapital: 8000,
      realizedPnL: 200,
      netCapital: 8200,
      targetReturnRate: 0.15,
      targetProfit: 1230,
      riskTolerance: 'balanced' as const,
    },
  };

  await page.route('**/api/allocation/**', (route) => {
    const url = route.request().url();
    if (url.includes('/bankroll')) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as typeof MOCK_BANKROLL.config;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { ...MOCK_BANKROLL.config, ...body, updatedAt: '2026-06-25T12:00:00Z' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_BANKROLL }),
      });
    }
    if (url.includes('/history')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    }
    if (url.includes('/latest')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
    }
    if (url.includes('/plan') && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'plan-1',
            createdAt: '2026-06-25T10:00:00Z',
            totalAllocated: 500,
            expectedReturn: 75,
            riskScore: 0.3,
            allocations: [],
            summary: 'Mock plan',
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
  });

  await page.route('**/api/simulation/**', (route) => {
    const url = route.request().url();
    if (url.includes('/backtest')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { providers: [], summary: {} } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          enabled: true,
          initialCapital: 1000,
          strategy: 'kelly',
          minConfidence: 0.6,
          minEdge: 0.05,
          providers: ['openai'],
        },
      }),
    });
  });

  await page.route('**/api/alerts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
  );

  // Registered last so it takes precedence over the generic /api/ai/stats/** handler.
  await page.route('**/api/ai/stats/provider/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          provider: 'openai',
          totalAnalyses: 20,
          settledBets: [],
          accuracy: 70,
          avgConfidence: 65,
          calibration: [{ predictedProb: 0.6, actualRate: 0.58, count: 10 }],
          equityCurve: [
            { date: '2026-06-01', equity: 1000 },
            { date: '2026-06-25', equity: 1150 },
          ],
          byTeam: [{ team: 'Spirit', total: 5, won: 4, accuracy: 80 }],
          byTier: [{ tier: 'S', total: 8, won: 6, accuracy: 75 }],
          byDirection: [{ direction: 'BUY', total: 12, won: 8, accuracy: 67 }],
          recentAnalyses: [],
        },
      }),
    }),
  );
}

export async function setupMatchDetailMocks(page: Page): Promise<void> {
  await setupCommonMocks(page);

  const matchInfo = {
    matchId: 'spirit-vs-g2-bo3',
    teamA: { teamId: 'spirit', name: 'Spirit', logo: '', rank: 1, region: 'EU' },
    teamB: { teamId: 'g2', name: 'G2', logo: '', rank: 5, region: 'EU' },
    eventName: 'IEM Cologne',
    eventType: 'LAN' as const,
    format: 'BO3' as const,
    scheduledAt: '2026-06-26T12:00:00Z',
    status: 'scheduled' as const,
    maps: ['Mirage', 'Inferno'],
  };

  await page.route('**/api/esports/matches/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: matchInfo }),
    }),
  );

  await page.route('**/api/markets/spirit-vs-g2-bo3/orderbook**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          bids: [{ price: '0.64', size: '100' }, { price: '0.63', size: '200' }],
          asks: [{ price: '0.66', size: '100' }, { price: '0.67', size: '150' }],
        },
      }),
    }),
  );

  await page.route('**/api/markets/spirit-vs-g2-bo3/prices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { timestamp: '2026-06-25T08:00:00Z', price: 0.63 },
          { timestamp: '2026-06-25T10:00:00Z', price: 0.65 },
        ],
      }),
    }),
  );

  await page.route('**/api/ai/analysis/timeline/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            analysisId: 'a1',
            createdAt: '2026-06-25T08:00:00.000Z',
            provider: 'openai',
            model: 'gpt-4o',
            teamAProb: 0.58,
            teamBProb: 0.42,
            confidence: 0.7,
          },
          {
            analysisId: 'a2',
            createdAt: '2026-06-25T10:00:00.000Z',
            provider: 'openai',
            model: 'gpt-4o',
            teamAProb: 0.62,
            teamBProb: 0.38,
            confidence: 0.75,
          },
        ],
      }),
    }),
  );

  await page.route('**/api/ai/analyze**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AGGREGATION),
    }),
  );

  await page.route('**/api/ai/stats/bet**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true } }) }),
  );
}
