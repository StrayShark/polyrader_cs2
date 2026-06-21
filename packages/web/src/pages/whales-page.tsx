import { useEffect, useState, useCallback } from 'react';
import { Fish, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import { useWhaleStore } from '../stores/whale-store';
import { DataState } from '../components/DataState';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { VirtualList } from '../components/VirtualList';
import { AddressGraph as AddressGraphView } from '../components/address-graph';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Badge, Button, Progress } from '@/components/ui';
import type { AddressGraph as AddressGraphData } from '@polyrader/core';
import { getAddressGraph } from '../utils/api';

// Grid template for 6 columns matching the table layout
const GRID = 'grid grid-cols-6 gap-0 px-6 py-3 text-sm items-center';

export function WhalesPage() {
  const { whales, isLoading, error, fetchWhales } = useWhaleStore();
  const { subscribe } = useWebSocket();
  const { t } = useI18n();

  useEffect(() => {
    fetchWhales();
  }, [fetchWhales]);

  // Real-time: refresh when whale data is updated
  useEffect(() => {
    return subscribe('whales', () => {
      fetchWhales();
    });
  }, [subscribe, fetchWhales]);

  // Address association graph
  const [graph, setGraph] = useState<AddressGraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await getAddressGraph();
      setGraph(data);
    } catch (err) {
      setGraphError((err as Error).message);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const highRiskCount = whales.filter((w) => w.suspiciousScore.total >= 50).length;
  const totalVolume = whales.reduce((s, w) => s + w.totalVolume, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('whales.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('whales.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchWhales()} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          <StatsSkeleton count={3} />
        ) : (
          [
            { label: t('whales.monitoredAddresses'), value: String(whales.length), icon: Fish },
            { label: t('whales.highRiskAddresses'), value: String(highRiskCount), icon: AlertTriangle },
            { label: t('whales.totalVolume'), value: `$${(totalVolume / 1000).toFixed(1)}K`, icon: TrendingUp },
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
          ))
        )}
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && whales.length === 0}
        onRetry={() => fetchWhales()}
        skeleton={<TableSkeleton rows={6} cols={6} />}
      >
        <Card>
          <CardHeader className="h-auto flex flex-row items-center justify-between space-y-0 border-b px-6 py-3">
            <CardTitle>{t('whales.leaderboard')}</CardTitle>
            {whales.length > 0 && (
              <span className="text-xs text-muted-foreground">{t('whales.addressCount', { count: whales.length })}</span>
            )}
          </CardHeader>
          {whales.length > 0 && (
            <VirtualList
              count={whales.length}
              estimateSize={56}
              maxHeight={600}
              header={
                <div className={`${GRID} border-b bg-muted/50 font-medium text-muted-foreground sticky top-0`}>
                  <span className="text-left">{t('whales.address')}</span>
                  <span className="text-right">{t('whales.volume')}</span>
                  <span className="text-right">{t('whales.positions')}</span>
                  <span className="text-right">{t('whales.winRate')}</span>
                  <span className="text-right">{t('whales.pnl')}</span>
                  <span className="text-right">{t('whales.suspicious')}</span>
                </div>
              }
            >
              {(index) => {
                const w = whales[index];
                return (
                  <div className={`${GRID} border-b border-border/50 hover:bg-muted/30 transition-colors`}>
                    <span className="font-mono text-xs text-left">
                      {w.address.slice(0, 6)}...{w.address.slice(-4)}
                    </span>
                    <span className="text-right tabular-nums">
                      ${(w.totalVolume / 1000).toFixed(1)}K
                    </span>
                    <span className="text-right tabular-nums">{w.activePositions}</span>
                    <span className="flex items-center justify-end gap-2">
                      <Progress value={w.winRate * 100} className="w-16" />
                      <span className="tabular-nums text-xs">{(w.winRate * 100).toFixed(0)}%</span>
                    </span>
                    <span className={`text-right tabular-nums ${w.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                      {w.pnl >= 0 ? '+' : ''}${w.pnl.toFixed(0)}
                    </span>
                    <span className="flex justify-end">
                      <Badge variant={
                        w.suspiciousScore.total > 70 ? 'red' :
                        w.suspiciousScore.total > 30 ? 'yellow' :
                        'green'
                      }>
                        {w.suspiciousScore.total}
                      </Badge>
                    </span>
                  </div>
                );
              }}
            </VirtualList>
          )}
        </Card>
      </DataState>

      <Card>
        <CardHeader className="h-auto flex flex-row items-center justify-between space-y-0 border-b px-6 py-3">
          <div>
            <CardTitle>{t('addressGraph.title')}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t('addressGraph.subtitle')}</p>
          </div>
          {graph && (
            <span className="text-xs text-muted-foreground">
              {t('addressGraph.nodeCount', { count: graph.nodes.length })} · {t('addressGraph.linkCount', { count: graph.links.length })}
            </span>
          )}
        </CardHeader>
        <div className="p-2">
          {graphLoading ? (
            <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: 460 }}>
              {t('addressGraph.loading')}
            </div>
          ) : graphError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground" style={{ height: 460 }}>
              <span>{graphError}</span>
              <Button variant="outline" size="sm" onClick={fetchGraph}>
                {t('common.retry')}
              </Button>
            </div>
          ) : graph ? (
            <AddressGraphView graph={graph} />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
