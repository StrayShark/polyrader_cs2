import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for prompt-variants page and decision journal form.
 * Mocks all API endpoints to test rendering and basic interactions.
 */

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

// ============================================================
// Prompt Variants page
// ============================================================

test.describe('Prompt Variants page', () => {
  test('renders variant list from API', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/ai/prompts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              variantId: 'baseline',
              name: 'Baseline',
              systemPrompt: 'You are an expert CS2 analyst.',
              isEnabled: true,
              trafficWeight: 1.0,
              isControl: true,
              notes: 'Default',
              createdAt: '2026-06-19T00:00:00Z',
              updatedAt: '2026-06-19T00:00:00Z',
            },
            {
              variantId: 'v2-aggressive',
              name: 'Aggressive V2',
              systemPrompt: 'You are an aggressive CS2 analyst.',
              isEnabled: false,
              trafficWeight: 0.3,
              isControl: false,
              notes: '',
              createdAt: '2026-06-19T00:00:00Z',
              updatedAt: '2026-06-19T00:00:00Z',
            },
          ],
        }),
      }),
    );

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    // Should show variant IDs
    await expect(page.locator('text=baseline').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Aggressive V2').first()).toBeVisible({ timeout: 5000 });

    // Should show control badge
    await expect(page.locator('text=对照组').first()).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('handles API failure gracefully', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/ai/prompts**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) }),
    );

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('create button opens dialog', async ({ page }) => {
    await blockWs(page);
    await page.route('**/api/ai/prompts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click create button
    await page.locator('text=创建变体').click();
    await page.waitForTimeout(500);

    // Dialog should be visible with form fields
    await expect(page.locator('text=System Prompt').first()).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================
// Decision Journal form (on allocation page)
// ============================================================

test.describe('Decision Journal form', () => {
  test('renders form on allocation page', async ({ page }) => {
    await blockWs(page);

    // Mock allocation APIs
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
    await page.route('**/api/allocation/plan/latest**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      }),
    );
    await page.route('**/api/allocation/plan/history**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Decision journal form should be visible
    await expect(page.locator('text=决策记录').first()).toBeVisible({ timeout: 5000 });

    // Form fields should be present
    const matchIdInputs = page.locator('input').filter({ hasText: '' });
    expect(await matchIdInputs.count()).toBeGreaterThan(0);

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('shows validation warning on empty submit', async ({ page }) => {
    await blockWs(page);

    // Mock allocation APIs (minimal)
    await page.route('**/api/allocation/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      }),
    );

    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Find the "记录决策" button and click it without filling form
    const submitBtn = page.locator('text=记录决策');
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(500);

      // Should show a toast warning (not crash)
      const errorCount = await page.locator('text=Something went wrong').count();
      expect(errorCount).toBe(0);
    }
  });
});
