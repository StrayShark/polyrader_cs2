import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

/**
 * P1 UI audit fixes:
 * 1. AI stats page — ProductModeNotice (simulation)
 * 2. CopyFollowPanel — design-system Input (not raw <input>)
 * 3. Sidebar — distinct icons per nav item (label-based check)
 * 4. Whales follow tab — onboarding guide when no followed wallets
 */
test.describe('P1 UI audit fixes', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('AI stats page shows simulation mode notice', async ({ page }) => {
    await page.goto('/#/ai/stats');
    await waitForMainHeading(page);
    await expect(page.getByText(/模拟投注|Paper Trading/i).first()).toBeVisible();
    await expect(page.getByText(/不会向 Polymarket|No real Polymarket/i).first()).toBeVisible();
  });

  test('follow tab shows onboarding guide when wallet list is empty', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    await expect(page.getByText(/如何开始关注跟单|Getting Started with Copy Follow/i).first()).toBeVisible();
    await expect(page.getByText(/关注钱包|Follow Wallets/i).first()).toBeVisible();
    await expect(page.getByText(/配置跟单|Configure Copy/i).first()).toBeVisible();
    await expect(page.getByText(/接收信号|Receive Signals/i).first()).toBeVisible();
  });

  test('copy config uses design-system number inputs', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    const spinbuttons = page.getByRole('spinbutton');
    await expect(spinbuttons).toHaveCount(4);
    expect(await page.locator('input:not([class*="flex"])').count()).toBe(0);
  });

  test('sidebar AI section has distinct nav labels', async ({ page }) => {
    await page.goto('/#/');
    await waitForMainHeading(page);

    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('link', { name: /Prompt|prompt-variants|提示词/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /资金分配|Allocation/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /模拟盘|Simulation/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Polymarket/i })).toBeVisible();
  });
});
