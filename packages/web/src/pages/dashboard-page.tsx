import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, DollarSign, Activity, RefreshCw, Brain } from 'lucide-react';
import { useMarketStore } from '../stores/market-store';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { MarketHeatmap } from '../components/market-heatmap';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Button } from '@/components/ui';

interface DashboardAnalysis {
  topDeviations: Array<{
    marketId: string;
    question: string;
    polymarketProb: number;
    predictedProb: number;
    deviation: number;
    direction: 'undervalued' | 'overvalued';
  }>;
  signalCount: number;
}

export function DashboardPage() {
  const { markets, isLoading, error, fetchMarkets } = useMarketStore();
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const { subscribe } = useWebSocket();
  const { t } = useI18n();
  const navigate = useNavigate();
  const safeMarkets = markets ?? [];
  const topConditionIds = safeMarkets.slice(0, 10).map((m) => m.conditionId).join(',');

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Subscribe to real-time price updates
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const m of safeMarkets.slice(0, 10)) {
      const unsub = subscribe(`prices:${m.conditionId}`, (data: unknown) => {
        const priceData = data as { price: number };
        // Update market price in store
        useMarketStore.setState((state) => ({
          markets: state.markets.map((mk) =>
            mk.conditionId === m.conditionId
              ? { ...mk, outcomePrices: [String(priceData.price), String(1 - priceData.price)] }
              : mk,
          ),
        }));
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [topConditionIds, subscribe]);

  // Real-time: refresh market list when generic price broadcast arrives
  useEffect(() => {
    return subscribe('prices', () => {
      fetchMarkets();
    });
  }, [subscribe, fetchMarkets]);

  useEffect(() => {
    api.get<{ data: DashboardAnalysis }>('/signals/top')
      .then(({ data }) => setAnalysis(data))
      .catch(() => {});
  }, []);

  const totalVolume = safeMarkets.reduce((s, m) => s + (m.volume24h ?? 0), 0);
  const totalLiquidity = safeMarkets.reduce((s, m) => s + (m.liquidity ?? 0), 0);
  const activeCount = safeMarkets.filter((m) => m.status === 'active').length;
  const matchCount = safeMarkets.filter((m) => m.match !== undefined).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchMarkets()} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Stats Cards */}
      {isLoading ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('dashboard.activeMarkets'), value: String(activeCount), icon: BarChart3 },
            { label: t('dashboard.volume24h'), value: `$${(totalVolume / 1000).toFixed(1)}K`, icon: TrendingUp },
            { label: t('dashboard.totalLiquidity'), value: `$${(totalLiquidity / 1000).toFixed(1)}K`, icon: DollarSign },
            { label: t('dashboard.relatedMatches'), value: String(matchCount), icon: Activity },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
            </div>
          </Card>
        ))}
      </div>
      )}

      {/* Market Heatmap */}
      {!isLoading && safeMarkets.length > 0 && (
        <MarketHeatmap markets={safeMarkets} />
      )}

      {/* Top Deviations */}
      {analysis && analysis.topDeviations && analysis.topDeviations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">{t('dashboard.maxDeviation')}</h2>
              <span className="text-xs text-muted-foreground">{t('dashboard.marketVsModel')}</span>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2">{t('common.market')}</TableHead>
                <TableHead className="px-6 py-2 text-right">Polymarket</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('common.modelPrediction')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('common.deviation')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('common.direction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.topDeviations.slice(0, 5).map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="px-6 py-3 max-w-[300px] truncate font-medium">{d.question}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(d.polymarketProb * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(d.predictedProb * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    <span className={Math.abs(d.deviation) > 0.1 ? 'text-red' : Math.abs(d.deviation) > 0.05 ? 'text-yellow' : 'text-green'}>
                      {(d.deviation * 100).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right">
                    <Badge variant={d.direction === 'undervalued' ? 'green' : 'red'}>
                      {d.direction === 'undervalued' ? t('common.undervalued') : t('common.overvalued')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Market Table */}
      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && safeMarkets.length === 0}
        onRetry={() => fetchMarkets()}
        skeleton={<TableSkeleton rows={6} cols={5} />}
      >
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <h2 className="text-sm font-medium">{t('dashboard.activeMarkets')}</h2>
        </CardHeader>

        {safeMarkets.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2">{t('common.market')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('dashboard.volume24h')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('dashboard.liquidity')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('dashboard.price')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeMarkets.slice(0, 20).map((m) => (
                <TableRow key={m.conditionId} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/match/${m.conditionId}`)}>
                  <TableCell className="px-6 py-3 max-w-[300px] truncate font-medium">
                    {m.question}
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    ${((Number.isFinite(m.volume24h) ? m.volume24h : 0) / 1000).toFixed(1)}K
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    ${((Number.isFinite(m.liquidity) ? m.liquidity : 0) / 1000).toFixed(1)}K
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">
                    {m.outcomePrices?.slice(0, 2).map((p) => `${(parseFloat(p) * 100).toFixed(0)}%`).join(' / ') ?? '—'}
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right">
                    <Badge variant={m.status === 'active' ? 'green' : 'secondary'}>
                      {m.status === 'active' ? t('common.active') : m.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      </DataState>
    </div>
  );
}
