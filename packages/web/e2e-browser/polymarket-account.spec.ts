import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';

test.describe('Polymarket Account page', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
  });

  test('renders connection, diagnostics, balances, positions, and orders', async ({ page }) => {
    await page.goto('/#/polymarket/account');
    await waitForMainHeading(page);
    await expect(page.locator('main h1')).toBeVisible();

    await expect(page.getByText('连接状态').or(page.getByText('Connection'))).toBeVisible();
    await expect(page.getByText('0x1234...cdef')).toBeVisible();
    await expect(page.getByText('Spirit vs G2').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});
