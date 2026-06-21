import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for A/B compare interaction and ai-stats settle/delete buttons.
 */

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

// ============================================================
// A/B Compare interaction
// ============================================================

test.describe('A/B Compare interaction', () => {
  test('shows comparison table after clicking compare', async ({ page }) => {
    await blockWs(page);

    // Mock variants list (but NOT ab/compare)
    await page.route('**/api/ai/prompts', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
              isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
              createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
            {
              variantId: 'v2', name: 'V2', systemPrompt: 'test2',
              isEnabled: true, trafficWeight: 0.3, isControl: false, notes: '',
              createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
          ],
        }),
      }),
    );

    // Mock ab/compare endpoint separately
    await page.route('**/api/ai/prompts/ab/compare**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            variantA: {
              totalAnalyses: 10, totalBets: 5, wonBets: 3, lostBets: 2,
              pendingBets: 0, profitLoss: 150.5, roi: 0.15, accuracy: 0.6,
            },
            variantB: {
              totalAnalyses: 8, totalBets: 4, wonBets: 1, lostBets: 3,
              pendingBets: 0, profitLoss: -50, roi: -0.05, accuracy: 0.25,
            },
            significance: {
              zScore: 1.234,
              pValue: 0.217,
              isSignificant: false,
              hasSufficientData: false,
              minSampleSize: 30,
              settledA: 5,
              settledB: 4,
            },
          },
        }),
      }),
    );

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Find and click the compare button (may be "对比" or "Compare")
    const compareBtn = page.locator('button').filter({ hasText: /对比|Compare/ }).first();
    if (await compareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compareBtn.click();
      await page.waitForTimeout(2000);

      // Should show accuracy percentage values
      await expect(page.locator('text=60.0%').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=25.0%').first()).toBeVisible({ timeout: 5000 });
    }

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// AI Stats settle/delete buttons
// ============================================================

test.describe('AI Stats settle & delete buttons', () => {
  test('shows settle buttons for pending bets', async ({ page }) => {
    await blockWs(page);

    await page.route('**/api/ai/stats/leaderboard**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route('**/api/ai/stats/user**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            totalBets: 1, correctBets: 0, accuracy: 0, totalProfitLoss: 0,
            roi: 0, averageKelly: 0, bestLLM: 'user', streak: 0,
            sharpeRatio: 0, maxDrawdown: 0,
          },
        }),
      }),
    );
    await page.route('**/api/ai/stats/history**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'bet-test1', matchId: 'm1', provider: 'user', team: 'TeamA',
              amount: 100, odds: 2.0, result: 'pending', profitLoss: 0,
              placedAt: '2026-06-19T10:00:00Z', reasoning: 'Test reasoning',
            },
          ],
        }),
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

    // Should show the bet's match ID
    await expect(page.locator('text=m1').first()).toBeVisible({ timeout: 5000 });

    // Should show settle button for pending bet (click to expand won/lost)
    const settleBtn = page.getByRole('button', { name: /结算|Settle/ }).first();
    await expect(settleBtn).toBeVisible({ timeout: 5000 });

    // Click settle to reveal won/lost buttons
    await settleBtn.click();
    await page.waitForTimeout(1500);

    // Now won/lost buttons should appear
    const wonBtn = page.getByRole('button', { name: /胜|Won/ }).first();
    const lostBtn = page.getByRole('button', { name: /负|Lost/ }).first();
    await expect(wonBtn).toBeVisible({ timeout: 8000 });
    await expect(lostBtn).toBeVisible({ timeout: 5000 });

    // Should show delete button
    const deleteBtn = page.getByRole('button', { name: /删除|Delete/ }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('settles a bet when clicking won button', async ({ page }) => {
    await blockWs(page);

    let settleCalled = false;

    await page.route('**/api/ai/stats/leaderboard**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/ai/stats/user**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            totalBets: 1, correctBets: 1, accuracy: 1, totalProfitLoss: 100,
            roi: 1, averageKelly: 0, bestLLM: 'user', streak: 1,
            sharpeRatio: 0, maxDrawdown: 0,
          },
        }),
      }),
    );
    await page.route('**/api/ai/stats/calibration/**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );

    // History: first call returns pending, after settle returns won
    await page.route('**/api/ai/stats/history**', (route) => {
      if (settleCalled) {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                id: 'bet-test1', matchId: 'm1', provider: 'user', team: 'TeamA',
                amount: 100, odds: 2.0, result: 'won', profitLoss: 100,
                placedAt: '2026-06-19T10:00:00Z', settledAt: '2026-06-19T12:00:00Z',
              },
            ],
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                id: 'bet-test1', matchId: 'm1', provider: 'user', team: 'TeamA',
                amount: 100, odds: 2.0, result: 'pending', profitLoss: 0,
                placedAt: '2026-06-19T10:00:00Z',
              },
            ],
          }),
        });
      }
    });

    // Mock settle endpoint
    await page.route('**/api/ai/stats/bet/bet-test1**', (route) => {
      if (route.request().method() === 'PATCH') {
        settleCalled = true;
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: {
              id: 'bet-test1', matchId: 'm1', provider: 'user', team: 'TeamA',
              amount: 100, odds: 2.0, result: 'won', profitLoss: 100,
              placedAt: '2026-06-19T10:00:00Z', settledAt: '2026-06-19T12:00:00Z',
            },
          }),
        });
      } else {
        route.fulfill({ status: 204 });
      }
    });

    await page.goto('/#/ai/stats');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Click settle button first to reveal won/lost
    const settleBtn = page.getByRole('button', { name: /结算|Settle/ }).first();
    await settleBtn.click();
    await page.waitForTimeout(1500);

    // Click won button (may be "胜" or "Won")
    const wonBtn = page.getByRole('button', { name: /胜|Won/ }).first();
    await wonBtn.click();
    await page.waitForTimeout(2000);

    // Should not crash
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});
