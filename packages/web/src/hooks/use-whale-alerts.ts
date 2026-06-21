import { useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from '../components/ToastProvider';

interface WhaleTradeEvent {
  address: string;
  marketId: string;
  marketQuestion: string;
  side: 'buy' | 'sell';
  outcome: string;
  size: number;
  price: number;
  timestamp: string;
}

const WHALE_THRESHOLD = 10000; // $10K+ trades are "whale" trades

/**
 * useWhaleAlerts — subscribes to whale trade WebSocket events and
 * pushes toast notifications for large trades.
 */
export function useWhaleAlerts() {
  const { subscribe } = useWebSocket();
  const { addToast } = useToast();

  useEffect(() => {
    const unsub = subscribe('whale-trades', (data: unknown) => {
      const trade = data as WhaleTradeEvent;
      if (!trade || trade.size < WHALE_THRESHOLD) return;

      const sizeFormatted = `$${(trade.size / 1000).toFixed(1)}K`;
      const direction = trade.side === 'buy' ? 'bought' : 'sold';
      const outcome = trade.outcome === 'Yes' ? 'YES' : 'NO';
      const shortAddr = `${trade.address.slice(0, 6)}…${trade.address.slice(-4)}`;
      const shortQuestion = trade.marketQuestion.length > 50
        ? trade.marketQuestion.slice(0, 50) + '…'
        : trade.marketQuestion;

      addToast(
        trade.side === 'buy' ? 'success' : 'warning',
        `🐋 ${sizeFormatted} — ${shortAddr} ${direction} ${outcome}: ${shortQuestion}`,
      );
    });

    return unsub;
  }, [subscribe, addToast]);
}
