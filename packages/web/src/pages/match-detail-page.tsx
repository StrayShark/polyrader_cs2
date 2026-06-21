import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { TrendingUp, Brain, BarChart3, Users, AlertTriangle, Loader2, DollarSign, Check, X } from 'lucide-react';
import { api, getBase } from '../utils/api';
import { streamAnalysis } from '../utils/sse';
import { PriceChart } from '../components/PriceChart';
import { OrderBookChart } from '../components/OrderBookChart';
import { FactorRing } from '../components/FactorRing';
import { LLMConsensusGauge } from '../components/LLMConsensusGauge';
import { PriceFlash } from '../components/PriceFlash';
import { MatchDetailSkeleton } from '../components/Skeletons';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Badge, Button, Input } from '@/components/ui';
import type { LLMAggregation, LLMAnalysisResult, MatchInfo } from '@polyrader/core';

export function MatchDetailPage() {
  const { slug } = useParams();
  const { subscribe } = useWebSocket();
  const { t } = useI18n();
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [aggregation, setAggregation] = useState<LLMAggregation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [streamingResults, setStreamingResults] = useState<Array<{ provider: string; probability: number; confidence: number; reasoning: string }>>([]);
  const [decision, setDecision] = useState<'team_a' | 'team_b' | 'skip' | null>(null);
  const [betAmount, setBetAmount] = useState(100);
  const [priceData, setPriceData] = useState<Array<{ time: string; value: number }>>([]);
  const [orderBookData, setOrderBookData] = useState<{ bids: Array<{ price: number; size: number; side: 'bid' }>; asks: Array<{ price: number; size: number; side: 'ask' }> }>({ bids: [], asks: [] });

  // Fetch match data
  useEffect(() => {
    if (!slug) return;
    setMatchLoading(true);
    api.get<{ data: MatchInfo }>(`/esports/matches/${slug}`)
      .then(({ data }) => setMatch(data))
      .catch(() => setMatch(null))
      .finally(() => setMatchLoading(false));
  }, [slug]);

  // Fetch price data
  useEffect(() => {
    if (!slug) return;
    api.get<{ data: Array<{ timestamp: string; price: number }> }>(`/markets/${slug}/prices?interval=1h`)
      .then(({ data }) => {
        setPriceData(data.map((p) => ({ time: p.timestamp, value: p.price })));
      })
      .catch(() => {});
  }, [slug]);

  // Fetch order book data (poll every 10s)
  useEffect(() => {
    if (!slug) return;
    const fetchOrderBook = () => {
      api.get<{ data: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } }>(`/markets/${slug}/orderbook`)
        .then(({ data }) => {
          setOrderBookData({
            bids: data.bids.map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size), side: 'bid' as const })),
            asks: data.asks.map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size), side: 'ask' as const })),
          });
        })
        .catch(() => {});
    };
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 10000);
    return () => clearInterval(interval);
  }, [slug]);

  // Real-time: update analysis when auto-analysis broadcast arrives
  useEffect(() => {
    if (!slug) return;
    return subscribe('analysis', (data) => {
      const payload = data as { matchId?: string; aggregation?: LLMAggregation };
      if (payload.matchId === slug && payload.aggregation) {
        setAggregation(payload.aggregation);
      }
    });
  }, [subscribe, slug]);

  const triggerAnalysis = async () => {
    if (!slug || !match) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setStreamingResults([]);
    try {
      const base = await getBase();
      await streamAnalysis(
        `${base}/ai/analyze/stream`,
        { matchId: slug, teamAId: match.teamA.teamId, teamBId: match.teamB.teamId },
        {
          onProgress: (result) => {
            setStreamingResults((prev) => [...prev, result]);
          },
          onComplete: (data) => {
            const payload = data as { aggregation: LLMAggregation };
            if (payload.aggregation) {
              setAggregation(payload.aggregation);
            }
          },
          onError: (message) => {
            setAnalysisError(message);
          },
        },
      );
    } catch (err) {
      setAnalysisError((err as Error).message);
    }
    setIsAnalyzing(false);
  };

  const confirmBet = async (team: 'team_a' | 'team_b') => {
    setDecision(team);
    try {
      await api.post('/ai/stats/bet', {
        matchId: slug,
        team: team === 'team_a' ? match?.teamA.name ?? 'Team A' : match?.teamB.name ?? 'Team B',
        amount: betAmount,
        odds: 1 / (team === 'team_a' ? (aggregation?.aggregatedProbability?.teamA ?? 0.5) : (aggregation?.aggregatedProbability?.teamB ?? 0.5)),
        // Pass 'user' as provider for manual bets — the backend defaults to 'user' if omitted
        provider: 'user',
      });
    } catch {}
  };

  const results = isAnalyzing ? streamingResults : (aggregation?.results ?? []);
  const consensus = aggregation?.consensus;
  const kelly = aggregation?.kellyAllocation;
  const aggregatedProb = aggregation?.aggregatedProbability;
  const lineups = match?.lineups;

  const consensusLabels: Record<string, string> = {
    strong: t('match.strongConsensus'),
    moderate: t('match.mediumConsensus'),
    weak: t('match.weakConsensus'),
    divergent: t('match.disagreement'),
  };

  if (matchLoading) {
    return <MatchDetailSkeleton />;
  }

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">{t('match.notFound')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('match.waitForHltv')}</p>
      </div>
    );
  }

  const teamAPlayers = lineups?.teamA?.players ?? [];
  const teamBPlayers = lineups?.teamB?.players ?? [];
  const hasLineups = teamAPlayers.length > 0 || teamBPlayers.length > 0;
  const teamAHasStandin = lineups?.teamA?.hasStandin ?? false;
  const teamBHasStandin = lineups?.teamB?.hasStandin ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('match.analysis')}</h1>
          <p className="text-sm text-muted-foreground">{match.eventName} · {match.format}</p>
        </div>
        <Button
          onClick={triggerAnalysis}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t('match.analyzing')}</>
          ) : (
            <><Brain className="h-4 w-4" /> {t('match.triggerAnalysis')}</>
          )}
        </Button>
      </div>

      {analysisError && (
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">{analysisError}</div>
      )}

      {/* Match Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="text-lg font-semibold">{match.teamA.name}</div>
            <div className="text-xs text-muted-foreground">{match.eventType === 'LAN' ? 'LAN' : 'Online'}</div>
          </div>
          <div className="text-center px-4">
            <div className="text-sm text-muted-foreground">{match.eventName}</div>
            <div className="mt-1 text-xs text-muted-foreground">{match.format}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-green">VS</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {match.scheduledAt ? new Date(match.scheduledAt).toLocaleDateString() : 'TBD'}
            </div>
          </div>
          <div className="text-center flex-1">
            <div className="text-lg font-semibold">{match.teamB.name}</div>
            <div className="text-xs text-muted-foreground">{match.maps ? `${match.maps.length} maps` : ''}</div>
          </div>
        </div>

        {/* Win Rate Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <PriceFlash
              value={aggregatedProb ? aggregatedProb.teamA : 0}
              format={(v) => aggregatedProb ? `${(v * 100).toFixed(1)}%` : '--'}
            />
            <span className="text-muted-foreground">{t('match.aggregateProbability')}</span>
            <PriceFlash
              value={aggregatedProb ? aggregatedProb.teamB : 0}
              format={(v) => aggregatedProb ? `${(v * 100).toFixed(1)}%` : '--'}
            />
          </div>
          <div className="mt-2 flex h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-l-full bg-primary transition-all duration-500"
              style={{ width: `${aggregatedProb ? aggregatedProb.teamA * 100 : 50}%` }}
            />
            <div
              className="h-full rounded-r-full bg-orange transition-all duration-500"
              style={{ width: `${aggregatedProb ? aggregatedProb.teamB * 100 : 50}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Lineup Comparison */}
      <Card className="p-4">
        <CardHeader className="flex-row items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('match.lineupComparison')}</CardTitle>
          {hasLineups ? (
            <Badge variant="green" className="ml-auto text-[10px]">{t('match.lineupConfirmed')}</Badge>
          ) : (
            <Badge variant="secondary" className="ml-auto text-[10px]">{t('match.lineupPending')}</Badge>
          )}
        </CardHeader>

        {hasLineups ? (
          <div className="grid grid-cols-2 gap-6">
            {[
              { players: teamAPlayers, name: match.teamA.name, hasStandin: teamAHasStandin },
              { players: teamBPlayers, name: match.teamB.name, hasStandin: teamBHasStandin },
            ].map(({ players, name, hasStandin }) => {
              const avgRating = players.length > 0
                ? players.reduce((s, p) => s + p.rating, 0) / players.length
                : 0;
              const avgImpact = players.length > 0
                ? players.reduce((s, p) => s + p.impactScore, 0) / players.length
                : 0;
              return (
                <div key={name}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('match.lineup', { name })}</span>
                    {hasStandin && <Badge variant="red" className="text-[9px]">{t('match.withSubstitute')}</Badge>}
                  </div>
                  <div className="space-y-1.5">
                    {players.map((p) => (
                      <div key={p.playerId} className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs ${p.isStandin ? 'bg-red/10 border border-red/20' : 'bg-muted/50'}`}>
                        <span className="w-20 font-medium truncate">{p.nickname}</span>
                        <span className="w-14 text-muted-foreground">{p.role}</span>
                        <span className={`tabular-nums ${p.isStandin ? 'text-red' : 'text-green'}`}>{p.rating.toFixed(2)}</span>
                        {p.isStandin && <Badge variant="red" className="text-[9px]">{t('match.substitute')}</Badge>}
                        <div className="ml-auto flex items-center gap-1">
                          <div className="h-1 w-12 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${p.impactScore}%` }} />
                          </div>
                          <span className="w-6 text-right tabular-nums text-muted-foreground">{p.impactScore}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>{t('match.avgRating')} <span className="text-foreground font-medium">{avgRating.toFixed(2)}</span></span>
                    <span>{t('match.impact')} <span className="text-foreground font-medium">{Math.round(avgImpact)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('match.lineupEmpty')}
          </div>
        )}

        {hasLineups && (teamAHasStandin || teamBHasStandin) && (
          <div className="mt-4 rounded-md bg-muted p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-yellow" />
              <div className="text-xs text-muted-foreground">
                {teamAHasStandin && t('match.substituteWarning', { name: match.teamA.name })}
                {teamBHasStandin && t('match.substituteWarning', { name: match.teamB.name })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Analysis Sections */}
      <div className="grid grid-cols-2 gap-4">
        {/* 6-Factor Breakdown */}
        <Card className="p-4">
          <CardHeader className="flex-row items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('match.factorBreakdown')}</CardTitle>
          </CardHeader>
          {aggregatedProb ? (
            <>
              <div className="flex justify-center mb-4">
                <FactorRing
                  factors={[
                    { label: 'HLTV', value: aggregatedProb.teamA, color: '#3B82F6' },
                    { label: t('match.factor.form'), value: aggregatedProb.teamA, color: '#8B5CF6' },
                    { label: t('match.factor.lineup'), value: aggregatedProb.teamA, color: '#10B981' },
                    { label: t('match.factor.map'), value: aggregatedProb.teamA, color: '#F97316' },
                    { label: t('match.factor.h2h'), value: 0.5, color: '#EAB308' },
                    { label: t('match.factor.momentum'), value: aggregatedProb.teamA, color: '#EF4444' },
                  ]}
                  size={140}
                />
              </div>
              {[
                { name: t('match.factor.hltvRank'), teamA: aggregatedProb.teamA * 75 + 12.5, teamB: aggregatedProb.teamB * 75 + 12.5, weight: 20 },
                { name: t('match.factor.recentForm'), teamA: aggregatedProb.teamA * 60 + 20, teamB: aggregatedProb.teamB * 60 + 20, weight: 15 },
                { name: t('match.factor.lineupStrength'), teamA: aggregatedProb.teamA * 70 + 15, teamB: aggregatedProb.teamB * 70 + 15, weight: 20 },
                { name: t('match.factor.mapPool'), teamA: aggregatedProb.teamA * 50 + 25, teamB: aggregatedProb.teamB * 50 + 25, weight: 15 },
                { name: t('match.factor.h2hRecord'), teamA: 50, teamB: 50, weight: 10 },
                { name: t('match.factor.marketSentiment'), teamA: aggregatedProb.teamA * 100, teamB: aggregatedProb.teamB * 100, weight: 20 },
              ].map((factor) => (
                <div key={factor.name} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{factor.name}</span>
                    <span className="text-muted-foreground">{t('match.weight', { weight: factor.weight })}</span>
                  </div>
                  <div className="flex h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-l-full bg-primary" style={{ width: `${factor.teamA}%` }} />
                    <div className="h-full rounded-r-full bg-orange" style={{ width: `${factor.teamB}%` }} />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('match.factorEmpty')}
            </div>
          )}
        </Card>

        {/* LLM Consensus */}
        <Card className="p-4">
          <CardHeader className="flex-row items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('match.llmConsensus')}</CardTitle>
            {consensus && (
              <Badge
                variant={consensus.level === 'strong' ? 'green' : consensus.level === 'moderate' ? 'yellow' : consensus.level === 'weak' ? 'orange' : 'red'}
                className="ml-auto text-[10px]"
              >
                {consensusLabels[consensus.level]}
              </Badge>
            )}
          </CardHeader>

          {(aggregation?.results ?? []).length > 0 && !isAnalyzing && (
            <div className="flex justify-center mb-4">
              <LLMConsensusGauge
                consensus={(aggregation?.results ?? []).filter(r => !r.error).map(r => ({
                  provider: r.provider,
                  model: r.model,
                  teamAProb: r.winProbability.teamA,
                  confidence: r.confidence,
                }))}
                teamAName={match?.teamA.name ?? 'Team A'}
                teamBName={match?.teamB.name ?? 'Team B'}
              />
            </div>
          )}

          {results.length === 0 && !isAnalyzing && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('match.llmEmpty')}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r) => {
                const isStream = isAnalyzing && !('winProbability' in r);
                const teamAProb = isStream
                  ? (r as { probability: number }).probability
                  : (r as LLMAnalysisResult).winProbability.teamA;
                const teamBProb = isStream
                  ? 1 - (r as { probability: number }).probability
                  : (r as LLMAnalysisResult).winProbability.teamB;
                return (
                  <div key={r.provider} className="rounded-md border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium capitalize">{r.provider}</span>
                        {!isStream && (
                          <span className="text-[10px] text-muted-foreground">{(r as LLMAnalysisResult).model}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {'error' in r && r.error ? (
                          <span className="text-red">{r.error}</span>
                        ) : (
                          <>
                            <span>{(r.confidence * 100).toFixed(0)}{t('match.confidence')}</span>
                            {!isStream && <span>{(r as LLMAnalysisResult).latency}ms</span>}
                          </>
                        )}
                      </div>
                    </div>
                    {!('error' in r && r.error) && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{match?.teamA.name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex">
                            <div className="h-full bg-primary" style={{ width: `${teamAProb * 100}%` }} />
                            <div className="h-full bg-orange" style={{ width: `${teamBProb * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{match?.teamB.name}</span>
                        </div>
                        {r.reasoning && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">{r.reasoning}</p>
                        )}
                        {!isStream && (r as LLMAnalysisResult).keyFactors && (r as LLMAnalysisResult).keyFactors.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(r as LLMAnalysisResult).keyFactors.map((f, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {consensus && (
            <div className="mt-4 rounded-md bg-muted p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">
                  {t('match.consensus')} {consensusLabels[consensus.level]} ({consensus.agreementRate * 100}% {t('match.consensusLabel')})
                </div>
                <span className="text-[10px] text-muted-foreground">
                  σ={consensus.stdDev.toFixed(3)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {(aggregation?.results ?? []).filter((r) => !r.error).length}/{(aggregation?.results ?? []).length} {t('match.modelRecommendation')}{' '}
                {consensus.majorityPick === 'team_a' ? match?.teamA.name ?? 'Team A' : consensus.majorityPick === 'team_b' ? match?.teamB.name ?? 'Team B' : t('match.draw')}
              </div>
            </div>
          )}
      </Card>
      </div>

      {/* Kelly Allocation + Decision */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kelly Allocation */}
        <Card className="p-4">
          <CardHeader className="flex-row items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('match.kellyAllocation')}</CardTitle>
          </CardHeader>
          {kelly && kelly.recommendedBet !== 'skip' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span>{t('match.kellyRatio')}</span>
                <span className="font-medium tabular-nums">{(kelly.kellyFraction * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>{t('match.capitalRatio')}</span>
                <span className="font-medium tabular-nums">{kelly.bankrollFraction.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>{t('match.allocate', { name: match.teamA.name })}</span>
                <span className="font-medium tabular-nums text-primary">{(kelly.teamAAllocation * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>{t('match.allocate', { name: match.teamB.name })}</span>
                <span className="font-medium tabular-nums text-orange">{(kelly.teamBAllocation * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: `${kelly.teamAAllocation * 100}%` }} />
                <div className="h-full bg-orange" style={{ width: `${kelly.teamBAllocation * 100}%` }} />
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {isAnalyzing ? t('match.analyzing') : t('match.analyzingOrNoConsensus')}
            </div>
          )}
        </Card>

        {/* Price Chart */}
        <Card className="p-4">
          <CardHeader className="flex-row items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('match.priceTrend')}</CardTitle>
          </CardHeader>
          {priceData.length > 0 ? (
            <PriceChart data={priceData} height={180} />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t('match.noPriceData')}
            </div>
          )}
        </Card>

        {/* Order Book */}
        <Card className="p-4">
          <CardTitle className="text-sm mb-4">{t('match.orderBookDepth')}</CardTitle>
          {orderBookData.bids.length > 0 || orderBookData.asks.length > 0 ? (
            <OrderBookChart bids={orderBookData.bids} asks={orderBookData.asks} height={180} />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {t('match.noOrderBookData')}
            </div>
          )}
        </Card>
      </div>

      {/* User Decision */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{t('match.yourDecision')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t('match.decisionHint')}</p>
          </div>

          {decision ? (
            <div className="flex items-center gap-3">
              <Badge variant="green" className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
                <Check className="h-4 w-4" />
                {t('match.betConfirmed')} {decision === 'team_a' ? match.teamA.name : match.teamB.name}
              </Badge>
              <span className="text-xs text-muted-foreground">${betAmount}</span>
              <Button variant="outline" size="sm" onClick={() => setDecision(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">{t('common.amount')}</label>
                <Input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="w-20 text-xs"
                  min={10}
                  max={1000}
                />
              </div>
              <Button onClick={() => confirmBet('team_a')} disabled={!aggregation || isAnalyzing}>
                {t('match.bet', { name: match.teamA.name })}
              </Button>
              <Button variant="outline" onClick={() => confirmBet('team_b')} disabled={!aggregation || isAnalyzing}>
                {t('match.bet', { name: match.teamB.name })}
              </Button>
              <Button variant="ghost" onClick={() => setDecision('skip')}>
                {t('match.skip')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
