import { describe, it, expect, vi } from 'vitest';

/**
 * E2E Integration Tests
 *
 * Tests the full application startup flow:
 * 1. Tauri bridge degrades gracefully in browser mode
 * 2. API module is importable and has correct shape
 * 3. WebSocket hook has correct interface
 * 4. Theme system is available
 * 5. All stores are importable
 * 6. All pages are importable
 * 7. All UI components are importable
 */

describe('E2E: Tauri Bridge', () => {
  it('all bridge functions are exported', async () => {
    const bridge = await import('../src/utils/tauri-bridge');
    expect(bridge.isTauriEnvironment).toBeDefined();
    expect(bridge.isFirstRun).toBeDefined();
    expect(bridge.getSidecarPort).toBeDefined();
    expect(bridge.getApiBase).toBeDefined();
    expect(bridge.getWsUrl).toBeDefined();
    expect(bridge.getConfig).toBeDefined();
    expect(bridge.onTauriEvent).toBeDefined();
  });

  it('bridge functions degrade gracefully in browser mode', async () => {
    const bridge = await import('../src/utils/tauri-bridge');
    expect(bridge.isTauriEnvironment()).toBe(false);
    // In browser mode, sidecar port is 0 (uses Vite proxy instead)
    expect(await bridge.getSidecarPort()).toBe(0);
    // first_run_completed defaults to true in browser mode
    expect(await bridge.isFirstRun()).toBe(false);
  });
});

describe('E2E: API Module', () => {
  it('api module is properly imported and callable', async () => {
    const { api } = await import('../src/utils/api');
    expect(api).toBeDefined();
    expect(api.get).toBeDefined();
    expect(typeof api.get).toBe('function');
    expect(api.post).toBeDefined();
    expect(typeof api.post).toBe('function');
  });
});

describe('E2E: WebSocket Hook', () => {
  it('websocket hook is importable', async () => {
    const mod = await import('../src/hooks/use-websocket');
    expect(mod.useWebSocket).toBeDefined();
    expect(typeof mod.useWebSocket).toBe('function');
  });
});

describe('E2E: Theme System', () => {
  it('ThemeProvider is available', async () => {
    const mod = await import('../src/components/ThemeProvider');
    expect(mod.ThemeProvider).toBeDefined();
  });
});

describe('E2E: Store Layer', () => {
  it('market store is importable', async () => {
    const mod = await import('../src/stores/market-store');
    expect(mod.useMarketStore).toBeDefined();
  });

  it('daily store is importable', async () => {
    const mod = await import('../src/stores/daily-store');
    expect(mod.useDailyStore).toBeDefined();
  });

  it('llm store is importable', async () => {
    const mod = await import('../src/stores/llm-store');
    expect(mod.useLLMStore).toBeDefined();
  });

  it('whale store is importable', async () => {
    const mod = await import('../src/stores/whale-store');
    expect(mod.useWhaleStore).toBeDefined();
  });
});

describe('E2E: Page Imports', () => {
  it('dashboard page is importable', async () => {
    const mod = await import('../src/pages/dashboard-page');
    expect(mod.DashboardPage).toBeDefined();
  });

  it('match detail page is importable', async () => {
    const mod = await import('../src/pages/match-detail-page');
    expect(mod.MatchDetailPage).toBeDefined();
  });

  it('whales page is importable', async () => {
    const mod = await import('../src/pages/whales-page');
    expect(mod.WhalesPage).toBeDefined();
  });

  it('signals page is importable', async () => {
    const mod = await import('../src/pages/signals-page');
    expect(mod.SignalsPage).toBeDefined();
  });

  it('esports page is importable', async () => {
    const mod = await import('../src/pages/esports-page');
    expect(mod.EsportsPage).toBeDefined();
  });

  it('ai config page is importable', async () => {
    const mod = await import('../src/pages/ai-config-page');
    expect(mod.AiConfigPage).toBeDefined();
  });

  it('ai stats page is importable', async () => {
    const mod = await import('../src/pages/ai-stats-page');
    expect(mod.AiStatsPage).toBeDefined();
  });

  it('setup page is importable', async () => {
    const mod = await import('../src/pages/setup-page');
    expect(mod.SetupPage).toBeDefined();
  });
});

describe('E2E: UI Component Imports', () => {
  it('shadcn/ui components are importable', async () => {
    const mod = await import('../src/components/ui');
    expect(mod.Button).toBeDefined();
    expect(mod.Card).toBeDefined();
    expect(mod.Badge).toBeDefined();
    expect(mod.Input).toBeDefined();
    expect(mod.Table).toBeDefined();
    expect(mod.Tabs).toBeDefined();
    expect(mod.Dialog).toBeDefined();
    expect(mod.Tooltip).toBeDefined();
    expect(mod.Progress).toBeDefined();
    expect(mod.Skeleton).toBeDefined();
    expect(mod.ScrollArea).toBeDefined();
    expect(mod.DropdownMenu).toBeDefined();
  });

  it('enhanced components are importable', async () => {
    const ticker = await import('../src/components/TickerBar');
    expect(ticker.TickerBar).toBeDefined();

    const factor = await import('../src/components/FactorRing');
    expect(factor.FactorRing).toBeDefined();

    const gauge = await import('../src/components/LLMConsensusGauge');
    expect(gauge.LLMConsensusGauge).toBeDefined();

    const flash = await import('../src/components/PriceFlash');
    expect(flash.PriceFlash).toBeDefined();
    expect(flash.usePriceFlash).toBeDefined();
  });
});

describe('E2E: Hook Imports', () => {
  it('keyboard shortcuts hook is importable', async () => {
    const mod = await import('../src/hooks/use-keyboard-shortcuts');
    expect(mod.useKeyboardShortcuts).toBeDefined();
  });

  it('whale alerts hook is importable', async () => {
    const mod = await import('../src/hooks/use-whale-alerts');
    expect(mod.useWhaleAlerts).toBeDefined();
  });
});

describe('E2E: App Entry', () => {
  it('App component is importable as default export', async () => {
    const mod = await import('../src/App');
    expect(mod.default).toBeDefined();
  });

  it('router is importable', async () => {
    const mod = await import('../src/router');
    expect(mod.router).toBeDefined();
  });
});
