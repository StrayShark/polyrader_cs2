import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Target, Brain, DollarSign, RefreshCw, BarChart3 } from 'lucide-react';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { CalibrationChart } from '../components/CalibrationChart';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from '@/components/ui';
import type { CalibrationPoint, SimulatedBet } from '@polyrader/core';

interface ProviderAnalysis {
  provider: string;
  totalAnalyses: number;
  settledBets: SimulatedBet[];
  accuracy: number;
  avgConfidence: number;
  calibration: CalibrationPoint[];
  equityCurve: Array<{ date: string; equity: number }>;
  byTeam: Array<{ team: string; total: number; won: number; accuracy: number }>;
  byTier: Array<{ tier: string; total: number; won: number; accuracy: number }>;
  byDirection: Array<{ direction: string; total: number; won: number; accuracy: number }>;
  recentAnalyses: Array<Record<string, unknown>>;
}

export function LlmAnalysisPage() {
  const { providerId = '' } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [analysis, setAnalysis] = useState<ProviderAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: ProviderAnalysis }>(`/ai/stats/provider/${providerId}`);
      setAnalysis(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAnalysis();
  }, [providerId]);

  const equityCurve = analysis?.equityCurve ?? [];
  const maxEquity = equityCurve.length > 0 ? Math.max(...equityCurve.map((e) => e.equity)) : 0;
  const minEquity = equityCurve.length > 0 ? Math.min(...equityCurve.map((e) => e.equity), 0) : 0;
  const equityRange = Math.max(maxEquity - minEquity, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/ai/stats')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight capitalize flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              {providerId}
            </h1>
            <p className="text-sm text-muted-foreground">{t('llmAnalysis.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalysis} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && !analysis}
        onRetry={fetchAnalysis}
        skeleton={<div className="h-64 animate-pulse rounded-lg bg-muted" />}
      >
        {analysis && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('llmAnalysis.totalAnalyses'), value: String(analysis.totalAnalyses), icon: Target },
                { label: t('llmAnalysis.settledBets'), value: String(analysis.settledBets.length), icon: BarChart3 },
                { label: t('llmAnalysis.accuracy'), value: `${analysis.accuracy.toFixed(1)}%`, icon: TrendingUp, green: analysis.accuracy >= 60 },
                { label: t('llmAnalysis.avgConfidence'), value: `${analysis.avgConfidence.toFixed(1)}%`, icon: Brain },
              ].map((stat) => (
                <Card key={stat.label} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2">
                    <span className={`text-2xl font-semibold tabular-nums ${stat.green ? 'text-green' : ''}`}>
                      {stat.value}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            {/* Equity Curve + Calibration */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('llmAnalysis.equityCurve')}</CardTitle>
                </div>
                {equityCurve.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">{t('llmAnalysis.noData')}</div>
                ) : (
                  <div>
                    <svg viewBox={`0 0 400 150`} className="w-full" style={{ height: 150 }}>
                      <line x1="0" y1={150 - ((0 - minEquity) / equityRange) * 130 - 10} x2="400" y2={150 - ((0 - minEquity) / equityRange) * 130 - 10} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 2" />
                      <polyline
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="2"
                        points={equityCurve.map((p, i) => {
                          const x = (i / Math.max(equityCurve.length - 1, 1)) * 380 + 10;
                          const y = 150 - ((p.equity - minEquity) / equityRange) * 130 - 10;
                          return `${x},${y}`;
                        }).join(' ')}
                      />
                      {equityCurve.length > 0 && (() => {
                        const lastPoint = equityCurve[equityCurve.length - 1];
                        const x = 390;
                        const y = 150 - ((lastPoint.equity - minEquity) / equityRange) * 130 - 10;
                        return <circle cx={x} cy={y} r="3" fill="var(--primary)" />;
                      })()}
                    </svg>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{t('llmAnalysis.cumulative')}: ${equityCurve[equityCurve.length - 1]?.equity.toFixed(2) ?? '0.00'}</span>
                      <span>{t('llmAnalysis.peak')}: ${maxEquity.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('llmAnalysis.calibrationCurve')}</CardTitle>
                </div>
                <CalibrationChart data={analysis.calibration} providerName={providerId} />
              </Card>
            </div>

            {/* By Team */}
            <Card>
              <CardHeader className="border-b px-6 py-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('llmAnalysis.byTeam')}</CardTitle>
                </div>
              </CardHeader>
              {analysis.byTeam.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">{t('llmAnalysis.noData')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 py-2">{t('llmAnalysis.team')}</TableHead>
                      <TableHead className="px-6 py-2 text-right">{t('llmAnalysis.totalAnalyses')}</TableHead>
                      <TableHead className="px-6 py-2 text-right">{t('aiStats.correct')}</TableHead>
                      <TableHead className="px-6 py-2 text-right">{t('aiStats.accuracy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.byTeam.map((row) => (
                      <TableRow key={row.team}>
                        <TableCell className="px-6 py-3 font-medium">{row.team}</TableCell>
                        <TableCell className="px-6 py-3 text-right tabular-nums">{row.total}</TableCell>
                        <TableCell className="px-6 py-3 text-right tabular-nums">{row.won}</TableCell>
                        <TableCell className={`px-6 py-3 text-right tabular-nums ${row.accuracy >= 60 ? 'text-green' : row.accuracy < 40 ? 'text-red' : ''}`}>
                          {row.accuracy.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <CardTitle className="text-sm">{t('llmAnalysis.byTier')}</CardTitle>
                </CardHeader>
                {(analysis.byTier ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">{t('llmAnalysis.noData')}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('llmAnalysis.tier')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('llmAnalysis.settledBets')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('aiStats.accuracy')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(analysis.byTier ?? []).map((row) => (
                        <TableRow key={row.tier}>
                          <TableCell className="px-6 py-3 font-medium">{row.tier}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{row.total}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{row.accuracy.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <CardTitle className="text-sm">{t('llmAnalysis.byDirection')}</CardTitle>
                </CardHeader>
                {(analysis.byDirection ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">{t('llmAnalysis.noData')}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-6 py-2">{t('llmAnalysis.direction')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('llmAnalysis.settledBets')}</TableHead>
                        <TableHead className="px-6 py-2 text-right">{t('aiStats.accuracy')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(analysis.byDirection ?? []).map((row) => (
                        <TableRow key={row.direction}>
                          <TableCell className="px-6 py-3 font-medium capitalize">{row.direction}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{row.total}</TableCell>
                          <TableCell className="px-6 py-3 text-right tabular-nums">{row.accuracy.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </div>

            {/* Recent Analyses */}
            <Card>
              <CardHeader className="border-b px-6 py-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('llmAnalysis.recentAnalyses')}</CardTitle>
                </div>
              </CardHeader>
              {analysis.recentAnalyses.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">{t('llmAnalysis.noData')}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {analysis.recentAnalyses.slice(0, 20).map((item, i) => {
                    const matchId = String(item.match_id ?? item.matchId ?? '--');
                    const teamA = String(item.team_a_name ?? item.teamAName ?? '');
                    const teamB = String(item.team_b_name ?? item.teamBName ?? '');
                    const prob = item.team_a_win_probability ?? item.teamAWinProb;
                    const probNum = typeof prob === 'number' ? prob : parseFloat(String(prob ?? '0'));
                    const createdAt = String(item.created_at ?? item.createdAt ?? '');
                    return (
                      <div key={i} className="px-6 py-3 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{teamA} vs {teamB}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{matchId}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="tabular-nums text-muted-foreground">
                            {(probNum * 100).toFixed(0)}% / {(100 - probNum * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {createdAt ? new Date(createdAt).toLocaleDateString() : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </DataState>
    </div>
  );
}
