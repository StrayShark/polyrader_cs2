// Anti-detection strategies for web scraping.
//
// Two modes:
//   1. fetchWithRetry  — plain fetch with UA rotation + rate limiting (lightweight)
//   2. fetchWithBrowser — headless Chromium via Playwright (bypasses Cloudflare / JS challenges)
//
// fetchWithBrowser lazily starts a single browser instance and reuses it.
// Pages are created per-request with randomized viewport, locale, and UA.

import { chromium, type Browser, type BrowserContext } from 'playwright';

// ---------------------------------------------------------------------------
// User-Agent pool — real browser UAs, updated regularly
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5. (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
];

const LOCALES = ['en-US', 'en-GB', 'en-CA', 'de-DE', 'fr-FR'];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
];

// ---------------------------------------------------------------------------
// Rate limiting — randomised delay between requests
// ---------------------------------------------------------------------------

let lastRequestTime = 0;
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 6000;

function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getHeaders(): Record<string, string> {
  return {
    'User-Agent': getRandomUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    DNT: '1',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
}

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const delay = randomDelay();
  if (elapsed < delay) {
    await new Promise((resolve) => setTimeout(resolve, delay - elapsed));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Plain fetch with retry (lightweight)
// ---------------------------------------------------------------------------

export async function fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await rateLimit();
      const response = await fetch(url, { headers: getHeaders() });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err as Error;
      // Exponential backoff with jitter
      const base = Math.pow(2, attempt) * 1000;
      const jitter = Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, base + jitter));
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

// ---------------------------------------------------------------------------
// Playwright browser fetch (bypasses Cloudflare / JS challenges)
// ---------------------------------------------------------------------------

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;

  // Auto-cleanup on exit
  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Fetch a page using a headless browser.
 *
 * This bypasses Cloudflare and JavaScript-based bot detection.
 * Each request gets a fresh browser context with randomised fingerprint
 * (UA, viewport, locale, timezone) and a random delay before navigation
 * to mimic human behaviour.
 */
export async function fetchWithBrowser(url: string, maxRetries = 2): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let context: BrowserContext | null = null;
    try {
      await rateLimit();

      const browser = await getBrowser();
      const ua = getRandomUserAgent();
      const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
      const locale = LOCALES[Math.floor(Math.random() * LOCALES.length)];
      const timezone = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];

      context = await browser.newContext({
        userAgent: ua,
        viewport,
        locale,
        timezoneId: timezone,
        extraHTTPHeaders: {
          'Accept-Language': `${locale},${locale.split('-')[0]};q=0.9`,
        },
      });

      // Remove webdriver flag to avoid detection
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Overwrite plugins to look real
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        // Overwrite languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
      });

      const page = await context.newPage();

      // Random mouse movement before navigation (mimics human)
      await page.mouse.move(Math.random() * 500, Math.random() * 500);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() ?? 'unknown'}: ${response?.statusText() ?? 'no response'}`);
      }

      // Wait a bit for any JS challenge to resolve
      await page.waitForTimeout(1500 + Math.random() * 1500);

      const html = await page.content();

      await context.close();
      context = null;

      return html;
    } catch (err) {
      lastError = err as Error;
      // Exponential backoff with jitter
      const base = Math.pow(2, attempt) * 2000;
      const jitter = Math.floor(Math.random() * 2000);
      await new Promise((resolve) => setTimeout(resolve, base + jitter));
    } finally {
      if (context) {
        try { await context.close(); } catch { /* ignore */ }
      }
    }
  }

  throw lastError ?? new Error('Browser fetch: max retries exceeded');
}

/**
 * Close the browser instance (call on shutdown).
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
}
