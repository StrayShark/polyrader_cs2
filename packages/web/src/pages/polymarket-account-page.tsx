import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { RefreshCw, Wallet, ListChecks, History, Activity, KeyRound, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { TableSkeleton } from '../components/Skeletons';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { ProductModeNotice } from '../components/ProductModeNotice';
import type { PolymarketAccountOverview } from '@polyrader/core';

export function PolymarketAccountPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<PolymarketAccountOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: PolymarketAccountOverview }>('/polymarket/account');
      setOverview(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const status = overview?.status;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('polymarketAccount.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('polymarketAccount.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <ProductModeNotice mode="read-only" />

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && !overview}
        onRetry={fetchData}
        skeleton={<TableSkeleton rows={6} cols={6} />}
      >
        {overview && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  {t('polymarketAccount.connection')}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={status?.canReadPrivate ? 'green' : status?.hasApiCredentials ? 'yellow' : 'secondary'}>
                    {status?.canReadPrivate ? t('polymarketAccount.privateConnected') : status?.hasApiCredentials ? t('polymarketAccount.partial') : t('polymarketAccount.publicOnly')}
                  </Badge>
                  {status?.message && <span className="text-xs text-muted-foreground">{status.message}</span>}
                </div>
              </Card>
              <StatCard label={t('polymarketAccount.address')} value={shortAddress(status?.address)} icon={Wallet} />
              <StatCard label={t('polymarketAccount.positionValue')} value={formatCurrency(overview.totalPositionValue)} icon={Activity} />
              <StatCard label={t('polymarketAccount.openOrders')} value={String(overview.openOrders.length)} icon={ListChecks} />
            </div>

            {overview.diagnostics.length > 0 && (
              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <CardTitle>{t('polymarketAccount.diagnostics')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.source')}</TableHead>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.operation')}</TableHead>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.result')}</TableHead>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.message')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.diagnostics.map((diagnostic) => (
                        <TableRow key={`${diagnostic.source}-${diagnostic.operation}`}>
                          <TableCell className="px-6 py-3">{diagnostic.source}</TableCell>
                          <TableCell className="px-6 py-3">{diagnostic.operation}</TableCell>
                          <TableCell className="px-6 py-3">
                            <Badge variant={diagnostic.ok ? 'green' : 'red'}>
                              {diagnostic.ok ? t('polymarketAccount.ok') : t('polymarketAccount.failed')}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-md px-6 py-3 text-sm text-muted-foreground">
                            {diagnostic.message ?? '--'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="border-b px-6 py-3">
                <CardTitle>{t('polymarketAccount.balances')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {overview.balances.length === 0 ? (
                  <EmptyState text={t('polymarketAccount.noBalances')} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.asset')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('polymarketAccount.balance')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('polymarketAccount.allowance')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.balances.map((balance) => (
                        <TableRow key={`${balance.assetType}-${balance.tokenId ?? 'collateral'}`}>
                          <TableCell className="px-6 py-3">{balance.assetType}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{formatCurrency(balance.balance)}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{balance.allowance === undefined ? '--' : formatCurrency(balance.allowance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b px-6 py-3">
                <CardTitle>{t('polymarketAccount.positions')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {overview.positions.length === 0 ? (
                  <EmptyState text={t('polymarketAccount.noPositions')} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('common.market')}</TableHead>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.outcome')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('polymarketAccount.shares')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('polymarketAccount.value')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">PnL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.positions.slice(0, 30).map((position, index) => (
                        <TableRow key={`${position.marketId}-${position.tokenId ?? index}`}>
                          <TableCell className="max-w-md px-6 py-3">
                            <div className="truncate font-medium" title={position.question}>{position.question || position.marketId}</div>
                            <div className="text-xs text-muted-foreground">{position.marketId}</div>
                          </TableCell>
                          <TableCell className="px-6 py-3">{position.outcome}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{formatNumber(position.shares)}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{formatCurrency(position.value)}</TableCell>
                          <TableCell className={`px-6 py-3 text-right tabular-nums ${(position.cashPnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                            {position.cashPnl === undefined ? '--' : formatSignedCurrency(position.cashPnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <ActivityTable title={t('polymarketAccount.trades')} rows={overview.trades} />
              <OrdersTable title={t('polymarketAccount.orders')} rows={overview.openOrders} />
            </div>

            <Card>
              <CardHeader className="border-b px-6 py-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>{t('polymarketAccount.activity')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {overview.activity.length === 0 ? (
                  <EmptyState text={t('polymarketAccount.noActivity')} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('polymarketAccount.type')}</TableHead>
                        <TableHead className="px-6 py-2">{t('common.market')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('polymarketAccount.value')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('common.time')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.activity.slice(0, 50).map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="px-6 py-3">{activity.type}</TableCell>
                          <TableCell className="max-w-md px-6 py-3 truncate">{activity.question ?? activity.marketId ?? '--'}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{activity.value === undefined ? '--' : formatCurrency(activity.value)}</TableCell>
                          <TableCell className="px-6 py-3 text-right text-xs text-muted-foreground">{formatDate(activity.timestamp)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </DataState>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function ActivityTable({ title, rows }: { title: string; rows: PolymarketAccountOverview['trades'] }) {
  return (
    <Card>
      <CardHeader className="border-b px-6 py-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="--" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2">Side</TableHead>
                <TableHead className="px-6 py-2">Outcome</TableHead>
                <TableHead className="px-6 py-2 text-right">Price</TableHead>
                <TableHead className="px-6 py-2 text-right">Size</TableHead>
                <TableHead className="px-6 py-2 text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 30).map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="px-6 py-3">
                    <Badge variant={trade.side === 'buy' ? 'green' : trade.side === 'sell' ? 'red' : 'secondary'}>{trade.side ?? '--'}</Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3">{trade.outcome ?? '--'}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{formatPctNumber(trade.price)}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{formatNumber(trade.size)}</TableCell>
                  <TableCell className="px-6 py-3 text-right text-xs text-muted-foreground">{formatDate(trade.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersTable({ title, rows }: { title: string; rows: PolymarketAccountOverview['openOrders'] }) {
  return (
    <Card>
      <CardHeader className="border-b px-6 py-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState text="--" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2">Side</TableHead>
                <TableHead className="px-6 py-2">Outcome</TableHead>
                <TableHead className="px-6 py-2 text-right">Price</TableHead>
                <TableHead className="px-6 py-2 text-right">Remaining</TableHead>
                <TableHead className="px-6 py-2 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 30).map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-6 py-3">
                    <Badge variant={order.side === 'buy' ? 'green' : order.side === 'sell' ? 'red' : 'secondary'}>{order.side ?? '--'}</Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3">{order.outcome ?? order.assetId ?? '--'}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{formatPctNumber(order.price)}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{formatNumber(order.remainingSize)}</TableCell>
                  <TableCell className="px-6 py-3 text-right">{order.status ?? '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatPctNumber(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function shortAddress(address?: string): string {
  if (!address) return '--';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(value: string): string {
  const date = new Date(Number(value) > 10_000_000_000 ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
