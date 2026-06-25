import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Bell, Zap, Play, Loader2, Inbox, Users, ExternalLink } from 'lucide-react';
import { useWalletFollowStore } from '../stores/wallet-follow-store';
import { useI18n } from '../hooks/use-i18n';
import { Badge, Button, Card, CardHeader, CardTitle, Input } from '@/components/ui';
import { ProductModeNotice } from './ProductModeNotice';
import { EmptyStateGuide } from './EmptyStateGuide';
import { useToast } from './ToastProvider';
import type { FollowedWallet, WalletCopySignal } from '@polyrader/core';

export function CopyFollowPanel() {
  const { t } = useI18n();
  const {
    followed,
    config,
    signals,
    copyTrades,
    copySummary,
    fetchFollowed,
    fetchConfig,
    fetchSignals,
    fetchCopyTrades,
    fetchCopySummary,
    unfollow,
    updateFollow,
    updateConfig,
    executeSignal,
  } = useWalletFollowStore();

  useEffect(() => {
    void Promise.all([fetchFollowed(), fetchConfig(), fetchSignals(), fetchCopyTrades(), fetchCopySummary()]);
  }, [fetchFollowed, fetchConfig, fetchSignals, fetchCopyTrades, fetchCopySummary]);

  const refresh = () => {
    void Promise.all([fetchFollowed(), fetchSignals(), fetchCopyTrades(), fetchCopySummary()]);
  };

  return (
    <div className="space-y-4">
      <ProductModeNotice mode="paper-copy" />

      <Card>
        <CardHeader className="border-b px-6 py-3">
          <CardTitle>{t('whales.copyConfigTitle')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('whales.copyConfigHint')}</p>
        </CardHeader>
        {config && (
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={config.enabled ? 'default' : 'outline'}
                onClick={() => updateConfig({ enabled: !config.enabled })}
              >
                {config.enabled ? t('whales.copyEnabled') : t('whales.copyDisabled')}
              </Button>
              <Button
                size="sm"
                variant={config.requireUserConfirm ? 'outline' : 'default'}
                onClick={() => updateConfig({ requireUserConfirm: !config.requireUserConfirm })}
              >
                {config.requireUserConfirm ? t('whales.manualConfirm') : t('whales.autoCopyMode')}
              </Button>
              <Badge variant="yellow">{t('whales.modePaper')}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-muted-foreground">{t('whales.copyRatio')}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  defaultValue={config.copyRatio}
                  onBlur={(e) => updateConfig({ copyRatio: Number(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">{t('whales.maxOrderUsd')}</span>
                <Input
                  type="number"
                  min="1"
                  defaultValue={config.maxOrderUsd}
                  onBlur={(e) => updateConfig({ maxOrderUsd: Number(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">{t('whales.minVolumeShare')}</span>
                <Input
                  type="number"
                  step="0.005"
                  min="0.001"
                  max="1"
                  defaultValue={config.minMarketVolumeShare}
                  onBlur={(e) => updateConfig({ minMarketVolumeShare: Number(e.target.value) })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">{t('whales.minMarketVolume')}</span>
                <Input
                  type="number"
                  min="0"
                  defaultValue={config.minMarketVolumeUsd}
                  onBlur={(e) => updateConfig({ minMarketVolumeUsd: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-3">
          <CardTitle>{t('whales.followedWallets')}</CardTitle>
          <Button variant="outline" size="sm" onClick={refresh}>{t('common.refresh')}</Button>
        </CardHeader>
        <div className="divide-y">
          {followed.length === 0 ? (
            <EmptyStateGuide
              className="m-4 border-none bg-transparent"
              icon={Users}
              title={t('whales.noFollowedTitle')}
              description={t('whales.noFollowed')}
              steps={[
                t('whales.followGuideStep1Desc'),
                t('whales.followGuideStep2Desc'),
                t('whales.followGuideStep3Desc'),
              ]}
            />
          ) : (
            followed.map((w) => (
              <FollowedRow
                key={w.address}
                wallet={w}
                onUnfollow={() => unfollow(w.address)}
                onUpdate={(partial) => updateFollow(w.address, partial)}
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader className="border-b px-6 py-3">
          <CardTitle>{t('whales.copySignals')}</CardTitle>
        </CardHeader>
        <div className="divide-y max-h-[360px] overflow-y-auto">
          {signals.length === 0 ? (
            <EmptyStateGuide
              className="m-4 border-none bg-transparent"
              icon={Inbox}
              title={t('whales.signalsEmptyTitle')}
              description={t('whales.signalsEmptyDesc')}
            />
          ) : (
            signals.map((s) => (
              <SignalRow key={s.id} signal={s} onExecute={() => executeSignal(s.id)} />
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader className="border-b px-6 py-3">
          <CardTitle>{t('whales.copyTrades')}</CardTitle>
          {copySummary && copySummary.settled > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('whales.copyPnlSummary')}:{' '}
              <span className={copySummary.totalPnl >= 0 ? 'text-green' : 'text-red'}>
                {copySummary.totalPnl >= 0 ? '+' : ''}${copySummary.totalPnl.toFixed(0)}
              </span>
              {' · '}
              {t('whales.copyPnlSettled', {
                settled: copySummary.settled,
                winRate: ((copySummary.wins / copySummary.settled) * 100).toFixed(0),
              })}
            </p>
          )}
        </CardHeader>
        <div className="divide-y max-h-[280px] overflow-y-auto">
          {copyTrades.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t('whales.noCopyTrades')}</p>
          ) : (
            copyTrades.map((trade) => (
              <div key={trade.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="truncate text-xs">{trade.marketQuestion ?? trade.tokenId.slice(0, 12)}</p>
                  <span className="font-mono text-[10px] text-muted-foreground">{trade.side.toUpperCase()}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums">${trade.amount.toFixed(0)} @ {(trade.price * 100).toFixed(0)}¢</span>
                  {trade.settlementStatus === 'won' || trade.settlementStatus === 'lost' ? (
                    <span className={`tabular-nums text-xs ${(trade.pnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {(trade.pnl ?? 0) >= 0 ? '+' : ''}${(trade.pnl ?? 0).toFixed(0)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('whales.tradePending')}</span>
                  )}
                  <Badge variant={trade.status === 'filled' ? 'green' : trade.status === 'failed' ? 'red' : 'yellow'}>
                    {trade.mode}/{trade.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function FollowedRow({
  wallet,
  onUnfollow,
  onUpdate,
}: {
  wallet: FollowedWallet;
  onUnfollow: () => void;
  onUpdate: (partial: Partial<Pick<FollowedWallet, 'alertsEnabled' | 'autoCopyEnabled'>>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between px-6 py-3 text-sm">
      <div>
        <span className="font-mono text-xs">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
        {wallet.winRate !== undefined && (
          <span className="ml-3 text-muted-foreground">
            {(wallet.winRate * 100).toFixed(0)}% · {wallet.settledBets ?? 0} {t('whales.settledBets')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          title={t('whales.toggleAlerts')}
          onClick={() => onUpdate({ alertsEnabled: !wallet.alertsEnabled })}
        >
          <Bell className={`h-3.5 w-3.5 ${wallet.alertsEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title={t('whales.toggleAutoCopy')}
          onClick={() => onUpdate({ autoCopyEnabled: !wallet.autoCopyEnabled })}
        >
          <Zap className={`h-3.5 w-3.5 ${wallet.autoCopyEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onUnfollow}>{t('whales.unfollow')}</Button>
      </div>
    </div>
  );
}

function SignalRow({ signal, onExecute }: { signal: WalletCopySignal; onExecute: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-mono text-xs">{signal.leaderAddress.slice(0, 6)}...{signal.leaderAddress.slice(-4)}</div>
        <div className="text-muted-foreground truncate max-w-md">
          {signal.marketQuestion ?? signal.tokenId}
        </div>
        <div className="text-xs text-muted-foreground">
          {signal.side.toUpperCase()} ${signal.leaderAmount.toFixed(0)}
          {signal.leaderVolumeShare !== undefined && (
            <span> · {(signal.leaderVolumeShare * 100).toFixed(1)}% {t('whales.ofMarketVolume')}</span>
          )}
          {signal.suggestedAmount ? ` → ${t('whales.suggested')} $${signal.suggestedAmount.toFixed(0)}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {signal.marketSlug && (
          <Link
            to={`/match/${signal.marketSlug}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
            title={t('whales.viewMarket')}
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        <Badge variant={
          signal.status === 'executed' ? 'green' :
          signal.status === 'pending' ? 'yellow' :
          'red'
        }>
          {signal.status}
        </Badge>
        {signal.status === 'pending' && signal.suggestedAmount && (
          <Button size="sm" variant="outline" onClick={onExecute}>
            <Play className="h-3 w-3" />
            {t('whales.executeCopy')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function FollowWalletButton({ address }: { address: string }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isFollowed, follow, unfollow } = useWalletFollowStore();
  const followed = isFollowed(address);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (followed) {
        await unfollow(address);
        addToast('info', t('whales.unfollowSuccess'));
      } else {
        await follow(address);
        addToast('success', t('whales.followSuccess'));
      }
    } catch {
      addToast('error', t('whales.followError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={loading}
      title={followed ? t('whales.unfollow') : t('whales.follow')}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Star className={`h-3.5 w-3.5 ${followed ? 'fill-primary text-primary' : ''}`} />
      )}
    </Button>
  );
}
