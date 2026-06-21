import { useEffect, useState } from 'react';
import { Activity, TrendingUp, AlertTriangle, RefreshCw, GitCompare } from 'lucide-react';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { AlertManager } from '../components/alert-manager';
import { Card, CardHeader, CardTitle, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Button } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { useWebSocket } from '../hooks/use-websocket';
import type { SignalComparison } from '@polyrader/core';

interface SignalStats {
  accuracy: number;
  brierScore: number;
  totalPredictions: number;
}

interface ArbitrageOpportunity {
  marketSlug: string;
  question: string;
  type: 'yes_no_spread' | 'cross_market_spread';
  profitPct: number;
  details: string;
}

export function SignalsPage() {
  const { t } = useI18n();
  const { subscribe } = useWebSocket();
  const [signals, setSignals] = useState<SignalComparison[]>([]);
  const [stats, setStats] = useState<SignalStats>({ accuracy: 0, brierScore: 0, totalPredictions: 0 });
  const [arbitrageOps, setArbitrageOps] = useState<ArbitrageOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [signalsRes, statsRes, arbRes] = await Promise.all([
        api.get<{ data: SignalComparison[] }>('/signals/top'),
        api.get<{ data: SignalStats }>('/signals/stats'),
        api.get<{ data: { opportunities: ArbitrageOpportunity[] } }>('/signals/arbitrage'),
      ]);
      setSignals(Array.isArray(signalsRes.data) ? signalsRes.data : []);
      setStats(statsRes.data ?? { accuracy: 0, brierScore: 0, totalPredictions: 0 });
      setArbitrageOps(arbRes.data?.opportunities ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Subscribe to real-time arbitrage updates via WebSocket
  useEffect(() => {
    const unsub = subscribe('arbitrage', (data) => {
      const payload = data as { type: string; opportunities: ArbitrageOpportunity[] };
      if (payload?.type === 'arbitrage:update' && Array.isArray(payload.opportunities)) {
        setArbitrageOps(payload.opportunities);
      }
    });
    return unsub;
  }, [subscribe]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('signals.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('signals.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && signals.length === 0}
        onRetry={fetchData}
        skeleton={
          <div className="space-y-4">
            <StatsSkeleton count={3} />
            <TableSkeleton rows={6} cols={5} />
          </div>
        }
      >

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: t('signals.modelAccuracy'), value: `${(stats.accuracy * 100).toFixed(1)}%`, icon: TrendingUp, color: stats.accuracy > 0.5 ? 'text-green' : 'text-yellow' },
          { label: 'Brier Score', value: stats.brierScore.toFixed(3), icon: AlertTriangle, color: stats.brierScore < 0.2 ? 'text-green' : stats.brierScore < 0.3 ? 'text-yellow' : 'text-red' },
          { label: t('signals.totalPredictions'), value: String(stats.totalPredictions), icon: Activity, color: '' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle>{t('signals.comparison')}</CardTitle>
          </div>
        </CardHeader>
        {signals.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('signals.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-auto px-6 py-2 text-left">{t('common.market')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">Polymarket</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('common.modelPrediction')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('common.deviation')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('common.direction')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.arbitrage')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((s, i) => (
                <TableRow key={i} className="text-sm">
                  <TableCell className="px-6 py-3 font-medium">{s.marketId}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(s.polymarketProb * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(s.predictedProb * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    <span className={s.deviation > 0.1 ? 'text-red' : s.deviation > 0.05 ? 'text-yellow' : 'text-green'}>
                      {(s.deviation * 100).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right">
                    <Badge variant={s.signals[0]?.probability > s.signals[1]?.probability ? 'green' : 'red'}>
                      {s.signals[0]?.probability > s.signals[1]?.probability ? t('common.undervalued') : t('common.overvalued')}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right">
                    {s.arbitrageOpportunity && (
                      <Badge variant="yellow">{t('signals.arbitrageOpportunity')}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      </DataState>

      {/* Arbitrage Opportunities */}
      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <CardTitle>{t('arbitrage.title')}</CardTitle>
          </div>
        </CardHeader>
        {arbitrageOps.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('arbitrage.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-auto px-6 py-2 text-left">{t('common.market')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-left">{t('arbitrage.type')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('arbitrage.profitPct')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-left">{t('arbitrage.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arbitrageOps.map((op, i) => (
                <TableRow key={i} className="text-sm">
                  <TableCell className="px-6 py-3 font-medium max-w-xs truncate" title={op.question}>
                    {op.question}
                  </TableCell>
                  <TableCell className="px-6 py-3">
                    <Badge variant={op.type === 'yes_no_spread' ? 'cyan' : 'purple'}>
                      {op.type === 'yes_no_spread' ? t('arbitrage.yesNoSpread') : t('arbitrage.crossMarketSpread')}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    <span className={op.profitPct > 2 ? 'text-green font-medium' : ''}>
                      {op.profitPct.toFixed(2)}%
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-xs text-muted-foreground">{op.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Price Alerts */}
      <AlertManager />
    </div>
  );
}
