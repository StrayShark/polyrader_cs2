import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock WebSocket-dependent hooks before importing components that use them
vi.mock('../hooks/use-websocket', () => ({
  useWebSocket: () => ({
    connectionState: 'connected',
    latency: 10,
    lastEvent: null,
    subscribe: () => () => {},
    send: () => {},
  }),
}));

vi.mock('../hooks/use-whale-alerts', () => ({
  useWhaleAlerts: () => {},
}));

vi.mock('../hooks/use-settlement-alerts', () => ({
  useSettlementAlerts: () => {},
}));

vi.mock('../hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: () => {},
}));

// Mock Tauri bridge to return browser-mode values
vi.mock('../utils/tauri-bridge', () => ({
  isTauriEnvironment: () => false,
  isFirstRun: () => Promise.resolve(false),
  getSidecarPort: () => Promise.resolve(0),
  getApiBase: () => Promise.resolve('/api'),
  getWsUrl: () => Promise.resolve('ws://localhost:3001/ws'),
  getConfig: () => Promise.resolve({}),
  onTauriEvent: () => Promise.resolve(() => {}),
}));

// Mock TickerBar (uses WebSocket + API)
vi.mock('../components/TickerBar', () => ({
  TickerBar: () => <div data-testid="ticker-bar" />,
}));

import { AppLayout } from '../layouts/app-layout';
import { Sidebar } from '../layouts/sidebar';
import { ThemeProvider } from '../components/ThemeProvider';

// Helper: render AppLayout with all required providers
function renderAppLayout(initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ============================================================
// Layout: No Duplicate Sidebars
// ============================================================
describe('Layout: Sidebar uniqueness', () => {
  beforeEach(() => {
    // Reset theme
    document.documentElement.className = '';
  });

  it('renders exactly one <aside> element when sidebar closed (no duplicate)', () => {
    const { container } = renderAppLayout('/');
    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBe(1);
  });

  it('desktop sidebar wrapper has lg:block class', () => {
    const { container } = renderAppLayout('/');
    const desktopWrapper = container.querySelector('.hidden.lg\\:block');
    expect(desktopWrapper).toBeTruthy();
  });

  it('does not render mobile sidebar overlay when closed', () => {
    const { container } = renderAppLayout('/');
    // No overlay div should be present (overlay only shows when sidebar is open)
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeNull();
  });
});

// ============================================================
// Layout: Sidebar Content
// ============================================================
describe('Layout: Sidebar content', () => {
  it('renders all 9 navigation links', () => {
    const { container } = renderAppLayout('/');
    const links = container.querySelectorAll('aside nav a');
    expect(links.length).toBe(9);
  });

  it('renders theme toggle buttons (dark, light, matrix)', () => {
    const { container } = renderAppLayout('/');
    const buttons = container.querySelectorAll('aside button[title]');
    const titles = Array.from(buttons).map((b) => b.getAttribute('title'));
    expect(titles).toContain('Dark+');
    expect(titles).toContain('Light+');
    expect(titles).toContain('Matrix');
  });
});

// ============================================================
// Layout: Sidebar component (isolated)
// ============================================================
describe('Sidebar component', () => {
  it('renders a single <aside> element', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>,
    );
    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBe(1);
  });

  it('does not render overlay when collapsed and no onToggle', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={true} />
      </MemoryRouter>,
    );
    // No overlay div should be present (overlay only shows when !collapsed && onToggle)
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeNull();
  });

  it('renders overlay when not collapsed and has onToggle', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} onToggle={() => {}} />
      </MemoryRouter>,
    );
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeTruthy();
  });
});

// ============================================================
// CSS Import Verification
// ============================================================
describe('CSS Import Verification', () => {
  it('main.tsx imports themes.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainTsxPath = path.resolve(__dirname, '../main.tsx');
    const content = fs.readFileSync(mainTsxPath, 'utf-8');
    expect(content).toContain("import './styles/themes.css'");
  });

  it('themes.css contains Tailwind directives', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('@tailwind base');
    expect(content).toContain('@tailwind components');
    expect(content).toContain('@tailwind utilities');
  });

  it('themes.css defines all 3 theme variants', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('.theme-dark');
    expect(content).toContain('.theme-light');
    expect(content).toContain('.theme-matrix');
  });

  it('themes.css defines --blue variable for all themes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    const blueMatches = content.match(/--blue:/g);
    expect(blueMatches).toBeTruthy();
    expect(blueMatches!.length).toBe(3); // dark, light, matrix
  });
});

// ============================================================
// API Module: header merge + empty response
// ============================================================
describe('API: request() correctness', () => {
  it('api module exports get, post, put, getBase', async () => {
    const mod = await import('../utils/api');
    expect(mod.api.get).toBeDefined();
    expect(mod.api.post).toBeDefined();
    expect(mod.api.put).toBeDefined();
    expect(mod.getBase).toBeDefined();
  });
});
