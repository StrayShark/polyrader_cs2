import { useEffect, useState } from 'react';
import { Wallet, Target, TrendingUp, AlertTriangle, Sparkles, Calculator, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAllocationStore } from '../stores/allocation-store';
import { useI18n } from '../hooks/use-i18n';
import { DataState } from '../components/DataState';
import { DecisionJournalForm } from '../components/DecisionJournalForm';
import { StatsSkeleton } from '../components/Skeletons';
import {
  Card, CardHeader, CardTitle, Badge, Button, Input,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Progress,
} from '@/components/ui';
import type { AllocationOpportunity, RiskTolerance } from '@polyrader/core';

export function AllocationPage() {
  const { t } = useI18n();
  const {
    config, bankrollState, latestPlan, history,
    isLoading, isGenerating, error,
    fetchBankroll, updateBankroll, createAllocation, fetchLatestPlan, fetchHistory,
  } = useAllocationStore();

  // Config editing state
  const [editMode, setEditMode] = useState(false);
  const [editCapital, setEditCapital] = useState('10000');
  const [editReturnRate, setEditReturnRate] = useState('15');
  const [editRisk, setEditRisk] = useState<RiskTolerance>('balanced');

  // Opportunity input state
  const [opportunities, setOpportunities] = useState<AllocationOpportunity[]>([]);
  const [useLLM, setUseLLM] = useState(false);

  // New opportunity form
  const [newOpp, setNewOpp] = useState({
    matchId: '',
    matchLabel: '',
    team: '',
    winProbability: '',
    odds: '',
    kellyFraction: '',
    confidence: '',
  });

  useEffect(() => {
    fetchBankroll();
    fetchLatestPlan();
    fetchHistory();
  }, [fetchBankroll, fetchLatestPlan, fetchHistory]);

  useEffect(() => {
    if (config) {
      setEditCapital(String(config.totalCapital));
      setEditReturnRate(String((config.targetReturnRate * 100).toFixed(1)));
      setEditRisk(config.riskTolerance);
    }
  }, [config]);

  const handleSaveConfig = () => {
    updateBankroll({
      totalCapital: parseFloat(editCapital) || 0,
      targetReturnRate: (parseFloat(editReturnRate) || 0) / 100,
      riskTolerance: editRisk,
    });
    setEditMode(false);
  };

  const handleAddOpportunity = () => {
    if (!newOpp.matchId || !newOpp.team || !newOpp.winProbability || !newOpp.odds) return;
    const winProb = parseFloat(newOpp.winProbability) / 100;
    const odds = parseFloat(newOpp.odds);
    const kelly = newOpp.kellyFraction ? parseFloat(newOpp.kellyFraction) / 100 : Math.max(0, winProb - (1 - winProb) / (odds - 1));
    const confidence = newOpp.confidence ? parseFloat(newOpp.confidence) / 100 : 0.5;
    const ev = winProb * (odds - 1) - (1 - winProb);

    setOpportunities([...opportunities, {
      matchId: newOpp.matchId,
      matchLabel: newOpp.matchLabel || newOpp.matchId,
      team: newOpp.team,
      winProbability: winProb,
      odds,
      kellyFraction: kelly,
      consensusLevel: 'moderate',
      confidence,
      expectedValue: ev,
    }]);
    setNewOpp({ matchId: '', matchLabel: '', team: '', winProbability: '', odds: '', kellyFraction: '', confidence: '' });
  };

  const handleRemoveOpportunity = (index: number) => {
    setOpportunities(opportunities.filter((_, i) => i !== index));
  };

  const handleGenerate = () => {
    if (opportunities.length === 0) return;
    createAllocation(opportunities, useLLM);
  };

  const riskColor = (risk: number) => {
    if (risk < 0.3) return 'text-green';
    if (risk < 0.5) return 'text-yellow-500';
    return 'text-red';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('allocation.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('allocation.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchBankroll(); fetchLatestPlan(); }} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <DataState
        isLoading={isLoading && !bankrollState}
        error={error}
        isEmpty={!isLoading && !bankrollState}
        onRetry={() => fetchBankroll()}
        skeleton={<StatsSkeleton count={4} />}
      >
        {/* Bankroll Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('allocation.totalCapital'), value: bankrollState ? `$${bankrollState.totalCapital.toFixed(2)}` : '--', icon: Wallet },
            { label: t('allocation.availableCapital'), value: bankrollState ? `$${bankrollState.availableCapital.toFixed(2)}` : '--', icon: Target, green: true },
            { label: t('allocation.realizedPnl'), value: bankrollState ? `${bankrollState.realizedPnL >= 0 ? '+' : ''}$${bankrollState.realizedPnL.toFixed(2)}` : '--', icon: TrendingUp, green: bankrollState && bankrollState.realizedPnL >= 0 },
            { label: t('allocation.targetProfit'), value: bankrollState ? `$${bankrollState.targetProfit.toFixed(2)}` : '--', icon: Sparkles },
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

        {/* Bankroll Config */}
        <Card>
          <CardHeader className="border-b px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('allocation.configTitle')}</CardTitle>
              </div>
              {!editMode ? (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>{t('allocation.edit')}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>{t('common.cancel')}</Button>
                  <Button size="sm" onClick={handleSaveConfig}>{t('common.save')}</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <div className="p-6">
            {!editMode ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t('allocation.totalCapital')}</span>
                  <p className="text-lg font-medium tabular-nums">${config?.totalCapital.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t('allocation.targetReturnRate')}</span>
                  <p className="text-lg font-medium tabular-nums">{((config?.targetReturnRate ?? 0) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t('allocation.riskTolerance')}</span>
                  <p className="text-lg font-medium">{t(`allocation.risk.${config?.riskTolerance ?? 'balanced'}`)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t('allocation.usedCapital')}</span>
                  <p className="text-lg font-medium tabular-nums">${bankrollState?.usedCapital.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">{t('allocation.totalCapital')}</label>
                  <Input type="number" value={editCapital} onChange={(e) => setEditCapital(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('allocation.targetReturnRate')} (%)</label>
                  <Input type="number" value={editReturnRate} onChange={(e) => setEditReturnRate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('allocation.riskTolerance')}</label>
                  <select
                    value={editRisk}
                    onChange={(e) => setEditRisk(e.target.value as RiskTolerance)}
                    className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  >
                    <option value="conservative">{t('allocation.risk.conservative')}</option>
                    <option value="balanced">{t('allocation.risk.balanced')}</option>
                    <option value="aggressive">{t('allocation.risk.aggressive')}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Opportunity Input + Allocation Generation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Opportunities */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('allocation.opportunities')}</CardTitle>
              </div>
              <Badge variant="secondary">{opportunities.length}</Badge>
            </div>

            {/* Add form */}
            <div className="space-y-2 mb-4 rounded-md bg-muted/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder={t('allocation.matchId')} value={newOpp.matchId} onChange={(e) => setNewOpp({ ...newOpp, matchId: e.target.value })} className="text-xs" />
                <Input placeholder={t('allocation.team')} value={newOpp.team} onChange={(e) => setNewOpp({ ...newOpp, team: e.target.value })} className="text-xs" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder={t('allocation.winProb') + ' %'} type="number" value={newOpp.winProbability} onChange={(e) => setNewOpp({ ...newOpp, winProbability: e.target.value })} className="text-xs" />
                <Input placeholder={t('allocation.odds')} type="number" value={newOpp.odds} onChange={(e) => setNewOpp({ ...newOpp, odds: e.target.value })} className="text-xs" />
                <Input placeholder={t('allocation.confidence') + ' %'} type="number" value={newOpp.confidence} onChange={(e) => setNewOpp({ ...newOpp, confidence: e.target.value })} className="text-xs" />
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={handleAddOpportunity} disabled={!newOpp.matchId || !newOpp.team || !newOpp.winProbability || !newOpp.odds}>
                <Plus className="h-3 w-3 mr-1" /> {t('allocation.add')}
              </Button>
            </div>

            {/* List */}
            {opportunities.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('allocation.noOpportunities')}</div>
            ) : (
              <div className="space-y-1">
                {opportunities.map((o, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">{o.matchLabel}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{o.team}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                      <span>{(o.winProbability * 100).toFixed(0)}%</span>
                      <span>{o.odds.toFixed(2)}</span>
                      <span className={o.expectedValue >= 0 ? 'text-green' : 'text-red'}>EV {(o.expectedValue * 100).toFixed(1)}%</span>
                      <button onClick={() => handleRemoveOpportunity(i)} className="text-red hover:text-red/80">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generate button */}
            <div className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} className="rounded" />
                <Sparkles className="h-3.5 w-3.5" />
                {t('allocation.useLLM')}
              </label>
              <Button className="flex-1" onClick={handleGenerate} disabled={opportunities.length === 0 || isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                {t('allocation.generate')}
              </Button>
            </div>
          </Card>

          {/* Allocation Plan Result */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">{t('allocation.planResult')}</CardTitle>
              {latestPlan && (
                <Badge variant="secondary" className="ml-auto">
                  {latestPlan.source === 'llm' ? <Sparkles className="h-3 w-3 mr-1" /> : <Calculator className="h-3 w-3 mr-1" />}
                  {latestPlan.source === 'llm' ? 'AI' : t('allocation.algorithmic')}
                </Badge>
              )}
            </div>

            {!latestPlan ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('allocation.noPlan')}</div>
            ) : latestPlan.allocations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{latestPlan.reasoning}</div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="text-xs text-muted-foreground">{t('allocation.totalAllocated')}</span>
                    <p className="text-lg font-semibold tabular-nums">${latestPlan.totalAllocated.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="text-xs text-muted-foreground">{t('allocation.expectedReturn')}</span>
                    <p className="text-lg font-semibold tabular-nums text-green">+${latestPlan.expectedReturn.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="text-xs text-muted-foreground">{t('allocation.expectedROI')}</span>
                    <p className="text-lg font-semibold tabular-nums">{(latestPlan.expectedROI * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <span className="text-xs text-muted-foreground">{t('allocation.portfolioRisk')}</span>
                    <p className={`text-lg font-semibold tabular-nums ${riskColor(latestPlan.portfolioRisk)}`}>
                      {(latestPlan.portfolioRisk * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Allocation table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-3 py-2">{t('allocation.match')}</TableHead>
                      <TableHead className="px-3 py-2 text-right">{t('allocation.amount')}</TableHead>
                      <TableHead className="px-3 py-2 text-right">{t('allocation.fraction')}</TableHead>
                      <TableHead className="px-3 py-2 text-right">{t('allocation.expRet')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestPlan.allocations.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-3 py-2">
                          <div className="font-medium text-sm">{a.matchLabel}</div>
                          <div className="text-xs text-muted-foreground">{a.team}</div>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right tabular-nums font-medium">${a.amount.toFixed(2)}</TableCell>
                        <TableCell className="px-3 py-2 text-right tabular-nums">{(a.fraction * 100).toFixed(1)}%</TableCell>
                        <TableCell className="px-3 py-2 text-right tabular-nums text-green">+${a.expectedReturn.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Capital usage bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{t('allocation.capitalUsage')}</span>
                    <span>${latestPlan.totalAllocated.toFixed(0)} / ${(latestPlan.totalAllocated + latestPlan.remainingCapital).toFixed(0)}</span>
                  </div>
                  <Progress value={latestPlan.totalAllocated + latestPlan.remainingCapital > 0 ? (latestPlan.totalAllocated / (latestPlan.totalAllocated + latestPlan.remainingCapital)) * 100 : 0} />
                </div>

                {/* Reasoning */}
                {latestPlan.reasoning && (
                  <div className="mt-4 rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
                    {latestPlan.reasoning}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="border-b px-6 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('allocation.history')}</CardTitle>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-2">{t('allocation.time')}</TableHead>
                  <TableHead className="px-6 py-2">{t('allocation.source')}</TableHead>
                  <TableHead className="px-6 py-2 text-right">{t('allocation.bets')}</TableHead>
                  <TableHead className="px-6 py-2 text-right">{t('allocation.totalAllocated')}</TableHead>
                  <TableHead className="px-6 py-2 text-right">{t('allocation.expectedROI')}</TableHead>
                  <TableHead className="px-6 py-2 text-right">{t('allocation.portfolioRisk')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.slice(0, 10).map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-6 py-2 text-xs text-muted-foreground">{p.generatedAt.split('T')[0]}</TableCell>
                    <TableCell className="px-6 py-2">
                      <Badge variant="secondary">{p.source === 'llm' ? 'AI' : t('allocation.algorithmic')}</Badge>
                    </TableCell>
                    <TableCell className="px-6 py-2 text-right tabular-nums">{p.allocations.length}</TableCell>
                    <TableCell className="px-6 py-2 text-right tabular-nums">${p.totalAllocated.toFixed(2)}</TableCell>
                    <TableCell className="px-6 py-2 text-right tabular-nums">{(p.expectedROI * 100).toFixed(1)}%</TableCell>
                    <TableCell className={`px-6 py-2 text-right tabular-nums ${riskColor(p.portfolioRisk)}`}>{(p.portfolioRisk * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </DataState>

      <DecisionJournalForm />
    </div>
  );
}
