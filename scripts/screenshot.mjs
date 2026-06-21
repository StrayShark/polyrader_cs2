import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, '../.trae/documents/ui-design.html');
const OUT_DIR = resolve(__dirname, '../.trae/documents/screenshots');

const THEMES = ['dark', 'light', 'matrix'];
const PAGES = [
  { hash: '/', name: 'dashboard' },
  { hash: '/daily', name: 'daily' },
  { hash: '/market/navi-faze', name: 'market' },
  { hash: '/whales', name: 'whales' },
  { hash: '/esports', name: 'esports' },
  { hash: '/signals', name: 'signals' },
  { hash: '/betting', name: 'betting' },
  { hash: '/llm/manage', name: 'llm-manage' },
  { hash: '/llm/analysis/gpt4o', name: 'llm-analysis' },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

async function screenshot() {
  const browser = await puppeteer.launch({ headless: 'new' });

  for (const theme of THEMES) {
    for (const page of PAGES) {
      const tab = await browser.newPage();
      await tab.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

      const url = `file://${HTML_PATH}#${page.hash}`;
      await tab.goto(url, { waitUntil: 'networkidle0' });

      // Set theme
      await tab.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('polyrader-theme', t);
      }, theme);

      // Wait for render
      await new Promise(r => setTimeout(r, 500));

      const filename = `ui-${theme}-${page.name}.png`;
      await tab.screenshot({ path: resolve(OUT_DIR, filename), fullPage: false });
      console.log(`✓ ${filename}`);

      await tab.close();
    }
  }

  await browser.close();
  console.log(`\nDone! ${THEMES.length * PAGES.length} screenshots saved to ${OUT_DIR}`);
}

screenshot().catch(err => { console.error(err); process.exit(1); });
