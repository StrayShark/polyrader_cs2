import { useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from '../components/ToastProvider';
import { useWalletFollowStore } from '../stores/wallet-follow-store';
import { useI18n } from './use-i18n';
import type { WalletCopySignal } from '@polyrader/core';

interface CopySignalEvent {
  type: string;
  signal?: WalletCopySignal & { marketSlug?: string };
}

/**
 * Global toast + store refresh when followed wallets generate copy signals.
 */
export function useCopySignalAlerts() {
  const { subscribe } = useWebSocket();
  const { addToast } = useToast();
  const { t } = useI18n();
  const { fetchSignals, fetchCopyTrades, fetchCopySummary } = useWalletFollowStore();

  useEffect(() => {
    return subscribe('copy-signals', (data: unknown) => {
      const payload = data as CopySignalEvent;
      if (payload.type !== 'copy-signal:new' || !payload.signal) return;

      const signal = payload.signal;
      void Promise.all([fetchSignals(), fetchCopyTrades(), fetchCopySummary()]);

      const shortAddr = `${signal.leaderAddress.slice(0, 6)}…${signal.leaderAddress.slice(-4)}`;
      const amount = `$${signal.leaderAmount.toFixed(0)}`;
      const question = signal.marketQuestion
        ? (signal.marketQuestion.length > 40 ? `${signal.marketQuestion.slice(0, 40)}…` : signal.marketQuestion)
        : signal.tokenId.slice(0, 10);

      addToast('info', t('whales.copySignalToast', { address: shortAddr, amount, market: question }));
    });
  }, [subscribe, addToast, t, fetchSignals, fetchCopyTrades, fetchCopySummary]);
}
