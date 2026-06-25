import { useEffect } from 'react';
import { CalendarDays, TrendingUp, AlertTriangle, Fish, RefreshCw } from 'lucide-react';
import { useDailyStore } from '../stores/daily-store';
import { DataState } from '../components/DataState';
import { StatsSkeleton } from '../components/Skeletons';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';

export function DailyPage() {
  const { dashboard, isLoading, error, fetchDashboard, refreshDashboard } = useDailyStore();
  const { subscribe } = useWebSocket();
  const { t } = useI18n();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-time: refresh when daily dashboard is regenerated
  useEffect(() => {
    return subscribe('daily', () => {
      fetchDashboard();
    });
  }, [subscribe, fetchDashboard]);

  const matches = dashboard?.allMatches ?? [];
  const highAttention = dashboard?.highAttentionMatches ?? [];
  const deviations = dashboard?.topDeviations ?? [];
  const whaleAlerts = dashboard?.whaleAlerts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('daily.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('daily.subtitle')}</p>
        </div>
        <button
          onClick={() => refreshDashboard()}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('daily.refreshAnalysis')}
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('daily.todayMatches'), value: String(dashboard?.totalMatches ?? '--'), icon: CalendarDays },
          { label: t('daily.highAttention'), value: String(highAttention.length), icon: TrendingUp },
          { label: t('daily.signalDeviation'), value: String(deviations.length), icon: AlertTriangle },
          { label: t('daily.whaleActivity'), value: String(whaleAlerts.length), icon: Fish },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && !dashboard}
        onRetry={() => fetchDashboard()}
        skeleton={<StatsSkeleton count={4} />}
      >

      {/* TOP 3 Recommendations */}
      {highAttention.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium">{t('daily.top3')}</h2>
          <div className="grid grid-cols-3 gap-4">
            {highAttention.slice(0, 3).map((scored) => (
              <div key={scored.market.conditionId} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('daily.attentionScore', { score: scored.attentionScore })}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    scored.recommendation === 'high' ? 'bg-green/10 text-green' :
                    scored.recommendation === 'medium' ? 'bg-yellow/10 text-yellow' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {scored.recommendation === 'high' ? t('daily.high') : scored.recommendation === 'medium' ? t('daily.medium') : t('daily.low')}
                  </span>
                </div>
                <div className="mt-3 text-sm font-medium truncate">{scored.market.question}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {scored.market.match ? `${scored.market.match.eventName} · ${scored.market.match.format}` : '--'}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${scored.attentionScore}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Matches */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-3">
          <h2 className="text-sm font-medium">{t('daily.allMatches', { count: matches.length })}</h2>
        </div>
        {matches.length === 0 && !isLoading && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('daily.empty')}
          </div>
        )}
        {matches.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-6 py-2 text-left font-medium">{t('daily.match')}</th>
                <th className="px-6 py-2 text-right font-medium">{t('daily.attention')}</th>
                <th className="px-6 py-2 text-right font-medium">{t('daily.confidence')}</th>
                <th className="px-6 py-2 text-right font-medium">{t('daily.llmPrediction')}</th>
                <th className="px-6 py-2 text-right font-medium">{t('common.deviation')}</th>
                <th className="px-6 py-2 text-right font-medium">{t('daily.recommendation')}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((scored) => (
                <tr key={scored.market.conditionId} className="border-b text-sm hover:bg-muted/50">
                  <td className="px-6 py-3 max-w-[300px] truncate font-medium">
                    {scored.market.question}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{scored.attentionScore}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{scored.confidenceScore}</td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {scored.llmPrediction !== undefined ? `${(scored.llmPrediction * 100).toFixed(1)}%` : '--'}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{scored.deviationScore}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      scored.recommendation === 'high' ? 'bg-green/10 text-green' :
                      scored.recommendation === 'medium' ? 'bg-yellow/10 text-yellow' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {scored.recommendation === 'high' ? t('daily.high') : scored.recommendation === 'medium' ? t('daily.medium') : t('daily.low')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </DataState>
    </div>
  );
}
