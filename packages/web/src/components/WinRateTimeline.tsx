import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, type Time } from 'lightweight-charts';

export interface TimelineSnapshot {
  analysisId: string;
  createdAt: string;
  provider: string;
  model: string;
  teamAProb: number;
  teamBProb: number;
  confidence: number;
}

interface WinRateTimelineProps {
  data: TimelineSnapshot[];
  teamAName?: string;
  teamBName?: string;
  height?: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10B981',
  anthropic: '#F97316',
  google: '#3B82F6',
  deepseek: '#8B5CF6',
  xai: '#EF4444',
  groq: '#EAB308',
  qwen: '#06B6D4',
  moonshot: '#EC4899',
  zhipu: '#84CC16',
  doubao: '#F59E0B',
  minimax: '#A855F7',
  hunyuan: '#14B8A6',
};

export function WinRateTimeline({ data, teamAName = 'Team A', teamBName = 'Team B', height = 180 }: WinRateTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

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
      crosshair: { mode: 0 },
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      seriesMapRef.current.clear();
    };
  }, [height]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Group snapshots by provider
    const providerMap = new Map<string, LineData[]>();
    for (const snap of data) {
      const points = providerMap.get(snap.provider) ?? [];
      points.push({
        time: (new Date(snap.createdAt).getTime() / 1000) as Time,
        value: snap.teamAProb,
      });
      providerMap.set(snap.provider, points);
    }

    const chart = chartRef.current;
    const existingProviders = new Set<string>();

    for (const [provider, points] of providerMap) {
      existingProviders.add(provider);
      let series = seriesMapRef.current.get(provider);
      if (!series) {
        series = chart.addLineSeries({
          color: PROVIDER_COLORS[provider] ?? '#888888',
          lineWidth: 2,
          priceFormat: { type: 'custom', formatter: (p: number) => `${(p * 100).toFixed(1)}%` },
          title: provider,
        });
        seriesMapRef.current.set(provider, series);
      }
      series.setData(points);
    }

    // Remove series for providers no longer in data
    for (const [provider, series] of seriesMapRef.current) {
      if (!existingProviders.has(provider)) {
        chart.removeSeries(series);
        seriesMapRef.current.delete(provider);
      }
    }

    chart.timeScale().fitContent();
  }, [data]);

  if (data.length === 0) {
    return null;
  }

  const providers = Array.from(new Set(data.map((d) => d.provider)));

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {teamAName} <span className="text-blue">●</span> win rate — 24h
        </div>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span key={p} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span style={{ color: PROVIDER_COLORS[p] ?? '#888' }}>●</span>
              {p}
            </span>
          ))}
        </div>
      </div>
      <div ref={containerRef} />
      <div className="mt-1 text-[10px] text-muted-foreground">
        {teamBName} win rate = 100% − {teamAName} win rate
      </div>
    </div>
  );
}
