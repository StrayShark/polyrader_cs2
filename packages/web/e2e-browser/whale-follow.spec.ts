import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

test.describe('Whale follow & copy trading', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('shows follow tab with paper copy notice and config', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    await expect(page.getByText(/纸面跟单|Paper Copy Trading/i).first()).toBeVisible();
    await expect(page.getByText(/跟单配置|Copy Trading Config/i).first()).toBeVisible();
    await expect(page.getByText(/已关注钱包|Followed Wallets/i).first()).toBeVisible();
    await expect(page.getByText(/跟单信号|Copy Signals/i).first()).toBeVisible();
    await expect(page.getByText(/纸面模式|Paper/i).first()).toBeVisible();
    await expect(page.getByText(/实盘模式|Live/i)).toHaveCount(0);
  });

  test('leaderboard rows expose follow star control', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await expect(page.getByTitle(/关注|Follow/i).first()).toBeVisible();
  });
});
