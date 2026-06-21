import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, type Time } from 'lightweight-charts';

interface PricePoint {
  time: string;
  value: number;
}

interface PriceChartProps {
  data: PricePoint[];
  height?: number;
  label?: string;
}

export function PriceChart({ data, height = 200, label = 'Price' }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

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
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
      },
      crosshair: {
        mode: 0,
      },
    });

    const series = chart.addLineSeries({
      color: '#3B82F6',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => price.toFixed(4),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;

    const chartData: LineData[] = data.map((d) => ({
      time: (new Date(d.time).getTime() / 1000) as Time,
      value: d.value,
    }));

    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div className="w-full">
      {label && <div className="mb-2 text-xs text-muted-foreground">{label}</div>}
      <div ref={containerRef} />
    </div>
  );
}
