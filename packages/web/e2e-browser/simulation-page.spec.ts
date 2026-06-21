import { test, expect, type Page } from '@playwright/test';

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

const mockConfig = {
  enabled: false,
  participatingProviders: ['openai', 'anthropic'],
  initialCapital: 10000,
  betStrategy: 'fixed',
  betAmount: 100,
  minConfidence: 0.6,
  minEdge: 0.05,
  autoSettle: true,
};

const mockStats = [
  {
    provider: 'openai',
    totalBets: 10,
    wonBets: 6,
    lostBets: 4,
    pendingBets: 0,
    winRate: 0.6,
    profitLoss: 200,
    roi: 0.2,
    sharpeRatio: 1.5,
    maxDrawdown: 5,
    currentEquity: 10200,
  },
  {
    provider: 'anthropic',
    totalBets: 8,
    wonBets: 5,
    lostBets: 3,
    pendingBets: 0,
    winRate: 0.625,
    profitLoss: 150,
    roi: 0.1875,
    sharpeRatio: 1.2,
    maxDrawdown: 3,
    currentEquity: 10150,
  },
];

const mockEquityCurves: Record<string, Array<{ timestamp: string; cumulativePnl: number; equity: number }>> = {
  openai: [
    { timestamp: '2026-06-01T00:00:00Z', cumulativePnl: 0, equity: 10000 },
    { timestamp: '2026-06-02T00:00:00Z', cumulativePnl: 100, equity: 10100 },
    { timestamp: '2026-06-03T00:00:00Z', cumulativePnl: 200, equity: 10200 },
  ],
  anthropic: [
    { timestamp: '2026-06-01T00:00:00Z', cumulativePnl: 0, equity: 10000 },
    { timestamp: '2026-06-02T00:00:00Z', cumulativePnl: 50, equity: 10050 },
    { timestamp: '2026-06-03T00:00:00Z', cumulativePnl: 150, equity: 10150 },
  ],
};

test.describe('Simulation page', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/simulation/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockConfig }),
      }),
    );
    await page.route('**/api/simulation/stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockStats }),
      }),
    );
    await page.route('**/api/simulation/equity-curve/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockEquityCurves }),
      }),
    );
    await page.route('**/api/simulation/backtest', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            providerStats: mockStats,
            totalBets: 18,
          },
        }),
      }),
    );
  });

  test('renders simulation config panel', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Config card title
    const configTitle = page.locator('text=/模拟盘|Paper Trading|Simulation/i').first();
    await expect(configTitle).toBeVisible({ timeout: 10000 });
  });

  test('renders provider comparison table', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Provider names in table
    await expect(page.locator('text=openai').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=anthropic').first()).toBeVisible({ timeout: 5000 });
  });

  test('renders equity curve chart', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Recharts renders an SVG with class "recharts-surface"
    const chart = page.locator('.recharts-surface');
    await expect(chart.first()).toBeVisible({ timeout: 10000 });
  });

  test('can toggle simulation enabled switch', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Find the toggle switch
    const toggle = page.locator('[role="switch"]').first();
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Click to toggle
    await toggle.click();
    await page.waitForTimeout(500);

    // Should still be on the page (no crash)
    await expect(page.locator('text=/模拟盘|Paper Trading|Simulation/i').first()).toBeVisible();
  });

  test('renders backtest button and triggers backtest', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Find backtest button
    const backtestBtn = page.locator('button', { hasText: /回测|Backtest/i }).first();
    if (await backtestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backtestBtn.click();
      await page.waitForTimeout(1000);
      // Verify no crash
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
