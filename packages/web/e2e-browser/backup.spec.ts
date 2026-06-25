import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

test.describe('Data backup panel', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('shows backup export/import on AI config page', async ({ page }) => {
    await page.goto('/#/ai/config');
    await waitForMainHeading(page);

    await expect(page.getByText(/数据备份|Data Backup/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /导出备份|Export backup/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /导入备份|Import backup/i })).toBeVisible();
    await expect(page.getByText(/本地 SQLite|Local SQLite/i).first()).toBeVisible();
  });
});
