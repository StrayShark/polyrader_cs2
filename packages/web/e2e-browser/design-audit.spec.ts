import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, type AppTheme } from './fixtures/theme';
import { DESIGN_AUDIT_PAGES } from './fixtures/routes';
import { isNearColor, isShadowNone, themeExpectations } from './design/cursor-tokens';
import { writeAuditReport, type AuditEntry } from './design/report-writer';

const auditResults: AuditEntry[] = [];
const THEMES: AppTheme[] = ['light', 'dark', 'matrix'];

function record(page: string, module: string, theme: string, status: AuditEntry['status'], note?: string) {
  auditResults.push({ page, module, theme, status, note });
}

async function readCssVar(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate((varName) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return '';
    const probe = document.createElement('div');
    probe.style.backgroundColor = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  }, name);
}

test.describe('Cursor design audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  test.afterAll(() => {
    writeAuditReport('e2e-design-audit.json', auditResults, 'E2E Cursor 视觉审计');
  });

  for (const theme of THEMES) {
    test(`theme tokens — ${theme}`, async ({ page }) => {
      await page.goto('/#/');
      await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 });
      await setTheme(page, theme);

      const expected = themeExpectations(theme);
      const background = await readCssVar(page, '--background');
      const foreground = await readCssVar(page, '--foreground');
      const primary = await readCssVar(page, '--primary');
      const border = await readCssVar(page, '--border');

      record('global', 'background', theme, isNearColor(background, expected.background) ? 'pass' : 'fail', `got ${background}`);
      record('global', 'foreground', theme, isNearColor(foreground, expected.foreground) ? 'pass' : 'fail', `got ${foreground}`);

      if (expected.primaryException) {
        record('global', 'primary', theme, 'exception', `Matrix green primary allowed: ${primary}`);
      } else {
        record('global', 'primary', theme, isNearColor(primary, expected.primary) ? 'pass' : 'fail', `got ${primary}`);
      }

      record('global', 'border', theme, isNearColor(border, expected.border) ? 'pass' : 'partial', `got ${border}`);
    });
  }

  for (const theme of THEMES) {
    for (const route of DESIGN_AUDIT_PAGES) {
      test(`components — ${route.name} @ ${theme}`, async ({ page }) => {
        await page.goto(route.hash);
        await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 });
        await setTheme(page, theme);
        await page.waitForTimeout(500);

        const card = page.locator('[class*="rounded-lg"][class*="border"]').first();
        if (await card.count()) {
          const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
          record(route.name, 'card-no-shadow', theme, isShadowNone(shadow) ? 'pass' : 'fail', shadow);
        }

        const primaryBtn = page.locator('button.bg-primary, button[class*="bg-primary"]').first();
        if (await primaryBtn.count()) {
          const height = await primaryBtn.evaluate((el) => el.getBoundingClientRect().height);
          const min = themeExpectations(theme).primaryButtonMinHeight;
          record(route.name, 'primary-button-height', theme, height >= min - 2 ? 'pass' : 'partial', `${height}px`);
        }

        const mono = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        record(route.name, 'body-font-inter', theme, /Inter/i.test(mono) ? 'pass' : 'partial', mono);
      });
    }
  }
});
