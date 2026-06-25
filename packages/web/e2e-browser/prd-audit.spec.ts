import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';
import { writeAuditReport, type AuditEntry } from './design/report-writer';

const auditResults: AuditEntry[] = [];

function record(page: string, module: string, status: AuditEntry['status'], note?: string) {
  auditResults.push({ page, module, status, note });
}

test.describe('PRD module audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  test.afterAll(() => {
    writeAuditReport('e2e-prd-audit.json', auditResults, 'E2E PRD 功能审计');
  });

  test('Dashboard — stats, heatmap, anomalies, deviations, markets', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/');
    await waitForMainHeading(page);

    record('dashboard', 'page-render', 'pass');
    record('dashboard', 'stats-cards', await page.locator('main .grid').first().isVisible() ? 'pass' : 'fail');
    record('dashboard', 'heatmap', await page.getByText('市场热力图').isVisible() ? 'pass' : 'fail');
    record('dashboard', 'anomaly-table', await page.getByText('Spirit vs G2').count() > 0 ? 'pass' : 'fail');
    record('dashboard', 'active-markets', await page.locator('main table').count() > 0 ? 'pass' : 'fail');
  });

  test('Daily — overview, deviations, whale alerts', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/daily');
    await waitForMainHeading(page);
    record('daily', 'page-render', 'pass');
    record('daily', 'overview-cards', await page.locator('main .grid').first().isVisible() ? 'pass' : 'fail');
    record('daily', 'match-table', await page.getByText('Spirit').count() > 0 ? 'pass' : 'fail');
  });

  test('Match Detail — header, LLM consensus, orderbook, decision', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');
    await waitForMainHeading(page);
    await expect(page.getByText('Spirit').first()).toBeVisible();

    record('match-detail', 'page-render', 'pass');
    record('match-detail', 'price-chart', await page.locator('main canvas').count() > 0 ? 'pass' : 'fail');

    await page.getByRole('button', { name: '触发 LLM 分析' }).click();
    await expect(page.getByText('LLM 共识分析')).toBeVisible({ timeout: 10000 });
    record('match-detail', 'llm-consensus', await page.locator('main svg').count() > 1 ? 'pass' : 'partial');

    record('match-detail', 'orderbook', await page.getByText('订单簿深度').first().isVisible() ? 'pass' : 'fail');
        record('match-detail', 'decision-area', await page.getByRole('button', { name: '投注 Spirit' }).isVisible() ? 'pass' : 'fail');
  });

  test('Whales — leaderboard and graph', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    record('whales', 'page-render', 'pass');
    record('whales', 'leaderboard', await page.getByText('0xabc1').count() > 0 ? 'pass' : 'fail');
  });

  test('Esports — rankings and schedule', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/esports');
    await waitForMainHeading(page);
    record('esports', 'page-render', 'pass');
    record('esports', 'rankings', await page.getByText('Team Spirit').count() > 0 ? 'pass' : 'partial');
    record('esports', 'schedule', await page.getByText('Spirit').count() > 0 ? 'pass' : 'partial');
  });

  test('Signals — comparison, backtest, arbitrage', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/signals');
    await waitForMainHeading(page);
    record('signals', 'page-render', 'pass');
    record('signals', 'signal-table', await page.locator('main table').count() > 0 ? 'pass' : 'fail');
    record('signals', 'backtest-panel', await page.getByText('历史回测与校准').isVisible() ? 'pass' : 'fail');
  });

  test('Polymarket Account — connection and holdings', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/polymarket/account');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('连接状态')).toBeVisible({ timeout: 10000 });
    record('polymarket-account', 'page-render', 'pass');
    record('polymarket-account', 'connection-status', 'pass');
    record('polymarket-account', 'positions', await page.getByText('Spirit vs G2').count() > 0 ? 'pass' : 'fail');
  });

  test('AI Config — keys, usage, background tasks', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/ai/config');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    record('ai-config', 'page-render', 'pass');
    record('ai-config', 'api-keys', await page.getByText('openai').count() > 0 ? 'pass' : 'partial');
    record('ai-config', 'background-tasks', await page.getByText('后台任务').count() > 0 ? 'pass' : 'fail');
  });

  test('AI Stats — leaderboard and user stats', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/ai/stats');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    record('ai-stats', 'page-render', 'pass');
    record('ai-stats', 'leaderboard', await page.getByText('openai').count() > 0 ? 'pass' : 'partial');
  });

  test('LLM Analysis — equity and breakdown', async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto('/#/llm/analysis/openai');
    await waitForMainHeading(page);
    record('llm-analysis', 'page-render', 'pass');
    record('llm-analysis', 'equity-curve', await page.locator('svg').count() > 0 ? 'pass' : 'partial');
    record('llm-analysis', 'team-breakdown', await page.getByText('Spirit').count() > 0 ? 'pass' : 'partial');
  });

  test('Prompt Variants, Allocation, Simulation — render', async ({ page }) => {
    await setupCommonMocks(page);

    await page.goto('/#/prompt-variants');
    await waitForMainHeading(page, '/prompt-variants');
    record('prompt-variants', 'page-render', 'pass');

    await page.goto('/#/allocation');
    await waitForMainHeading(page, '/allocation');
    record('allocation', 'page-render', 'pass');

    await page.goto('/#/simulation');
    await waitForMainHeading(page, '/simulation');
    record('simulation', 'page-render', 'pass');
  });
});
