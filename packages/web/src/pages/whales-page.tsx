import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Fish, AlertTriangle, TrendingUp, RefreshCw, Trophy } from 'lucide-react';
import { useWhaleStore, type WhaleListMode } from '../stores/whale-store';
import { useWalletFollowStore } from '../stores/wallet-follow-store';
import { DataState } from '../components/DataState';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { VirtualList } from '../components/VirtualList';
import { AddressGraph as AddressGraphView } from '../components/address-graph';
import { CopyFollowPanel, FollowWalletButton } from '../components/CopyFollowPanel';
import { WhaleFollowGuide } from '../components/WhaleFollowGuide';
import { EmptyStateGuide } from '../components/EmptyStateGuide';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Badge, Button, Progress, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import type { AddressGraph as AddressGraphData } from '@polyrader/core';
import { getAddressGraph } from '../utils/api';

type PageTab = WhaleListMode | 'follow';

const VOLUME_GRID = 'grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-0 px-6 py-3 text-sm items-center';
const WIN_RATE_GRID = 'grid grid-cols-[1fr_repeat(5,minmax(0,1fr))] gap-0 px-6 py-3 text-sm items-center';

export function WhalesPage() {
  const { whales, listMode, isLoading, error, fetchWhales, setListMode } = useWhaleStore();
  const { fetchFollowed, fetchSignals, followed } = useWalletFollowStore();
  const { subscribe } = useWebSocket();
  const { t } = useI18n();
  const [pageTab, setPageTab] = useState<PageTab>('volume');

  const loadWhales = useCallback((mode: WhaleListMode = listMode) => {
    void fetchWhales({ sort: mode, minSamples: mode === 'win_rate' ? 10 : 0 });
  }, [fetchWhales, listMode]);

  useEffect(() => {
    void fetchWhales({ sort: 'volume' });
    void fetchFollowed();
  }, [fetchWhales, fetchFollowed]);

  useEffect(() => {
    return subscribe('whales', () => {
      loadWhales();
    });
  }, [subscribe, loadWhales]);

  useEffect(() => {
    return subscribe('copy-signals', () => {
      void fetchSignals();
    });
  }, [subscribe, fetchSignals]);

  const [graph, setGraph] = useState<AddressGraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await getAddressGraph();
      setGraph(data?.nodes && data?.links ? data : { nodes: [], links: [] });
    } catch (err) {
      setGraphError((err as Error).message);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleTabChange = (tab: string) => {
    if (tab === 'follow') {
      setPageTab('follow');
      return;
    }
    const nextMode = tab as WhaleListMode;
    setPageTab(nextMode);
    setListMode(nextMode);
    loadWhales(nextMode);
  };

  const highRiskCount = whales.filter((w) => w.suspiciousScore.total >= 50).length;
  const highWinRateCount = whales.filter((w) => (w.settledBets ?? 0) >= 10 && w.winRate >= 0.6).length;
  const totalVolume = whales.reduce((s, w) => s + w.totalVolume, 0);
  const isWinRateMode = pageTab === 'win_rate';
  const isFollowTab = pageTab === 'follow';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('whales.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('whales.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => (isFollowTab ? fetchFollowed() : loadWhales())} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {!isFollowTab && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isLoading ? (
            <StatsSkeleton count={3} />
          ) : (
            [
              { label: t('whales.monitoredAddresses'), value: String(whales.length), icon: Fish },
              {
                label: isWinRateMode ? t('whales.highWinRateAddresses') : t('whales.highRiskAddresses'),
                value: String(isWinRateMode ? highWinRateCount : highRiskCount),
                icon: isWinRateMode ? Trophy : AlertTriangle,
              },
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
      )}

      <Tabs value={pageTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="volume">{t('whales.tabVolume')}</TabsTrigger>
          <TabsTrigger value="win_rate">{t('whales.tabWinRate')}</TabsTrigger>
          <TabsTrigger value="follow">{t('whales.tabFollow')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isFollowTab ? (
        <>
          {followed.length === 0 && <WhaleFollowGuide />}
          <CopyFollowPanel />
        </>
      ) : (
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={!isLoading && !error && whales.length === 0 && !isWinRateMode}
          onRetry={() => loadWhales()}
          skeleton={<TableSkeleton rows={6} cols={6} />}
        >
          {whales.length === 0 && isWinRateMode ? (
            <EmptyStateGuide
              icon={Trophy}
              title={t('whales.winRateEmptyTitle')}
              description={t('whales.winRateEmptyDesc')}
              steps={[
                t('whales.winRateEmptyStep1'),
                t('whales.winRateEmptyStep2'),
              ]}
            />
          ) : (
          <Card>
            <CardHeader className="h-auto flex flex-col gap-3 border-b px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="space-y-1">
                <CardTitle>{isWinRateMode ? t('whales.winRateLeaderboard') : t('whales.leaderboard')}</CardTitle>
                {isWinRateMode && (
                  <p className="text-xs text-muted-foreground">{t('whales.winRateLeaderboardHint')}</p>
                )}
              </div>
            </CardHeader>
            {whales.length > 0 && (
              <VirtualList
                count={whales.length}
                estimateSize={56}
                maxHeight={600}
                header={
                  isWinRateMode ? (
                    <div className={`${WIN_RATE_GRID} border-b bg-muted/50 font-medium text-muted-foreground sticky top-0`}>
                      <span className="text-left">{t('whales.address')}</span>
                      <span className="text-right">{t('whales.winRate')}</span>
                      <span className="text-right">{t('whales.settledBets')}</span>
                      <span className="text-right">{t('whales.roi')}</span>
                      <span className="text-right">{t('whales.pnl')}</span>
                      <span className="text-right">{t('whales.volume')}</span>
                    </div>
                  ) : (
                    <div className={`${VOLUME_GRID} border-b bg-muted/50 font-medium text-muted-foreground sticky top-0`}>
                      <span className="text-left">{t('whales.address')}</span>
                      <span className="text-right">{t('whales.volume')}</span>
                      <span className="text-right">{t('whales.positions')}</span>
                      <span className="text-right">{t('whales.winRate')}</span>
                      <span className="text-right">{t('whales.pnl')}</span>
                      <span className="text-right">{t('whales.suspicious')}</span>
                    </div>
                  )
                }
              >
                {(index) => {
                  const w = whales[index];
                  if (isWinRateMode) {
                    return (
                      <div className={`${WIN_RATE_GRID} border-b border-border/50 hover:bg-muted/30 transition-colors`}>
                        <span className="flex items-center gap-1 font-mono text-xs text-left">
                          <FollowWalletButton address={w.address} />
                          <Link to={`/whales/${w.address}`} className="hover:underline">
                            {w.address.slice(0, 6)}...{w.address.slice(-4)}
                          </Link>
                        </span>
                        <span className="flex items-center justify-end gap-2">
                          <Progress value={w.winRate * 100} className="w-16" />
                          <span className="tabular-nums text-xs">{(w.winRate * 100).toFixed(0)}%</span>
                        </span>
                        <span className="text-right tabular-nums">{w.settledBets ?? 0}</span>
                        <span className={`text-right tabular-nums ${(w.roi ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                          {((w.roi ?? 0) * 100).toFixed(1)}%
                        </span>
                        <span className={`text-right tabular-nums ${w.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                          {w.pnl >= 0 ? '+' : ''}${w.pnl.toFixed(0)}
                        </span>
                        <span className="text-right tabular-nums">
                          ${(w.totalVolume / 1000).toFixed(1)}K
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className={`${VOLUME_GRID} border-b border-border/50 hover:bg-muted/30 transition-colors`}>
                      <span className="flex items-center gap-1 font-mono text-xs text-left">
                        <FollowWalletButton address={w.address} />
                        <Link to={`/whales/${w.address}`} className="hover:underline">
                          {w.address.slice(0, 6)}...{w.address.slice(-4)}
                        </Link>
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
          )}
        </DataState>
      )}

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
