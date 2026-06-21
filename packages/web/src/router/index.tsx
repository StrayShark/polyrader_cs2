import { lazy, Suspense } from 'react';
import { createHashRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/app-layout';
import { useI18n } from '../hooks/use-i18n';

// Code-split all pages for lazy loading
const DashboardPage = lazy(() => import('../pages/dashboard-page').then((m) => ({ default: m.DashboardPage })));
const DailyPage = lazy(() => import('../pages/daily-page').then((m) => ({ default: m.DailyPage })));
const MatchDetailPage = lazy(() => import('../pages/match-detail-page').then((m) => ({ default: m.MatchDetailPage })));
const WhalesPage = lazy(() => import('../pages/whales-page').then((m) => ({ default: m.WhalesPage })));
const EsportsPage = lazy(() => import('../pages/esports-page').then((m) => ({ default: m.EsportsPage })));
const SignalsPage = lazy(() => import('../pages/signals-page').then((m) => ({ default: m.SignalsPage })));
const AiConfigPage = lazy(() => import('../pages/ai-config-page').then((m) => ({ default: m.AiConfigPage })));
const AiStatsPage = lazy(() => import('../pages/ai-stats-page').then((m) => ({ default: m.AiStatsPage })));
const PromptVariantsPage = lazy(() => import('../pages/prompt-variants-page').then((m) => ({ default: m.PromptVariantsPage })));
const AllocationPage = lazy(() => import('../pages/allocation-page').then((m) => ({ default: m.AllocationPage })));
const SimulationPage = lazy(() => import('../pages/simulation-page').then((m) => ({ default: m.SimulationPage })));
const NotFoundPage = lazy(() => import('../pages/not-found-page').then((m) => ({ default: m.NotFoundPage })));

function PageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
      </div>
    </div>
  );
}

function withSuspense(Component: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: withSuspense(DashboardPage) },
      { path: 'daily', element: withSuspense(DailyPage) },
      { path: 'match/:slug', element: withSuspense(MatchDetailPage) },
      { path: 'whales', element: withSuspense(WhalesPage) },
      { path: 'esports', element: withSuspense(EsportsPage) },
      { path: 'signals', element: withSuspense(SignalsPage) },
      { path: 'ai/config', element: withSuspense(AiConfigPage) },
      { path: 'ai/stats', element: withSuspense(AiStatsPage) },
      { path: 'prompt-variants', element: withSuspense(PromptVariantsPage) },
      { path: 'allocation', element: withSuspense(AllocationPage) },
      { path: 'simulation', element: withSuspense(SimulationPage) },
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
]);
