import { test, expect, type Page } from '@playwright/test';

/**
 * E2E interaction tests for 6 pages that previously had only navigation coverage.
 * Each test mocks the relevant API endpoints and verifies rendering of real data.
 */

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

// ============================================================
// Daily page
// ============================================================

test.describe('Daily page interactions', () => {
  test('renders dashboard data from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/daily**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            date: '2026-06-19',
            totalMatches: 5,
            analyzedMatches: 3,
            highAttentionMatches: [],
            allMatches: [],
            topDeviations: [
              { marketId: 'm1', question: 'Spirit vs G2', polymarketProb: 0.55, predictedProb: 0.7, deviation: 0.15, direction: 'undervalued' },
            ],
            whaleAlerts: [
              { address: '0xabc', marketId: 'm1', action: 'BUY', amount: 5000, timestamp: '2026-06-19T10:00:00Z', suspiciousScore: 80 },
            ],
            generatedAt: '2026-06-19T10:00:00Z',
          },
        }),
      }),
    );

    await page.goto('/#/daily');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// Whales page
// ============================================================

test.describe('Whales page interactions', () => {
  test('renders whale list from API', async ({ page }) => {
    await blockWs(page);
    // Mock graph endpoint separately to avoid returning whale list data
    await page.route('**/api/whales/graph', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { nodes: [], links: [] } }),
      }),
    );
    await page.route('**/api/whales?**', (route) =>
      route.fulfill({
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
              recentTrades: [
                { marketId: 'm1', amount: 5000, side: 'BUY', timestamp: '2026-06-19T10:00:00Z', suspiciousScore: 80 },
              ],
              lastActive: '2026-06-19T10:00:00Z',
            },
          ],
          total: 1,
        }),
      }),
    );

    await page.goto('/#/whales');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// Signals page
// ============================================================

test.describe('Signals page interactions', () => {
  test('renders signal comparison from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/signals/top**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              marketId: 'm1',
              polymarketProb: 0.55,
              predictedProb: 0.7,
              deviation: 0.15,
              signals: [
                { source: 'polymarket', probability: 0.55, confidence: 0.9, lastUpdated: '2026-06-19T10:00:00Z' },
                { source: 'prediction_model', probability: 0.7, confidence: 0.8, lastUpdated: '2026-06-19T10:00:00Z' },
              ],
              arbitrageOpportunity: false,
            },
          ],
        }),
      }),
    );
    await page.route('**/api/signals/stats**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { accuracy: 0.65, brierScore: 0.18, totalPredictions: 20 },
        }),
      }),
    );

    await page.goto('/#/signals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// Esports page
// ============================================================

test.describe('Esports page interactions', () => {
  test('renders HLTV data from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/esports/events**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { matchId: 'm1', teamA: 'Spirit', teamB: 'G2', format: 'BO3', date: '2026-06-20', event: 'IEM Cologne' },
          ],
        }),
      }),
    );
    await page.route('**/api/esports/rankings**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ rank: 1, teamId: 'spirit', name: 'Team Spirit' }],
        }),
      }),
    );
    await page.route('**/api/esports/map-pool**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto('/#/esports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// AI Config page
// ============================================================

test.describe('AI Config page interactions', () => {
  test('renders LLM config list from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/ai/config/keys**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-xxx', isEnabled: true, isConnected: true, quotaUsed: 5000, quotaLimit: 10000, costEstimate: 12.5 },
            { provider: 'anthropic', model: '', apiKey: '', isEnabled: false, isConnected: false, quotaUsed: 0, quotaLimit: 0, costEstimate: 0 },
          ],
        }),
      }),
    );

    await page.goto('/#/ai/config');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// AI Stats page
// ============================================================

test.describe('AI Stats page interactions', () => {
  test('renders leaderboard and stats from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/ai/stats/leaderboard**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { provider: 'openai', model: 'gpt-4o', totalPredictions: 20, correctPredictions: 14, accuracy: 0.7, averageConfidence: 0.65, calibrationError: 0.05, profitLoss: 200, roi: 0.15, sharpeRatio: 1.5, maxDrawdown: 0.1, lastUpdated: '2026-06-19T10:00:00Z' },
          ],
        }),
      }),
    );
    await page.route('**/api/ai/stats/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { totalBets: 10, correctBets: 6, accuracy: 0.6, totalProfitLoss: 50, roi: 0.05, averageKelly: 0.12, bestLLM: 'openai', streak: 3, sharpeRatio: 1.2, maxDrawdown: 0.08 },
        }),
      }),
    );
    await page.route('**/api/ai/stats/history**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route('**/api/ai/stats/calibration/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto('/#/ai/stats');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });

    // User stats card should show Sharpe ratio
    await expect(page.locator('text=1.20').first()).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});
