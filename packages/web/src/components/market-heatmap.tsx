import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Market } from '@polyrader/core';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader } from '@/components/ui';
import { cn } from '@/utils/cn';

type Tier = 'S' | 'A' | 'B' | 'Tier';

interface HeatmapCell {
  marketId: string;
  question: string;
  price: string;
  volume24h: number;
  tier: Tier;
  intensity: number;
}

const tierOrder: Tier[] = ['S', 'A', 'B', 'Tier'];

const tierBadgeClass: Record<Tier, string> = {
  S: 'bg-purple/20 text-purple',
  A: 'bg-blue/20 text-blue',
  B: 'bg-cyan/20 text-cyan',
  Tier: 'bg-muted text-muted-foreground',
};

function formatPrice(prices: string[] | undefined): string {
  if (!prices || prices.length === 0) return '--';
  const formatted = prices.slice(0, 2).map((p) => {
    const num = parseFloat(p);
    return Number.isFinite(num) ? `${(num * 100).toFixed(0)}%` : '--';
  });
  return formatted.join(' / ');
}

export function MarketHeatmap({ markets }: { markets: Market[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const cells = useMemo<HeatmapCell[]>(() => {
    if (markets.length === 0) return [];
    const sorted = [...markets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    const maxVolume = sorted[0]?.volume24h ?? 0;
    const safeMax = Number.isFinite(maxVolume) && maxVolume > 0 ? maxVolume : 1;
    const n = sorted.length;

    return sorted.map((m, i) => {
      const volume = m.volume24h ?? 0;
      const percentile = i / n;
      let tier: Tier;
      if (percentile < 0.25) tier = 'S';
      else if (percentile < 0.5) tier = 'A';
      else if (percentile < 0.75) tier = 'B';
      else tier = 'Tier';
      return {
        marketId: m.conditionId,
        question: m.question,
        price: formatPrice(m.outcomePrices),
        volume24h: volume,
        tier,
        intensity: safeMax > 0 ? volume / safeMax : 0,
      };
    });
  }, [markets]);

  const grouped = useMemo(() => {
    const groups: Record<Tier, HeatmapCell[]> = { S: [], A: [], B: [], Tier: [] };
    for (const cell of cells) {
      groups[cell.tier].push(cell);
    }
    return groups;
  }, [cells]);

  if (cells.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-medium">{t('heatmap.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('heatmap.subtitle')}</p>
      </CardHeader>
      <div className="space-y-4 p-4 pt-0">
        {tierOrder.map((tier) => {
          const tierCells = grouped[tier];
          if (tierCells.length === 0) return null;
          return (
            <div key={tier}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-5 items-center px-1.5 text-[10px] font-semibold rounded',
                    tierBadgeClass[tier],
                  )}
                >
                  {t(`heatmap.tier.${tier}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tierCells.length} {t('heatmap.markets')}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                {tierCells.map((cell) => (
                  <div
                    key={cell.marketId}
                    className="relative h-10 cursor-pointer rounded transition-all hover:ring-1 hover:ring-foreground/40"
                    style={{
                      backgroundColor: `rgba(34, 197, 94, ${0.15 + cell.intensity * 0.85})`,
                    }}
                    onMouseEnter={() => setHoveredId(cell.marketId)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => navigate(`/match/${cell.marketId}`)}
                  >
                    {hoveredId === cell.marketId && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <div className="max-w-[220px] truncate font-medium">{cell.question}</div>
                        <div className="mt-1 text-muted-foreground">
                          {t('heatmap.price')}: {cell.price}
                        </div>
                        <div className="text-muted-foreground">
                          {t('heatmap.volume24h')}: $
                          {((Number.isFinite(cell.volume24h) ? cell.volume24h : 0) / 1000).toFixed(1)}K
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
