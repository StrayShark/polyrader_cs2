import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, MobileMenuButton } from './sidebar';
import { StatusBar } from './status-bar';
import { TickerBar } from '../components/TickerBar';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { useWhaleAlerts } from '../hooks/use-whale-alerts';
import { useCopySignalAlerts } from '../hooks/use-copy-signal-alerts';
import { useSettlementAlerts } from '../hooks/use-settlement-alerts';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useKeyboardShortcuts();
  useWhaleAlerts();
  useCopySignalAlerts();
  useSettlementAlerts();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar: always visible on large screens */}
      <div className="hidden h-full lg:block">
        <Sidebar collapsed={false} />
      </div>

      {/* Mobile sidebar: only rendered when menu is open */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <Sidebar
            collapsed={false}
            onToggle={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header bar */}
        <header className="flex h-12 items-center gap-3 border-b border-border px-4 lg:hidden">
          <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          <span className="text-sm font-semibold">PolyRader CS2</span>
        </header>

        {/* Real-time price ticker */}
        <TickerBar />

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
