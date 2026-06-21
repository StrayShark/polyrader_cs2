import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Trophy, Map, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { TableSkeleton } from '../components/Skeletons';
import { useI18n } from '../hooks/use-i18n';
import { Button, Card, CardHeader, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui';

interface RankingTeam {
  rank: number;
  teamId: string;
  name: string;
}

interface HltvMatch {
  matchId: string;
  teamA: string;
  teamB: string;
  event: string;
  format: string;
  date: string;
}

interface MapPoolEntry {
  map: string;
  teamAPct: number;
  teamBPct: number;
}

export function EsportsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [rankings, setRankings] = useState<RankingTeam[]>([]);
  const [matches, setMatches] = useState<HltvMatch[]>([]);
  const [mapPool, setMapPool] = useState<MapPoolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [eventsRes, rankingsRes, mapPoolRes] = await Promise.all([
        api.get<{ data: HltvMatch[] }>('/esports/events'),
        api.get<{ data: RankingTeam[] }>('/esports/rankings'),
        api.get<{ data: MapPoolEntry[] }>('/esports/map-pool'),
      ]);
      setMatches(eventsRes.data ?? []);
      setRankings(rankingsRes.data ?? []);
      setMapPool(mapPoolRes.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('esports.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('esports.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={rankings.length === 0 && matches.length === 0 && !isLoading}
        onRetry={fetchData}
        skeleton={<TableSkeleton rows={8} cols={3} />}
      >

      {/* HLTV Rankings */}
      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{t('esports.hltvTop10')}</h2>
          </div>
        </CardHeader>
        {rankings.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('esports.rankingEmpty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2 w-12">#</TableHead>
                <TableHead className="px-6 py-2">{t('esports.team')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('esports.rank')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankings.slice(0, 10).map((team) => (
                <TableRow key={team.teamId}>
                  <TableCell className="px-6 py-3 font-mono text-xs text-muted-foreground">{team.rank}</TableCell>
                  <TableCell className="px-6 py-3 font-medium">{team.name}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">#{team.rank}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Upcoming Matches */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">{t('esports.upcomingMatches', { count: matches.length })}</h2>
        </div>
        {matches.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('esports.matchesEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {matches.slice(0, 10).map((m) => (
              <div
                key={m.matchId}
                className="flex cursor-pointer items-center justify-between rounded-md bg-muted/50 px-4 py-3 text-sm transition-colors hover:bg-muted"
                onClick={() => navigate(`/match/${m.matchId}`)}
              >
                <div className="flex items-center gap-4">
                  <span className="font-medium">{m.teamA}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-medium">{m.teamB}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{m.event}</span>
                  <span>{m.format}</span>
                  <span>{m.date ? new Date(m.date).toLocaleDateString() : 'TBD'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Map Pool */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Map className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">{t('esports.mapPool')}</h2>
        </div>
        {mapPool.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('esports.mapPoolEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {mapPool.map((entry) => (
              <div key={entry.map} className="flex items-center gap-3">
                <span className="w-20 text-xs">{entry.map}</span>
                <div className="flex-1 flex items-center gap-1">
                  <div className="h-2 rounded-l-full bg-primary" style={{ width: `${entry.teamAPct}%` }} />
                  <span className="text-[10px] text-muted-foreground">vs</span>
                  <div className="h-2 rounded-r-full bg-orange" style={{ width: `${entry.teamBPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      </DataState>
    </div>
  );
}
