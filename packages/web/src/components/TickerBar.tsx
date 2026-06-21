import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/use-websocket';
import { useMarketStore } from '../stores/market-store';

interface TickerItem {
  conditionId: string;
  question: string;
  price: number;
  change: number;
}

/**
 * TickerBar — horizontal scrolling ticker showing real-time market prices.
 * Subscribes to WebSocket price updates and displays them in a continuous marquee.
 */
export function TickerBar() {
  const { subscribe } = useWebSocket();
  const { markets } = useMarketStore();
  const [items, setItems] = useState<TickerItem[]>([]);
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize from store
  useEffect(() => {
    if (markets.length === 0) return;
    const initial: TickerItem[] = markets.slice(0, 20).map((m) => {
      const price = parseFloat(m.outcomePrices[0] ?? '0.5');
      prevPricesRef.current.set(m.conditionId, price);
      return {
        conditionId: m.conditionId,
        question: m.question.length > 40 ? m.question.slice(0, 40) + '…' : m.question,
        price,
        change: 0,
      };
    });
    setItems(initial);
  }, [markets]);

  // Subscribe to real-time price updates
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const m of markets.slice(0, 20)) {
      const unsub = subscribe(`prices:${m.conditionId}`, (data: unknown) => {
        const priceData = data as { price: number };
        const prevPrice = prevPricesRef.current.get(m.conditionId) ?? priceData.price;
        const change = priceData.price - prevPrice;
        prevPricesRef.current.set(m.conditionId, priceData.price);

        setItems((prev) =>
          prev.map((item) =>
            item.conditionId === m.conditionId
              ? { ...item, price: priceData.price, change }
              : item,
          ),
        );
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [markets.length > 0 ? markets[0]?.conditionId : null, subscribe]);

  if (items.length === 0) return null;

  // Duplicate items for seamless scrolling
  const displayItems = [...items, ...items];

  return (
    <div
      ref={scrollRef}
      className="ticker-bar"
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        padding: '6px 0',
      }}
    >
      <div
        className="ticker-content"
        style={{
          display: 'inline-flex',
          gap: '32px',
          animation: 'ticker-scroll 60s linear infinite',
        }}
      >
        {displayItems.map((item, i) => (
          <span
            key={`${item.conditionId}-${i}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
            }}
          >
            <span style={{ color: 'var(--foreground)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.question}
            </span>
            <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
              {(item.price * 100).toFixed(1)}¢
            </span>
            <span style={{
              color: item.change > 0 ? 'var(--green)' : item.change < 0 ? 'var(--red)' : 'var(--muted-foreground)',
              fontSize: '11px',
            }}>
              {item.change > 0 ? '▲' : item.change < 0 ? '▼' : '—'}
              {item.change !== 0 ? `${Math.abs(item.change * 100).toFixed(1)}%` : ''}
            </span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-bar:hover .ticker-content {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
