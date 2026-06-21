import { test, expect, type Page } from '@playwright/test';

/**
 * Navigate to a page and wait for the sidebar to be fully rendered.
 * No API mocking — the app handles API failures gracefully (sidebar renders
 * with empty data; main content shows error/loading states).
 */
async function gotoWithSidebar(page: Page, path = '/') {
  const hashPath = path.startsWith('/#') ? path : `/#${path}`;
  await page.goto(hashPath);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

// ============================================================
// Sidebar: Layout Structure (Desktop)
// ============================================================
test.describe('Sidebar layout structure (desktop)', () => {
  test('renders exactly one sidebar', async ({ page }) => {
    await gotoWithSidebar(page);
    await expect(page.locator('aside')).toHaveCount(1);
  });

  test('sidebar border extends to full viewport height', async ({ page }) => {
    await gotoWithSidebar(page);

    const height = await page.locator('aside').evaluate((el) => {
      return el.getBoundingClientRect().height;
    });

    const viewportHeight = page.viewportSize()?.height ?? 720;
    expect(height).toBeGreaterThan(viewportHeight * 0.95);
  });

  test('sidebar has right border', async ({ page }) => {
    await gotoWithSidebar(page);

    const borderRightWidth = await page.locator('aside').evaluate((el) => {
      return getComputedStyle(el).borderRightWidth;
    });
    expect(parseFloat(borderRightWidth)).toBeGreaterThan(0);
  });

  test('sidebar width is 240px', async ({ page }) => {
    await gotoWithSidebar(page);

    const width = await page.locator('aside').evaluate((el) => {
      return el.getBoundingClientRect().width;
    });
    expect(width).toBe(240);
  });
});

// ============================================================
// Sidebar: Content Visibility (Desktop)
// ============================================================
test.describe('Sidebar content visibility (desktop)', () => {
  test('logo text "PolyRader CS2" is visible', async ({ page }) => {
    await gotoWithSidebar(page);
    await expect(page.locator('aside').getByText('PolyRader CS2')).toBeVisible();
  });

  test('group labels are visible', async ({ page }) => {
    await gotoWithSidebar(page);
    // Group labels are in divs with tracking-wider class
    const groupLabels = page.locator('aside div.tracking-wider');
    await expect(groupLabels).toHaveCount(3);
    const texts = await groupLabels.allTextContents();
    expect(texts.map((t) => t.trim())).toEqual(
      expect.arrayContaining(['Markets', 'Analysis', 'AI']),
    );
  });

  test('all 9 navigation links have non-empty text', async ({ page }) => {
    await gotoWithSidebar(page);
    const navLinks = page.locator('aside nav a');
    await expect(navLinks).toHaveCount(9);
    const texts = await navLinks.allTextContents();
    expect(texts.length).toBe(9);
    for (const text of texts) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('theme toggle buttons are visible', async ({ page }) => {
    await gotoWithSidebar(page);
    await expect(page.locator('aside button[title="Dark+"]')).toBeVisible();
    await expect(page.locator('aside button[title="Light+"]')).toBeVisible();
    await expect(page.locator('aside button[title="Matrix"]')).toBeVisible();
  });
});

// ============================================================
// Sidebar: Mobile Behavior
// ============================================================
test.describe('Sidebar mobile behavior', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('sidebar is not visible by default on mobile', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Desktop sidebar is display:none on mobile (parent has 'hidden' class)
    await expect(page.locator('aside')).not.toBeVisible({ timeout: 5000 });
  });

  test('hamburger menu button is visible', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await expect(page.locator('button[aria-label="Toggle menu"]')).toBeVisible({ timeout: 10000 });
  });

  test('clicking hamburger opens sidebar', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const menuButton = page.locator('button[aria-label="Toggle menu"]');
    await menuButton.click();

    // After clicking, mobile sidebar renders. There are now 2 asides:
    // [0] = desktop sidebar (hidden, parent is display:none)
    // [1] = mobile sidebar (visible)
    await expect(page.locator('aside')).toHaveCount(2);
    const mobileSidebar = page.locator('aside').nth(1);
    await expect(mobileSidebar).toBeVisible();
    await expect(mobileSidebar.getByText('PolyRader CS2')).toBeVisible();
  });

  test('only one sidebar in DOM before menu opens', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    // Desktop sidebar exists in DOM (inside display:none container)
    await expect(page.locator('aside')).toHaveCount(1);
  });
});

// ============================================================
// Visual Regression: Page Screenshots
// ============================================================
test.describe('Visual regression: page screenshots', () => {
  test('dashboard page', async ({ page }) => {
    await gotoWithSidebar(page);
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('daily page', async ({ page }) => {
    await gotoWithSidebar(page, '/daily');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('daily.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('whales page', async ({ page }) => {
    await gotoWithSidebar(page, '/whales');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('whales.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('signals page', async ({ page }) => {
    await gotoWithSidebar(page, '/signals');
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('signals.png', {
      maxDiffPixelRatio: 0.01,
      timeout: 15000,
    });
  });
});
