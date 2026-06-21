import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type HistogramData, type Time } from 'lightweight-charts';
import { useI18n } from '../hooks/use-i18n';

interface OrderBookLevel {
  price: number;
  size: number;
  side: 'bid' | 'ask';
}

interface OrderBookChartProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  height?: number;
}

export function OrderBookChart({ bids, asks, height = 200 }: OrderBookChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const bidSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const askSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#A1A1AA',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      timeScale: {
        visible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      bidSeriesRef.current = null;
      askSeriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!chartRef.current) return;

    // Remove existing series
    if (bidSeriesRef.current) {
      chartRef.current.removeSeries(bidSeriesRef.current);
    }
    if (askSeriesRef.current) {
      chartRef.current.removeSeries(askSeriesRef.current);
    }

    const bidData: HistogramData[] = bids.map((b, i) => ({
      time: i as Time,
      value: b.size,
      color: 'rgba(0, 255, 65, 0.5)',
    }));

    const askData: HistogramData[] = asks.map((a, i) => ({
      time: (bids.length + i) as Time,
      value: a.size,
      color: 'rgba(255, 51, 51, 0.5)',
    }));

    bidSeriesRef.current = chartRef.current.addHistogramSeries({
      priceFormat: { type: 'volume' },
    });
    bidSeriesRef.current.setData(bidData);

    askSeriesRef.current = chartRef.current.addHistogramSeries({
      priceFormat: { type: 'volume' },
    });
    askSeriesRef.current.setData(askData);
  }, [bids, asks]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('orderBook.depth')}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-green/50" /> Bid
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-red/50" /> Ask
          </span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
