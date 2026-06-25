import type { Page } from '@playwright/test';

export async function blockWs(page: Page): Promise<void> {
  await page.route('**/ws**', (route) => route.abort());
}
