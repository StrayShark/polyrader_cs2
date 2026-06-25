import { useEffect, useState } from 'react';
import { Activity, TrendingUp, AlertTriangle, RefreshCw, GitCompare, BarChart3, Save, Settings2 } from 'lucide-react';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { AlertManager } from '../components/alert-manager';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
} from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { useWebSocket } from '../hooks/use-websocket';
import type { SignalBacktestSummary, SignalComparison, SignalTuningConfig } from '@polyrader/core';

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

const SOURCE_WEIGHT_KEYS = [
  'prediction_model',
  'market_behavior',
  'ai_debate',
  'capital_flow',
  'whale_flow',
  'mean_reversion',
  'community',
  'hltv_odds',
] as const;

const BEHAVIOR_WEIGHT_KEYS = [
  'capitalWithOrderBook',
  'capitalWithoutOrderBook',
  'reversionWithHistory',
  'reversionWithoutHistory',
  'whaleWithFlow',
  'whaleWithoutFlow',
  'market',
] as const;

const RECOMMENDATION_KEYS = [
  'minEdge',
  'bubbleMinEdge',
  'minConfidence',
  'bubbleRiskPenalty',
] as const;

export function SignalsPage() {
  const { t } = useI18n();
  const { subscribe } = useWebSocket();
  const [signals, setSignals] = useState<SignalComparison[]>([]);
  const [stats, setStats] = useState<SignalStats>({ accuracy: 0, brierScore: 0, totalPredictions: 0 });
  const [arbitrageOps, setArbitrageOps] = useState<ArbitrageOpportunity[]>([]);
  const [backtest, setBacktest] = useState<SignalBacktestSummary | null>(null);
  const [tuningConfig, setTuningConfig] = useState<SignalTuningConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<SignalTuningConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<SignalComparison | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [signalsRes, statsRes, arbRes, backtestRes, configRes] = await Promise.all([
        api.get<{ data: SignalComparison[] }>('/signals/top'),
        api.get<{ data: SignalStats }>('/signals/stats'),
        api.get<{ data: { opportunities: ArbitrageOpportunity[] } }>('/signals/arbitrage'),
        api.get<{ data: SignalBacktestSummary }>('/signals/backtest?limit=1000'),
        api.get<{ data: SignalTuningConfig }>('/signals/config'),
      ]);
      setSignals(Array.isArray(signalsRes.data) ? signalsRes.data : []);
      setStats(statsRes.data ?? { accuracy: 0, brierScore: 0, totalPredictions: 0 });
      setArbitrageOps(arbRes.data?.opportunities ?? []);
      setBacktest(backtestRes.data ?? null);
      setTuningConfig(configRes.data ?? null);
      setConfigDraft(configRes.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsLoading(false);
  };

  const saveTuningConfig = async () => {
    if (!configDraft) return;
    setIsSavingConfig(true);
    setError(null);
    try {
      const configRes = await api.put<{ data: SignalTuningConfig }>('/signals/config', configDraft);
      setTuningConfig(configRes.data);
      setConfigDraft(configRes.data);
      const backtestRes = await api.get<{ data: SignalBacktestSummary }>('/signals/backtest?limit=1000');
      setBacktest(backtestRes.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const updateSourceWeight = (key: keyof SignalTuningConfig['sourceWeights'], value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) => current ? {
      ...current,
      sourceWeights: {
        ...current.sourceWeights,
        [key]: Number.isFinite(numeric) ? numeric : 0,
      },
    } : current);
  };

  const updateBehaviorWeight = (key: keyof SignalTuningConfig['behaviorWeights'], value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) => current ? {
      ...current,
      behaviorWeights: {
        ...current.behaviorWeights,
        [key]: Number.isFinite(numeric) ? numeric : 0,
      },
    } : current);
  };

  const updateRecommendation = (key: keyof SignalTuningConfig['recommendation'], value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) => current ? {
      ...current,
      recommendation: {
        ...current.recommendation,
        [key]: Number.isFinite(numeric) ? numeric : 0,
      },
    } : current);
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
        isEmpty={!isLoading && !error && signals.length === 0 && (backtest?.sampleSize ?? 0) === 0}
        onRetry={fetchData}
        skeleton={
          <div className="space-y-4">
            <StatsSkeleton count={3} />
            <TableSkeleton rows={6} cols={8} />
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

      {backtest && (
        <Card>
          <CardHeader className="border-b px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle>{t('signals.backtestTitle')}</CardTitle>
              </div>
              <Badge variant="secondary">
                {backtest.sampleSize} {t('signals.resolvedSamples')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="grid gap-3 p-4 md:grid-cols-4">
              <Metric label={t('signals.resolvedMarkets')} value={String(backtest.resolvedMarkets)} />
              <Metric label={t('signals.minEdge')} value={formatPct(backtest.minEdge)} />
              <Metric label={t('signals.bestBrier')} value={formatSourceLabel(backtest.bestBrierSource)} />
              <Metric label={t('signals.bestRoi')} value={formatSourceLabel(backtest.bestRoiSource)} />
            </div>

            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-auto px-6 py-2 text-left">{t('signals.source')}</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">Brier</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">{t('signals.accuracy')}</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">{t('signals.calibrationError')}</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">ROI</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">PnL</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">{t('signals.bets')}</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-right">{t('signals.weight')}</TableHead>
                    <TableHead className="h-auto px-6 py-2 text-left">{t('signals.calibration')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backtest.metrics.map((metric) => (
                    <TableRow key={metric.source} className="text-sm">
                      <TableCell className="px-6 py-3 font-medium">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{metric.label}</span>
                          {metric.source === backtest.bestBrierSource && <Badge variant="green">Brier</Badge>}
                          {metric.source === backtest.bestRoiSource && <Badge variant="cyan">ROI</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right tabular-nums">{metric.sampleSize > 0 ? metric.brierScore.toFixed(3) : '--'}</TableCell>
                      <TableCell className="px-6 py-3 text-right tabular-nums">{metric.sampleSize > 0 ? formatPct(metric.accuracy) : '--'}</TableCell>
                      <TableCell className="px-6 py-3 text-right tabular-nums">{metric.sampleSize > 0 ? formatPct(metric.calibrationError) : '--'}</TableCell>
                      <TableCell className={`px-6 py-3 text-right tabular-nums ${metric.roi > 0 ? 'text-green' : metric.roi < 0 ? 'text-red' : ''}`}>
                        {metric.bets > 0 ? formatSignedPct(metric.roi) : '--'}
                      </TableCell>
                      <TableCell className={`px-6 py-3 text-right tabular-nums ${metric.totalPnl > 0 ? 'text-green' : metric.totalPnl < 0 ? 'text-red' : ''}`}>
                        {metric.bets > 0 ? formatUnitPnl(metric.totalPnl) : '--'}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right tabular-nums">{metric.bets}</TableCell>
                      <TableCell className="px-6 py-3 text-right tabular-nums">
                        {metric.currentWeight !== undefined ? `${metric.currentWeight.toFixed(2)} → ${(metric.suggestedWeight ?? metric.currentWeight).toFixed(2)}` : '--'}
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        <CalibrationSpark buckets={metric.buckets} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {configDraft && (
              <div className="space-y-4 border-t p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <div className="text-sm font-medium">{t('signals.tuningConfig')}</div>
                    {tuningConfig?.updatedAt && (
                      <span className="text-xs text-muted-foreground">{new Date(tuningConfig.updatedAt).toLocaleString()}</span>
                    )}
                  </div>
                  <Button size="sm" onClick={saveTuningConfig} disabled={isSavingConfig}>
                    <Save className="h-3.5 w-3.5" />
                    {t('common.save')}
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.aggregationWeights')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {SOURCE_WEIGHT_KEYS.map((key) => (
                        <label key={key} className="grid gap-1 text-xs">
                          <span className="truncate text-muted-foreground">{formatConfigLabel(key)}</span>
                          <Input
                            type="number"
                            min="0"
                            max="5"
                            step="0.05"
                            value={configDraft.sourceWeights[key]}
                            onChange={(event) => updateSourceWeight(key, event.target.value)}
                            className="h-8 text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.behaviorWeights')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {BEHAVIOR_WEIGHT_KEYS.map((key) => (
                        <label key={key} className="grid gap-1 text-xs">
                          <span className="truncate text-muted-foreground">{formatConfigLabel(key)}</span>
                          <Input
                            type="number"
                            min="0"
                            max="5"
                            step="0.05"
                            value={configDraft.behaviorWeights[key]}
                            onChange={(event) => updateBehaviorWeight(key, event.target.value)}
                            className="h-8 text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.recommendationRules')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {RECOMMENDATION_KEYS.map((key) => (
                        <label key={key} className="grid gap-1 text-xs">
                          <span className="truncate text-muted-foreground">{formatConfigLabel(key)}</span>
                          <Input
                            type="number"
                            min="0"
                            max={key === 'bubbleRiskPenalty' ? '5' : '1'}
                            step="0.01"
                            value={configDraft.recommendation[key]}
                            onChange={(event) => updateRecommendation(key, event.target.value)}
                            className="h-8 text-xs"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.behaviorPrediction')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.aiDebate')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.communityPrediction')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.finalProbability')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.edge')}</TableHead>
                <TableHead className="h-auto px-6 py-2 text-right">{t('signals.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((s, i) => {
                const behaviorProb = s.marketBehavior?.probability
                  ?? s.signals.find((sig) => sig.source === 'market_behavior')?.probability;
                const aiDebateProb = s.aiDebate?.calibratedProbability
                  ?? s.signals.find((sig) => sig.source === 'ai_debate')?.probability;
                const hltvProb = s.signals.find((sig) => sig.source === 'hltv_odds')?.probability;
                const finalProb = s.finalProb ?? s.predictedProb;
                const edge = s.edge ?? finalProb - s.polymarketProb;
                const recommendation = s.recommendation ?? (edge > 0.05 ? 'buy_yes' : edge < -0.05 ? 'buy_no' : 'skip');
                const recVariant = recommendation === 'buy_yes' ? 'green' : recommendation === 'buy_no' ? 'red' : 'secondary';
                const recLabel = recommendation === 'buy_yes'
                  ? t('signals.buyYes')
                  : recommendation === 'buy_no'
                    ? t('signals.buyNo')
                    : t('signals.skip');

                return (
                  <TableRow
                    key={i}
                    className="cursor-pointer text-sm"
                    onClick={() => setSelectedSignal(s)}
                  >
                    <TableCell className="px-6 py-3 font-medium">{s.marketId}</TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums">{(s.polymarketProb * 100).toFixed(1)}%</TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums">{(s.predictedProb * 100).toFixed(1)}%</TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {behaviorProb !== undefined ? `${(behaviorProb * 100).toFixed(1)}%` : '--'}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {aiDebateProb !== undefined ? `${(aiDebateProb * 100).toFixed(1)}%` : '--'}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                      {hltvProb !== undefined ? `${(hltvProb * 100).toFixed(1)}%` : '--'}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums font-medium">
                      {(finalProb * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right tabular-nums">
                      <span className={Math.abs(edge) > 0.1 ? 'text-red' : Math.abs(edge) > 0.05 ? 'text-yellow' : 'text-green'}>
                        {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Badge variant={recVariant}>{recLabel}</Badge>
                        {s.arbitrageOpportunity && (
                          <Badge variant="yellow">{t('signals.arbitrage')}</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      </DataState>

      {/* Deviation Heatmap */}
      {signals.length > 0 && (
        <Card>
          <CardHeader className="border-b px-6 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle>{t('signals.deviationHeatmap')}</CardTitle>
            </div>
          </CardHeader>
          <div className="p-4">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(signals.length, 8)}, 1fr)` }}>
              {signals.slice(0, 32).map((s, i) => {
                const edge = s.edge ?? (s.finalProb ?? s.predictedProb) - s.polymarketProb;
                const absDev = Math.abs(edge);
                const intensity = Math.min(absDev / 0.2, 1);
                const isUndervalued = edge > 0;
                const bg = isUndervalued
                  ? `rgba(34, 197, 94, ${0.15 + intensity * 0.7})`
                  : `rgba(239, 68, 68, ${0.15 + intensity * 0.7})`;
                return (
                  <div
                    key={i}
                    className="rounded-md p-2 text-center cursor-pointer transition-transform hover:scale-105"
                    style={{ background: bg, minHeight: '60px' }}
                    title={`${s.marketId}: ${(edge * 100).toFixed(1)}% edge`}
                  >
                    <div className="text-[10px] text-muted-foreground truncate" title={s.marketId}>
                      {s.marketId.slice(0, 12)}
                    </div>
                    <div className="text-sm font-bold tabular-nums mt-1">
                      {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239, 68, 68, 0.8)' }} />
                {t('common.overvalued')}
              </div>
              <div className="flex items-center gap-1">
                <span>0%</span>
                <div className="w-24 h-3 rounded-sm" style={{ background: 'linear-gradient(to right, rgba(239,68,68,0.8), rgba(239,68,68,0.15), rgba(34,197,94,0.15), rgba(34,197,94,0.8))' }} />
                <span>20%+</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(34, 197, 94, 0.8)' }} />
                {t('common.undervalued')}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Arbitrage Opportunities */}
      <Dialog open={selectedSignal !== null} onOpenChange={(open) => !open && setSelectedSignal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('signals.detailTitle')}</DialogTitle>
            <DialogDescription>{selectedSignal?.marketId ?? ''}</DialogDescription>
          </DialogHeader>
          {selectedSignal && (
            <ScrollArea className="max-h-[72vh] pr-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: 'Polymarket', value: formatPct(selectedSignal.polymarketProb) },
                    { label: t('common.modelPrediction'), value: formatPct(selectedSignal.predictedProb) },
                    { label: t('signals.finalProbability'), value: formatPct(selectedSignal.finalProb ?? selectedSignal.predictedProb) },
                    { label: t('signals.edge'), value: formatSignedPct(selectedSignal.edge ?? 0) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{item.label}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{item.value}</div>
                    </div>
                  ))}
                </div>

                {selectedSignal.marketBehavior && (
                  <div className="rounded-md border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">{t('signals.behaviorDetail')}</div>
                      <Badge variant={selectedSignal.marketBehavior.direction === 'buy_yes' ? 'green' : selectedSignal.marketBehavior.direction === 'buy_no' ? 'red' : 'secondary'}>
                        {selectedSignal.marketBehavior.direction}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                      <Metric label="Capital" value={formatPct(selectedSignal.marketBehavior.capitalWeightedProb)} />
                      <Metric label="Smart Money" value={formatPct(selectedSignal.marketBehavior.smartMoneyProb ?? selectedSignal.marketBehavior.whaleAdjustedProb)} />
                      <Metric label="Z-score" value={selectedSignal.marketBehavior.zScore.toFixed(2)} />
                      <Metric label="Bubble" value={formatPct(selectedSignal.marketBehavior.bubbleScore)} />
                      <Metric label="Imbalance" value={formatSignedPct(selectedSignal.marketBehavior.orderBookImbalance ?? 0)} />
                      <Metric label="Spread" value={formatPct(selectedSignal.marketBehavior.spread ?? 0)} />
                      <Metric label="Slippage" value={formatPct(selectedSignal.marketBehavior.slippageRisk ?? 0)} />
                      <Metric label="HHI Risk" value={formatPct(selectedSignal.marketBehavior.concentrationRisk)} />
                      <Metric label="Holders" value={formatPct(selectedSignal.marketBehavior.holderWeightedProb ?? selectedSignal.marketBehavior.probability)} />
                      <Metric label="Holder Bias" value={formatSignedPct(selectedSignal.marketBehavior.holderDirectionalBias ?? 0)} />
                      <Metric label="Holder HHI" value={formatPct(selectedSignal.marketBehavior.holderConcentrationRisk ?? 0)} />
                    </div>
                    <div className="mt-3 space-y-1">
                      {selectedSignal.marketBehavior.reasons.map((reason, idx) => (
                        <div key={idx} className="text-xs text-muted-foreground">{reason}</div>
                      ))}
                    </div>
                    {(selectedSignal.marketBehavior.topHolders?.length ?? 0) > 0 && (
                      <div className="mt-3 overflow-hidden rounded-md border">
                        {selectedSignal.marketBehavior.topHolders!.slice(0, 5).map((holder) => (
                          <div key={`${holder.address}-${holder.tokenId ?? holder.outcome ?? ''}`} className="flex items-center justify-between border-b px-3 py-2 text-xs last:border-b-0">
                            <span className="font-mono">{shortAddress(holder.address)}</span>
                            <span className="text-muted-foreground">{holder.outcome ?? '--'}</span>
                            <span className="tabular-nums">{formatCurrencyCompact(holder.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedSignal.aiDebate && (
                  <div className="rounded-md border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">{t('signals.aiDebateDetail')}</div>
                      <Badge variant={selectedSignal.aiDebate.verdict === 'buy_yes' ? 'green' : selectedSignal.aiDebate.verdict === 'buy_no' ? 'red' : 'secondary'}>
                        {selectedSignal.aiDebate.verdict}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[selectedSignal.aiDebate.yesCase, selectedSignal.aiDebate.noCase].map((side) => (
                        <div key={side.stance} className="rounded-md bg-muted/40 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium uppercase">{side.stance}</span>
                            <span className="tabular-nums">{formatPct(side.probability)} · {formatPct(side.confidence)}</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {side.evidence.length === 0 ? (
                              <div className="text-xs text-muted-foreground">{side.reasoning}</div>
                            ) : side.evidence.map((evidence, idx) => (
                              <div key={idx} className="text-xs text-muted-foreground">{evidence}</div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md border p-4">
                  <div className="mb-3 text-sm font-medium">{t('signals.sourceWeights')}</div>
                  <div className="grid gap-2">
                    {selectedSignal.signals.map((signal) => (
                      <div key={`${signal.source}-${signal.lastUpdated}`} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2 text-xs">
                        <span>{signal.source}</span>
                        <span className="tabular-nums">{formatPct(signal.probability)} · conf {formatPct(signal.confidence)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}

function CalibrationSpark({ buckets }: { buckets: SignalBacktestSummary['metrics'][number]['buckets'] }) {
  if (buckets.length === 0) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="flex min-w-32 items-end gap-1">
      {buckets.map((bucket) => {
        const height = Math.max(4, bucket.count === 0 ? 4 : 8 + bucket.actualRate * 24);
        const error = Math.abs(bucket.avgPredicted - bucket.actualRate);
        const bg = bucket.count === 0
          ? 'bg-muted'
          : error < 0.08
            ? 'bg-green'
            : error < 0.16
              ? 'bg-yellow'
              : 'bg-red';
        return (
          <div
            key={`${bucket.lowerBound}-${bucket.upperBound}`}
            className={`w-5 rounded-sm ${bg}`}
            style={{ height }}
            title={`${(bucket.lowerBound * 100).toFixed(0)}-${(bucket.upperBound * 100).toFixed(0)}% · ${bucket.count}`}
          />
        );
      })}
    </div>
  );
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function formatUnitPnl(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}u`;
}

function formatCurrencyCompact(value: number): string {
  return `$${value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}`;
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatSourceLabel(source?: string): string {
  if (!source) return '--';
  const labels: Record<string, string> = {
    market: 'Market',
    prediction_model: 'Model',
    market_behavior: 'Behavior',
    ai_debate: 'AI Debate',
    final: 'Final',
  };
  return labels[source] ?? source;
}

function formatConfigLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
