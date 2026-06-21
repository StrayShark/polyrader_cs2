import { test, expect } from '@playwright/test';

/**
 * P3-1: Page navigation tests.
 *
 * The app uses createHashRouter, so routes live in the URL hash:
 *   http://localhost:5174/#/daily
 * Navigating to "/daily" (no hash) would serve index.html and default to
 * the Dashboard route, so we use hash URLs for every non-root page.
 *
 * No API mocking — the app handles API failures gracefully (sidebar renders
 * with empty data; main content shows error/loading states).
 */

const PAGES = [
  { path: '/#/', name: 'dashboard' },
  { path: '/#/daily', name: 'daily' },
  { path: '/#/whales', name: 'whales' },
  { path: '/#/signals', name: 'signals' },
  { path: '/#/esports', name: 'esports' },
  { path: '/#/ai/config', name: 'ai-config' },
  { path: '/#/ai/stats', name: 'ai-stats' },
];

test.describe('P3-1: Page navigation', () => {
  for (const page of PAGES) {
    test(`${page.name} page renders without crash`, async ({ page: p }) => {
      await p.goto(page.path);
      await p.waitForLoadState('domcontentloaded');

      // Sidebar should be visible (app didn't crash).
      // App shows a loading spinner for ~3-5s during init, so allow extra time.
      await expect(p.locator('aside')).toBeVisible({ timeout: 10000 });

      // Wait for lazy-loaded page content to settle
      await p.waitForTimeout(1000);

      // Page title (h1) should be visible and non-empty
      const h1 = p.locator('h1').first();
      await expect(h1).toBeVisible({ timeout: 5000 });
      const h1Text = await h1.textContent();
      expect(h1Text?.trim().length).toBeGreaterThan(0);

      // No error boundary should be shown (check for error title text)
      const errorText = await p.locator('text=Something went wrong').count();
      expect(errorText).toBe(0);

      // Take screenshot for visual regression
      await expect(p).toHaveScreenshot(`page-${page.name}.png`, {
        maxDiffPixelRatio: 0.05,
        timeout: 15000,
      });
    });
  }

  test('navigation between pages works', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Click on Daily nav link (href selector — language-independent)
    const dailyLink = page.locator('aside nav a[href*="daily"]').first();
    await expect(dailyLink).toBeVisible({ timeout: 5000 });
    await dailyLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Should be on /daily (hash route)
    expect(page.url()).toContain('/daily');
  });
});
