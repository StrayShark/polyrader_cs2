import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';

test.describe('LLM Analysis page', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
  });

  test('renders provider stats, equity curve, and breakdown tables', async ({ page }) => {
    await page.goto('/#/llm/analysis/openai');
    await waitForMainHeading(page);
    await expect(page.locator('main h1')).toContainText('openai');

    await expect(page.getByText('70.0%')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Spirit').first()).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible();

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('can navigate back to AI stats via breadcrumb', async ({ page }) => {
    await page.goto('/#/llm/analysis/openai');
    await waitForMainHeading(page);
    await page.getByLabel('Breadcrumb').getByRole('link', { name: /AI 胜率|AI Stats/i }).click();
    await page.waitForURL('**/ai/stats**');
    expect(page.url()).toContain('/ai/stats');
  });
});
