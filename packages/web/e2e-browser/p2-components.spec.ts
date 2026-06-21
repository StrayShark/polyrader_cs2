import { test, expect, type Page } from '@playwright/test';

/**
 * P2: Component-level E2E tests for 5 key UI components.
 *
 * Each describe block mocks the relevant API endpoints in `beforeEach` and
 * verifies rendering / interaction of one component:
 *   1. ConnectionStatus  — dashboard status bar
 *   2. MarketHeatmap      — dashboard heatmap section
 *   3. AddressGraph       — whales page address association graph
 *   4. AlertManager       — signals page price alert management
 *   5. Arbitrage section  — signals page arbitrage opportunities table
 *
 * NOTE on i18n: the default locale is zh-CN. A few translation keys
 * (`connectionStatus.*`, `heatmap.*`) are only defined in the en dictionary,
 * so in zh mode the literal key string (e.g. "connectionStatus.disconnected")
 * is rendered. Selectors below use regexes that match both the zh key strings
 * and the proper translations to stay locale-independent.
 */

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

const cs2Markets = [
  {
    conditionId: '0xcs2_1',
    slug: 'spirit-vs-g2-bo3',
    question: 'Counter-Strike: Spirit vs G2 (BO3)',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.65', '0.35'],
    volume: 50000,
    volume24h: 12000,
    liquidity: 8000,
    endDate: '2026-06-20T00:00:00Z',
    startDate: '2026-06-19T00:00:00Z',
    status: 'active',
    tags: [],
  },
  {
    conditionId: '0xcs2_2',
    slug: 'vitality-vs-falcons-bo3',
    question: 'Counter-Strike: Vitality vs Team Falcons (BO3)',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.45', '0.55'],
    volume: 35000,
    volume24h: 8000,
    liquidity: 5000,
    endDate: '2026-06-21T00:00:00Z',
    startDate: '2026-06-19T00:00:00Z',
    status: 'active',
    tags: [],
  },
];

// ============================================================
// 1. ConnectionStatus (dashboard status bar)
// ============================================================
test.describe('P2: ConnectionStatus', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/markets**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: cs2Markets, total: cs2Markets.length }),
      }),
    );
    await page.route('**/api/signals**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { topDeviations: [], signalCount: 0 } }),
      }),
    );
  });

  test('connection status indicator is visible in the status bar', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // The status bar renders as a <footer>
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 10000 });

    // Connection status text. Match all possible zh/en variants.
    const connStatus = footer.locator(
      'text=/已连接|连接中|已断开|connectionStatus|connected|connecting|disconnected/i',
    );
    await expect(connStatus.first()).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// 2. MarketHeatmap (dashboard)
// ============================================================
test.describe('P2: MarketHeatmap', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/markets**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: cs2Markets, total: cs2Markets.length }),
      }),
    );
    await page.route('**/api/signals**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { topDeviations: [], signalCount: 0 } }),
      }),
    );
  });

  test('heatmap section renders with at least one cell', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Heatmap title — zh renders the key "heatmap.title", en renders "Market Heatmap"
    const heatmapTitle = page.locator('h2', { hasText: /heatmap|热力图/i });
    await expect(heatmapTitle.first()).toBeVisible({ timeout: 5000 });

    // Heatmap cells are divs carrying h-10 + cursor-pointer classes
    const cells = page.locator('div.h-10.cursor-pointer');
    await expect(cells.first()).toBeVisible({ timeout: 5000 });
    expect(await cells.count()).toBeGreaterThan(0);
  });
});

// ============================================================
// 3. AddressGraph (whales page)
// ============================================================
test.describe('P2: AddressGraph', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    // Single handler for /whales and /whales/graph to avoid route overlap
    await page.route('**/api/whales**', async (route) => {
      const url = route.request().url();
      if (url.includes('/whales/graph')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              nodes: [
                { id: '0xabc', label: 'Whale A', volume: 50000, tradeCount: 10 },
                { id: '0xdef', label: 'Whale B', volume: 30000, tradeCount: 5 },
              ],
              links: [{ source: '0xabc', target: '0xdef', value: 20000 }],
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
              suspiciousScore: {
                total: 75,
                volumeAnomaly: 20,
                timingAnomaly: 25,
                patternAnomaly: 15,
                correlationAnomaly: 15,
              },
              recentTrades: [],
              lastActive: '2026-06-19T10:00:00Z',
            },
          ],
          total: 1,
        }),
      });
    });
  });

  test('address association graph renders an SVG', async ({ page }) => {
    await page.goto('/#/whales');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Graph section title — zh: "地址关联图谱", en: "Address Association Graph"
    const graphTitle = page.locator(
      'text=/地址关联|address (association )?graph|addressGraph/i',
    );
    await expect(graphTitle.first()).toBeVisible({ timeout: 5000 });

    // The AddressGraph component renders an <svg> with a fixed height of 460
    const svg = page.locator('svg[height="460"]');
    await expect(svg).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// 4. AlertManager (signals page)
// ============================================================
test.describe('P2: AlertManager', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/signals/top**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
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
    await page.route('**/api/signals/arbitrage**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { opportunities: [] } }),
      }),
    );
    await page.route('**/api/alerts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route('**/api/markets**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: cs2Markets, total: cs2Markets.length }),
      }),
    );
  });

  test('alert management section renders', async ({ page }) => {
    await page.goto('/#/signals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Alert title — zh: "价格告警", en: "Price Alerts"
    const alertTitle = page.locator('text=/告警|alert/i').first();
    await expect(alertTitle).toBeVisible({ timeout: 5000 });
  });

  test('create alert button exists and is clickable', async ({ page }) => {
    await page.goto('/#/signals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Create button — zh: "创建告警", en: "Create Alert"
    const createBtn = page.getByRole('button', { name: /创建告警|create alert/i });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await expect(createBtn).toBeEnabled();

    // Clicking opens the create dialog
    await createBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    // Dialog title — zh: "创建价格告警", en: "Create Price Alert"
    await expect(
      page.getByText(/创建价格告警|create price alert/i),
    ).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================
// 5. Arbitrage opportunities section (signals page)
// ============================================================
test.describe('P2: Arbitrage Opportunities', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/signals/top**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
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
    await page.route('**/api/signals/arbitrage**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            opportunities: [
              {
                marketSlug: 'spirit-vs-g2-bo3',
                question: 'Counter-Strike: Spirit vs G2',
                type: 'yes_no_spread',
                profitPct: 3.5,
                details: 'Yes/No spread exceeds 3%',
              },
            ],
          },
        }),
      }),
    );
    await page.route('**/api/alerts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route('**/api/markets**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: cs2Markets, total: cs2Markets.length }),
      }),
    );
  });

  test('arbitrage opportunities table renders', async ({ page }) => {
    await page.goto('/#/signals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Arbitrage section title — zh: "套利机会", en: "Arbitrage Opportunities"
    const arbTitle = page.locator('text=/套利|arbitrage/i').first();
    await expect(arbTitle).toBeVisible({ timeout: 5000 });

    // The mocked opportunity should appear as a table row
    await expect(
      page.locator('text=/Spirit vs G2/i').first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
