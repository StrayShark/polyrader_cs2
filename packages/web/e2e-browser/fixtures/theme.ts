import type { Page } from '@playwright/test';

export type AppTheme = 'dark' | 'light' | 'matrix';

const THEME_CLASS: Record<AppTheme, string> = {
  dark: 'theme-dark',
  light: 'theme-light',
  matrix: 'theme-matrix',
};

export async function setTheme(page: Page, theme: AppTheme): Promise<void> {
  await page.evaluate((cls) => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-matrix');
    root.classList.add(cls);
  }, THEME_CLASS[theme]);
  await page.waitForTimeout(100);
}

export async function ensureSidebarVisible(page: Page): Promise<void> {
  await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 });
}

export async function waitForMainHeading(page: Page, hashPath?: string): Promise<void> {
  if (hashPath) {
    const normalized = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
    await page.waitForURL(`**/#${normalized}**`, { timeout: 15000 });
  }
  await ensureSidebarVisible(page);
  await page.locator('main h1').last().waitFor({ state: 'visible', timeout: 20000 });
}
