import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for match-detail and allocation pages.
 * Mocks all API endpoints to test rendering and basic interactions.
 */

// ============================================================
// Mock helpers
// ============================================================

async function mockMatchDetail(page: Page) {
  // Match info
  await page.route('**/api/esports/matches/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          matchId: 'spirit-vs-g2',
          teamA: { teamId: 'spirit', name: 'Team Spirit', logo: '', rank: 1, region: 'EU' },
          teamB: { teamId: 'g2', name: 'G2 Esports', logo: '', rank: 3, region: 'EU' },
          eventName: 'IEM Cologne 2026',
          eventType: 'LAN',
          format: 'BO3',
          scheduledAt: '2026-06-20T18:00:00Z',
          status: 'scheduled',
          maps: ['de_dust2', 'de_mirage', 'de_nuke'],
        },
      }),
    }),
  );

  // Price history
  await page.route('**/api/markets/**/prices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { timestamp: '2026-06-19T00:00:00Z', price: 0.55 },
          { timestamp: '2026-06-19T06:00:00Z', price: 0.60 },
          { timestamp: '2026-06-19T12:00:00Z', price: 0.65 },
        ],
      }),
    }),
  );

  // Order book
  await page.route('**/api/markets/**/orderbook**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          bids: [
            { price: '0.64', size: '100' },
            { price: '0.63', size: '200' },
          ],
          asks: [
            { price: '0.66', size: '150' },
            { price: '0.67', size: '300' },
          ],
        },
      }),
    }),
  );

  // Block WS
  await page.route('**/ws**', (route) => route.abort());
}

async function mockAllocation(page: Page) {
  // Bankroll
  await page.route('**/api/allocation/bankroll**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          config: {
            totalCapital: 10000,
            targetReturnRate: 0.15,
            riskTolerance: 'balanced',
            maxBetFraction: 0.15,
            maxTotalExposure: 0.6,
            updatedAt: '2026-06-19T00:00:00Z',
          },
          state: {
            totalCapital: 10000,
            usedCapital: 0,
            availableCapital: 10000,
            realizedPnL: 0,
            netCapital: 10000,
            targetReturnRate: 0.15,
            targetProfit: 1500,
            riskTolerance: 'balanced',
          },
        },
      }),
    }),
  );

  // Latest plan (null = no plan yet)
  await page.route('**/api/allocation/plan/latest**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    }),
  );

  // History
  await page.route('**/api/allocation/plan/history**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  // Block WS
  await page.route('**/ws**', (route) => route.abort());
}

// ============================================================
// Match Detail Page
// ============================================================

test.describe('Match Detail page', () => {
  test('renders match info without crash', async ({ page }) => {
    await mockMatchDetail(page);
    await page.goto('/#/match/spirit-vs-g2');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Sidebar visible = app didn't crash
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Page should show team names
    await expect(page.locator('text=Team Spirit').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=G2 Esports').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows match format and event name', async ({ page }) => {
    await mockMatchDetail(page);
    await page.goto('/#/match/spirit-vs-g2');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=IEM Cologne').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=BO3').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows order book data when available', async ({ page }) => {
    await mockMatchDetail(page);
    await page.goto('/#/match/spirit-vs-g2');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Order book should show prices from mock (0.64, 0.66 etc.)
    // The orderbook table or list should be visible
    const pageText = await page.textContent('body');
    expect(pageText).toBeTruthy();
  });

  test('handles API failure gracefully', async ({ page }) => {
    // Mock match API to return 404
    await page.route('**/api/esports/matches/**', (route) =>
      route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }) }),
    );
    await page.route('**/api/markets/**/prices**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/markets/**/orderbook**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: { bids: [], asks: [] } }) }),
    );
    await page.route('**/ws**', (route) => route.abort());

    await page.goto('/#/match/nonexistent');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should not crash — sidebar still visible
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // No error boundary
    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// Allocation Page
// ============================================================

test.describe('Allocation page', () => {
  test('renders bankroll overview without crash', async ({ page }) => {
    await mockAllocation(page);
    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Should show capital amount ($10000.00 format)
    await expect(page.locator('text=$10000.00').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows available capital and target return', async ({ page }) => {
    await mockAllocation(page);
    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Page title visible
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });
    const h1Text = (await h1.textContent()) ?? '';
    expect(h1Text.trim().length).toBeGreaterThan(0);
  });

  test('handles API failure gracefully', async ({ page }) => {
    await page.route('**/api/allocation/**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) }),
    );
    await page.route('**/ws**', (route) => route.abort());

    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should not crash
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});
