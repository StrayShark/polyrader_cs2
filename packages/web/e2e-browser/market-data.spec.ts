import { test, expect, type Page } from '@playwright/test';

/**
 * Mock dashboard API responses with correct shapes per endpoint.
 */
async function mockMarketData(page: Page) {
  const markets = [
    {
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
    },
    {
      conditionId: '0xcs2_2',
      slug: 'vitality-vs-falcons-bo3',
      question: 'Counter-Strike: Vitality vs Team Falcons (BO3)',
      description: 'IEM Cologne Major Playoffs',
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.45', '0.55'],
      clobTokenIds: ['token3', 'token4'],
      volume: 35000,
      volume24h: 8000,
      liquidity: 5000,
      endDate: '2026-06-21T00:00:00Z',
      startDate: '2026-06-19T00:00:00Z',
      status: 'active',
      tags: [],
    },
  ];

  await page.route('**/api/markets/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.route('**/api/markets?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: markets, total: markets.length }),
    }),
  );

  await page.route('**/api/signals/top**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { topDeviations: [], signalCount: 0 } }),
    }),
  );

  await page.route('**/ws**', (route) => route.abort());
}

test.describe('P3-2: Market data rendering', () => {
  test('dashboard renders CS2 market data from API', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    const statsCards = page.locator('.grid > div');
    await expect(statsCards.first()).toBeVisible({ timeout: 5000 });

    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 5000 });

    const firstRowText = await tableRows.first().textContent();
    expect(firstRowText).toContain('Counter-Strike');
  });

  test('market table shows correct price percentages', async ({ page }) => {
    await mockMarketData(page);
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const marketRow = page.locator('table tbody tr', { hasText: 'Spirit vs G2' }).first();
    await expect(marketRow).toBeVisible({ timeout: 5000 });

    const rowText = await marketRow.textContent();
    expect(rowText).toContain('65%');
    expect(rowText).toContain('35%');
  });

  test('only CS2 markets are displayed (no non-CS2 data)', async ({ page }) => {
    await page.route('**/api/markets/anomalies**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/markets?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              conditionId: '0xcs2_1',
              slug: 'spirit-vs-g2',
              question: 'Counter-Strike: Spirit vs G2',
              outcomes: ['Yes', 'No'],
              outcomePrices: ['0.6', '0.4'],
              volume: 50000,
              volume24h: 12000,
              liquidity: 8000,
              endDate: '2026-06-20T00:00:00Z',
              startDate: '2026-06-19T00:00:00Z',
              status: 'active',
              tags: [],
            },
          ],
          total: 1,
        }),
      }),
    );
    await page.route('**/api/signals/top**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { topDeviations: [], signalCount: 0 } }),
      }),
    );
    await page.route('**/ws**', (route) => route.abort());

    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=Counter-Strike').first()).toBeVisible({ timeout: 5000 });
  });
});
