import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading, type AppTheme } from './fixtures/theme';
import { APP_ROUTES } from './fixtures/routes';

const THEMES: AppTheme[] = ['dark', 'light', 'matrix'];

const MATCH_DETAIL_ROUTE = {
  path: '/match/spirit-vs-g2-bo3',
  name: 'match-detail',
  hash: '/#/match/spirit-vs-g2-bo3',
};

const VISUAL_ROUTES = [...APP_ROUTES, MATCH_DETAIL_ROUTE];

test.describe('Visual regression — 12 routes × 3 themes', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  for (const theme of THEMES) {
    for (const route of VISUAL_ROUTES) {
      test(`${route.name} @ ${theme}`, async ({ page }) => {
        if (route.name === 'match-detail') {
          await setupMatchDetailMocks(page);
        } else {
          await setupCommonMocks(page);
        }

        await page.goto(route.hash);
        await waitForMainHeading(page, route.path);
        await setTheme(page, theme);
        await page.waitForTimeout(600);

        await expect(page).toHaveScreenshot(`${theme}-${route.name}.png`, {
          maxDiffPixelRatio: 0.06,
          timeout: 20000,
          mask: [page.locator('footer')],
        });
      });
    }
  }
});
