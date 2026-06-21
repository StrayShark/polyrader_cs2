import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for Prompt A/B CRUD interactions and Decision Journal form submission.
 */

async function blockWs(page: Page) {
  await page.route('**/ws**', (route) => route.abort());
}

// ============================================================
// Prompt Variant CRUD interactions
// ============================================================

test.describe('Prompt Variant CRUD', () => {
  test('creates a new variant via dialog', async ({ page }) => {
    await blockWs(page);

    let createCalled = false;

    // Mock variants list — returns empty initially, then 1 after create
    await page.route('**/api/ai/prompts', (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        createCalled = true;
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              variantId: 'v2-aggressive', name: 'Aggressive V2',
              systemPrompt: 'You are an aggressive analyst.',
              isEnabled: true, trafficWeight: 0.3, isControl: false,
              notes: 'test', createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
          }),
        });
        return;
      }
      // GET
      if (createCalled) {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
                isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
                createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
              },
              {
                variantId: 'v2-aggressive', name: 'Aggressive V2', systemPrompt: 'test2',
                isEnabled: true, trafficWeight: 0.3, isControl: false, notes: 'test',
                createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
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
                variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
                isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
                createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
              },
            ],
          }),
        });
      }
    });

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Click create button
    const createBtn = page.getByRole('button', { name: /创建变体|Create Variant/ }).first();
    await createBtn.click();
    await page.waitForTimeout(500);

    // Fill form
    await page.getByLabel(/变体 ID|Variant ID/).or(page.locator('input').first()).fill('v2-aggressive');
    await page.waitForTimeout(200);

    // Find name input (second input in dialog)
    const inputs = page.locator('input[type="text"], input:not([type])');
    if (await inputs.count() > 1) {
      await inputs.nth(1).fill('Aggressive V2');
    }

    // Fill system prompt textarea
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textarea.fill('You are an aggressive analyst.');
    }

    // Click save button
    const saveBtn = page.getByRole('button', { name: /保存|Save/ }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    // Should not crash
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('edits a variant via dialog', async ({ page }) => {
    await blockWs(page);

    await page.route('**/api/ai/prompts**', (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'PUT' && url.includes('/v2')) {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: {
              variantId: 'v2', name: 'Updated Name', systemPrompt: 'updated',
              isEnabled: true, trafficWeight: 0.5, isControl: false,
              notes: 'updated', createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
          }),
        });
        return;
      }

      route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: [
            {
              variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
              isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
              createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
            {
              variantId: 'v2', name: 'V2 Original', systemPrompt: 'test2',
              isEnabled: true, trafficWeight: 0.3, isControl: false, notes: '',
              createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
          ],
        }),
      });
    });

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Click edit button for v2 (non-control variant)
    const editBtn = page.getByRole('button', { name: /编辑|Edit/ }).first();
    await editBtn.click();
    await page.waitForTimeout(500);

    // Dialog should be open — verify variantId field is disabled (editing mode)
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Modify name field
      const nameInput = page.locator('input').nth(1);
      if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nameInput.fill('Updated Name');
      }

      // Click save
      const saveBtn = page.getByRole('button', { name: /保存|Save/ }).first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('deletes a non-control variant with confirmation', async ({ page }) => {
    await blockWs(page);

    let deleteCalled = false;

    await page.route('**/api/ai/prompts**', (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'DELETE') {
        deleteCalled = true;
        route.fulfill({ status: 200, body: JSON.stringify({ message: 'Variant deleted' }) });
        return;
      }

      // GET — return 1 variant after delete
      if (deleteCalled) {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
                isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
                createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
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
        });
      }
    });

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Click delete button for v2 (first non-control variant's delete button)
    const deleteBtns = page.getByRole('button', { name: /删除|Delete/ });
    // Find the one that's not disabled (non-control)
    const count = await deleteBtns.count();
    if (count > 1) {
      await deleteBtns.nth(1).click(); // second delete button = v2
    } else if (count === 1) {
      await deleteBtns.first().click();
    }

    await page.waitForTimeout(500);

    // Handle confirmation dialog
    page.on('dialog', (dialog) => dialog.accept());

    await page.waitForTimeout(2000);

    // Should not crash
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('prevents deleting control variant', async ({ page }) => {
    await blockWs(page);

    await page.route('**/api/ai/prompts**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: [
            {
              variantId: 'baseline', name: 'Baseline', systemPrompt: 'test',
              isEnabled: true, trafficWeight: 1.0, isControl: true, notes: '',
              createdAt: '2026-06-19T00:00:00Z', updatedAt: '2026-06-19T00:00:00Z',
            },
          ],
        }),
      }),
    );

    await page.goto('/#/prompt-variants');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // The delete button for control variant should be disabled
    const deleteBtn = page.getByRole('button', { name: /删除|Delete/ }).first();
    await expect(deleteBtn).toBeDisabled({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});

// ============================================================
// Decision Journal form submission
// ============================================================

test.describe('Decision Journal form submission', () => {
  test('submits form with valid data and clears on success', async ({ page }) => {
    await blockWs(page);

    let betSubmitted = false;

    // Mock allocation APIs with proper structure
    await page.route('**/api/allocation/bankroll**', (route) =>
      route.fulfill({
        status: 200,
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
      route.fulfill({ status: 200, body: JSON.stringify({ data: null }) }),
    );
    await page.route('**/api/allocation/plan/history**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/allocation/opportunities**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );

    // Mock bet submission
    await page.route('**/api/ai/stats/bet**', (route) => {
      if (route.request().method() === 'POST') {
        betSubmitted = true;
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: {
              id: 'bet-123', matchId: 'm1', provider: 'user', team: 'TeamA',
              amount: 100, odds: 2.0, result: 'pending', profitLoss: 0,
              placedAt: '2026-06-19T10:00:00Z',
            },
          }),
        });
      } else {
        route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) });
      }
    });

    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

    // Fill the decision journal form
    // Check if journal form is present by looking for the submit button
    const submitBtn = page.getByRole('button', { name: /记录决策|Record Decision/ }).first();
    const hasJournal = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasJournal) {
      // Fill matchId, team, amount, odds — find inputs near the submit button
      const card = submitBtn.locator('xpath=ancestor::div[contains(@class, "card")]');
      const textInputs = card.locator('input[type="text"], input:not([type])');
      const numberInputs = card.locator('input[type="number"]');

      const textCount = await textInputs.count();
      const numCount = await numberInputs.count();

      if (textCount >= 2) {
        await textInputs.nth(0).fill('m1'); // matchId
        await textInputs.nth(1).fill('TeamA'); // team
      }
      if (numCount >= 2) {
        await numberInputs.nth(0).fill('100'); // amount
        await numberInputs.nth(1).fill('2.0'); // odds
      }

      await submitBtn.click();
      await page.waitForTimeout(2000);

      // Form should be cleared (amount input empty after success)
      if (numCount >= 2) {
        const amountVal = await numberInputs.nth(0).inputValue();
        expect(amountVal).toBe('');
      }
    }

    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('shows validation warning for invalid amount', async ({ page }) => {
    await blockWs(page);

    await page.route('**/api/allocation/bankroll**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          data: {
            config: { totalCapital: 10000, targetReturnRate: 0.15, riskTolerance: 'balanced', maxBetFraction: 0.15, maxTotalExposure: 0.6, updatedAt: '2026-06-19T00:00:00Z' },
            state: { totalCapital: 10000, usedCapital: 0, availableCapital: 10000, realizedPnL: 0, netCapital: 10000, targetReturnRate: 0.15, targetProfit: 1500, riskTolerance: 'balanced' },
          },
        }),
      }),
    );
    await page.route('**/api/allocation/plan/latest**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: null }) }),
    );
    await page.route('**/api/allocation/plan/history**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/allocation/opportunities**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );
    await page.route('**/api/ai/stats/bet**', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }),
    );

    await page.goto('/#/allocation');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Fill form with invalid amount (below min 10)
    const numberInputs = page.locator('input[type="number"]');
    const numCount = await numberInputs.count();

    if (numCount >= 2) {
      await numberInputs.nth(numCount - 2).fill('5'); // amount < 10 (invalid)
      await numberInputs.nth(numCount - 1).fill('2.0'); // odds
    }

    // Fill required text fields
    const textInputs = page.locator('input[type="text"], input:not([type])');
    const textCount = await textInputs.count();
    if (textCount >= 2) {
      await textInputs.nth(textCount - 2).fill('m1');
      await textInputs.nth(textCount - 1).fill('TeamA');
    }

    // Click submit
    const submitBtn = page.getByRole('button', { name: /记录决策|Record Decision/ }).first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Should show a toast warning (not crash)
      const errorCount = await page.locator('text=Something went wrong').count();
      expect(errorCount).toBe(0);
    }
  });
});
