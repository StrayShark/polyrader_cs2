import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Swords,
  Fish,
  Gamepad2,
  Activity,
  Settings2,
  BarChart3,
  PieChart,
  Beaker,
  LineChart,
  CreditCard,
  Sun,
  Moon,
  Terminal,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { useI18n } from '../hooks/use-i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { cn } from '../utils/cn';

const navigation = [
  {
    group: 'Markets',
    items: [
      { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
      { to: '/daily', icon: CalendarDays, labelKey: 'nav.daily' },
    ],
  },
  {
    group: 'Analysis',
    items: [
      { to: '/whales', icon: Fish, labelKey: 'nav.whales' },
      { to: '/esports', icon: Gamepad2, labelKey: 'nav.esports' },
      { to: '/signals', icon: Activity, labelKey: 'nav.signals' },
      { to: '/polymarket/account', icon: CreditCard, labelKey: 'nav.polymarketAccount' },
    ],
  },
  {
    group: 'AI',
    items: [
      { to: '/ai/config', icon: Settings2, labelKey: 'nav.aiConfig' },
      { to: '/ai/stats', icon: BarChart3, labelKey: 'nav.aiStats' },
      { to: '/prompt-variants', icon: Beaker, labelKey: 'nav.promptVariants' },
      { to: '/allocation', icon: PieChart, labelKey: 'nav.allocation' },
      { to: '/simulation', icon: LineChart, labelKey: 'nav.simulation' },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && onToggle && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          'flex flex-col border-r border-border bg-sidebar transition-all duration-200',
          'fixed inset-y-0 left-0 z-50 w-[240px]',
          'lg:static lg:z-auto lg:h-full',
          collapsed && '-translate-x-full lg:translate-x-0 lg:w-[64px]',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-14 items-center gap-2 border-b border-border px-4',
          collapsed && 'lg:justify-center lg:px-2',
        )}>
          <Swords className="h-5 w-5 flex-shrink-0 text-primary" />
          {!collapsed && <span className="text-sm font-semibold">PolyRader CS2</span>}
          {onToggle && (
            <button
              onClick={onToggle}
              className="ml-auto rounded p-1 hover:bg-sidebar-hover lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-auto py-2">
          {navigation.map((group) => (
            <div key={group.group} className="mb-2">
              {!collapsed && (
                <div className="px-4 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onToggle}
                  className={({ isActive }) =>
                    cn(
                      'mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      collapsed && 'lg:justify-center lg:px-2',
                      isActive
                        ? 'bg-sidebar-active text-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Theme Toggle + Language */}
        <div className="border-t border-border p-2">
          <div className={cn('flex gap-1', collapsed && 'lg:flex-col')}>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                'flex-1 rounded-md p-1.5 text-xs transition-colors',
                theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Dark+"
            >
              <Moon className="mx-auto h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('light')}
              className={cn(
                'flex-1 rounded-md p-1.5 text-xs transition-colors',
                theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Light+"
            >
              <Sun className="mx-auto h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('matrix')}
              className={cn(
                'flex-1 rounded-md p-1.5 text-xs transition-colors',
                theme === 'matrix' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Matrix"
            >
              <Terminal className="mx-auto h-3.5 w-3.5" />
            </button>
          </div>
          {!collapsed && <LanguageSwitcher />}
        </div>
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-2 hover:bg-muted lg:hidden"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
