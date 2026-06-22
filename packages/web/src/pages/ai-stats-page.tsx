import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Target, History, Brain, DollarSign, RefreshCw } from 'lucide-react';
import { useLLMStore } from '../stores/llm-store';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { StatsSkeleton, TableSkeleton } from '../components/Skeletons';
import { CalibrationChart } from '../components/CalibrationChart';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from '@/components/ui';
import type { UserStats, SimulatedBet, CalibrationPoint } from '@polyrader/core';

export function AiStatsPage() {
  const { t } = useI18n();
  const { stats, isLoading, error, fetchLeaderboard, settleBet, deleteBet } = useLLMStore();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<SimulatedBet[]>([]);
  const [calibrationData, setCalibrationData] = useState<CalibrationPoint[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [settlingBetId, setSettlingBetId] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
    fetchUserStats();
    fetchHistory();
    fetchCalibration(selectedProvider);
  }, [fetchLeaderboard]);

  const fetchCalibration = async (provider: string) => {
    try {
      const { data } = await api.get<{ data: CalibrationPoint[] }>(`/ai/stats/calibration/${provider}`);
      setCalibrationData(data);
    } catch {}
  };

  const fetchUserStats = async () => {
    try {
      const { data } = await api.get<{ data: UserStats }>('/ai/stats/user');
      setUserStats(data);
    } catch {}
  };

  const fetchHistory = async () => {
    try {
      const { data } = await api.get<{ data: SimulatedBet[] }>('/ai/stats/history?limit=10');
      setHistory(data);
    } catch {}
  };

  const refreshAll = () => {
    fetchLeaderboard();
    fetchUserStats();
    fetchHistory();
  };

  const handleSettle = async (id: string, result: 'won' | 'lost') => {
    await settleBet(id, result);
    setSettlingBetId(null);
    fetchHistory();
    fetchUserStats();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('aiStats.confirmDelete'))) return;
    await deleteBet(id);
    fetchHistory();
    fetchUserStats();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('aiStats.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('aiStats.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && stats.length === 0 && !userStats}
        onRetry={() => { fetchLeaderboard(); fetchUserStats(); }}
        skeleton={
          <div className="space-y-4">
            <StatsSkeleton count={4} />
            <TableSkeleton rows={5} cols={4} />
          </div>
        }
      >

      {/* User Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: t('aiStats.totalBets'), value: userStats ? String(userStats.totalBets) : '--', icon: Target },
          { label: t('aiStats.winRate'), value: userStats ? `${(userStats.accuracy * 100).toFixed(1)}%` : '--', icon: TrendingUp },
          { label: t('aiStats.totalPnl'), value: userStats ? `${userStats.totalProfitLoss >= 0 ? '+' : ''}$${userStats.totalProfitLoss.toFixed(2)}` : '--', icon: DollarSign, green: userStats && userStats.totalProfitLoss >= 0 },
          { label: t('aiStats.bestLlm'), value: userStats?.bestLLM ?? '--', icon: Brain },
          { label: t('aiStats.sharpeRatio'), value: userStats?.sharpeRatio != null ? userStats.sharpeRatio.toFixed(2) : '--', icon: TrendingUp },
          { label: t('aiStats.maxDrawdown'), value: userStats?.maxDrawdown != null ? `${(userStats.maxDrawdown * 100).toFixed(1)}%` : '--', icon: TrendingDown, red: userStats && userStats.maxDrawdown > 0 },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <span className={`text-2xl font-semibold tabular-nums ${stat.green ? 'text-green' : ''} ${stat.red ? 'text-red' : ''}`}>
                {stat.value}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* LLM Leaderboard */}
      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('aiStats.leaderboard')}</CardTitle>
          </div>
        </CardHeader>
        {stats.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('aiStats.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2 w-12">#</TableHead>
                <TableHead className="px-6 py-2">{t('aiStats.model')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.predictions')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.correct')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.accuracy')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.avgConfidence')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.calibrationError')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiStats.pnl')}</TableHead>
                <TableHead className="px-6 py-2 text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((row, i) => (
                <TableRow key={row.provider}>
                  <TableCell className="px-6 py-3 font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="px-6 py-3 font-medium capitalize">{row.provider}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{row.totalPredictions}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{row.correctPredictions}</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(row.accuracy * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{(row.averageConfidence * 100).toFixed(0)}%</TableCell>
                  <TableCell className="px-6 py-3 text-right tabular-nums">{row.calibrationError.toFixed(2)}</TableCell>
                  <TableCell className={`px-6 py-3 text-right tabular-nums ${row.profitLoss >= 0 ? 'text-green' : 'text-red'}`}>
                    {row.profitLoss >= 0 ? '+' : ''}${row.profitLoss.toFixed(2)}
                  </TableCell>
                  <TableCell className={`px-6 py-3 text-right tabular-nums ${row.roi >= 0 ? 'text-green' : 'text-red'}`}>
                    {row.roi >= 0 ? '+' : ''}{(row.roi * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Calibration + History */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">{t('aiStats.calibrationCurve')}</CardTitle>
            </div>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                fetchCalibration(e.target.value);
              }}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              {['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan', 'user'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <CalibrationChart data={calibrationData} providerName={selectedProvider} />
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('aiStats.recentBets')}</CardTitle>
          </div>
          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('aiStats.noBets')}</div>
          ) : (
            <div className="space-y-2">
              {history.map((bet) => (
                <div key={bet.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{bet.matchId}</span>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">{bet.provider}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`tabular-nums ${
                        bet.result === 'won' ? 'text-green' : bet.result === 'lost' ? 'text-red' : 'text-muted-foreground'
                      }`}>
                        {bet.result === 'pending' ? '--' : `${bet.profitLoss >= 0 ? '+' : ''}$${bet.profitLoss.toFixed(2)}`}
                      </span>
                      {bet.result === 'pending' && (
                        settlingBetId === bet.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleSettle(bet.id, 'won')}>{t('aiStats.won')}</Button>
                            <Button size="sm" variant="outline" onClick={() => handleSettle(bet.id, 'lost')}>{t('aiStats.lost')}</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setSettlingBetId(bet.id)}>{t('aiStats.settle')}</Button>
                        )
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleDelete(bet.id)}>{t('aiStats.delete')}</Button>
                    </div>
                  </div>
                  {bet.reasoning && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">{t('aiStats.reasoning')}: </span>
                      {bet.reasoning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </DataState>
    </div>
  );
}
