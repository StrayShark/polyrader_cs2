import { useEffect, useState } from 'react';
import { FlaskConical, TrendingUp, Activity, Rewind } from 'lucide-react';
import { useSimulationStore } from '../stores/simulation-store';
import {
  Card, CardHeader, CardTitle, Button, Input, Badge,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { ProductModeNotice } from '../components/ProductModeNotice';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { LLMProvider, SimulationConfig } from '@polyrader/core';

const ALL_PROVIDERS: LLMProvider[] = ['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq', 'qwen', 'moonshot', 'zhipu', 'doubao', 'minimax', 'hunyuan'];

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10b981', anthropic: '#f59e0b', google: '#3b82f6',
  deepseek: '#8b5cf6', xai: '#ef4444', groq: '#06b6d4',
  qwen: '#8b5cf6', moonshot: '#06b6d4', zhipu: '#f59e0b',
  doubao: '#ef4444', minimax: '#10b981', hunyuan: '#3b82f6',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function SimulationPage() {
  const { t } = useI18n();
  const { config, providerStats, equityCurves, isLoading, error, fetchConfig, updateConfig, fetchProviderStats, fetchEquityCurves, runBacktest, backtestResult } = useSimulationStore();
  const [formData, setFormData] = useState<Partial<SimulationConfig>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchProviderStats();
    fetchEquityCurves();
  }, [fetchConfig, fetchProviderStats, fetchEquityCurves]);

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  const handleSave = async () => {
    const ok = await updateConfig(formData);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchProviderStats();
      fetchEquityCurves();
    }
  };

  const toggleProvider = (provider: LLMProvider) => {
    const current = formData.participatingProviders ?? [];
    const updated = current.includes(provider)
      ? current.filter(p => p !== provider)
      : [...current, provider];
    setFormData({ ...formData, participatingProviders: updated });
  };

  // 合并所有provider的权益曲线数据用于Recharts
  const chartData = (() => {
    const allPoints: Array<Record<string, number | string>> = [];
    const providers = Object.keys(equityCurves);
    if (providers.length === 0) return [];

    // 找到最长的曲线
    const maxLen = Math.max(...providers.map(p => equityCurves[p].length));
    for (let i = 0; i < maxLen; i++) {
      const point: Record<string, number | string> = { idx: i };
      for (const p of providers) {
        const curve = equityCurves[p];
        if (curve[i]) {
          point[p] = curve[i].equity;
        }
      }
      allPoints.push(point);
    }
    return allPoints;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('simulation.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('simulation.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={runBacktest} disabled={isLoading}>
          <Rewind className="mr-2 h-4 w-4" />
          {t('simulation.backtest')}
        </Button>
      </div>

      <ProductModeNotice mode="simulation" />

      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            {t('simulation.config')}
          </CardTitle>
        </CardHeader>
        <div className="space-y-4 p-4 pt-0">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <label className="text-sm font-medium">{t('simulation.enabled')}</label>
              <p className="text-xs text-muted-foreground">{t('simulation.enabledDesc')}</p>
            </div>
            <Toggle
              checked={formData.enabled ?? false}
              onChange={(v) => setFormData({ ...formData, enabled: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.initialCapital')}</label>
              <Input
                type="number"
                value={formData.initialCapital ?? 10000}
                onChange={(e) => setFormData({ ...formData, initialCapital: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.betStrategy')}</label>
              <select
                value={formData.betStrategy ?? 'fixed'}
                onChange={(e) => setFormData({ ...formData, betStrategy: e.target.value as SimulationConfig['betStrategy'] })}
                className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="fixed">{t('simulation.strategyFixed')}</option>
                <option value="kelly">{t('simulation.strategyKelly')}</option>
                <option value="proportional">{t('simulation.strategyProportional')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.betAmount')}</label>
              <Input
                type="number"
                value={formData.betAmount ?? 100}
                onChange={(e) => setFormData({ ...formData, betAmount: Number(e.target.value) })}
                disabled={formData.betStrategy !== 'fixed'}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.maxBetFraction')}</label>
              <Input
                type="number"
                step="0.01"
                value={formData.maxBetFraction ?? 0.05}
                onChange={(e) => setFormData({ ...formData, maxBetFraction: Number(e.target.value) })}
                disabled={formData.betStrategy === 'fixed'}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.minConfidence')}</label>
              <Input
                type="number"
                step="0.05"
                value={formData.minConfidence ?? 0.6}
                onChange={(e) => setFormData({ ...formData, minConfidence: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.minEdge')}</label>
              <Input
                type="number"
                step="0.01"
                value={formData.minEdge ?? 0.05}
                onChange={(e) => setFormData({ ...formData, minEdge: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('simulation.oddsSource')}</label>
              <select
                value={formData.oddsSource ?? 'market'}
                onChange={(e) => setFormData({ ...formData, oddsSource: e.target.value as SimulationConfig['oddsSource'] })}
                className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="market">{t('simulation.oddsMarket')}</option>
                <option value="llm_inverse">{t('simulation.oddsLlmInverse')}</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <label className="text-sm font-medium">{t('simulation.autoSettle')}</label>
              <Toggle
                checked={formData.autoSettle ?? true}
                onChange={(v) => setFormData({ ...formData, autoSettle: v })}
              />
            </div>
          </div>

          {/* Participating Providers */}
          <div>
            <label className="text-sm font-medium">{t('simulation.participatingProviders')}</label>
            <p className="text-xs text-muted-foreground mb-2">{t('simulation.participatingProvidersDesc')}</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PROVIDERS.map((provider) => {
                const selected = formData.participatingProviders?.includes(provider) ?? false;
                return (
                  <button
                    key={provider}
                    onClick={() => toggleProvider(provider)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {provider}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? t('common.saving') : t('common.save')}
            </Button>
            {saved && <span className="text-sm text-green">{t('common.saved')}</span>}
            {error && <span className="text-sm text-red">{error}</span>}
          </div>
        </div>
      </Card>

      {/* Provider Stats Comparison */}
      {providerStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('simulation.providerComparison')}
            </CardTitle>
          </CardHeader>
          <div className="p-4 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-auto px-6 py-2 text-left">{t('simulation.provider')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.currentEquity')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.totalPnl')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.roi')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.winRate')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.totalBets')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.sharpe')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.maxDrawdown')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerStats.map((stat) => (
                  <TableRow key={stat.provider}>
                    <TableCell className="px-6 py-2">
                      <Badge
                        variant="default"
                        className="text-xs"
                        style={{ backgroundColor: `${PROVIDER_COLORS[stat.provider]}20`, color: PROVIDER_COLORS[stat.provider] }}
                      >
                        {stat.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">${(stat.currentEquity ?? 0).toFixed(0)}</TableCell>
                    <TableCell className={`px-6 py-2 text-right font-mono ${(stat.totalPnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {(stat.totalPnl ?? 0) >= 0 ? '+' : ''}${(stat.totalPnl ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className={`px-6 py-2 text-right font-mono ${(stat.roi ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {((stat.roi ?? 0) * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">{((stat.winRate ?? 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">{stat.totalBets ?? 0}</TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">{(stat.sharpeRatio ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono text-red">{(stat.maxDrawdown ?? 0).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Backtest Result */}
      {backtestResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rewind className="h-4 w-4" />
              {t('simulation.backtestResult')}
            </CardTitle>
          </CardHeader>
          <div className="p-4 pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              {t('simulation.backtestTotalBets')}: <span className="font-mono font-medium">{backtestResult.totalBets}</span>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-auto px-6 py-2 text-left">{t('simulation.provider')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.totalPnl')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.roi')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.winRate')}</TableHead>
                  <TableHead className="h-auto px-6 py-2 text-right">{t('simulation.sharpe')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backtestResult.providerStats.map((stat) => (
                  <TableRow key={stat.provider}>
                    <TableCell className="px-6 py-2">
                      <Badge
                        variant="default"
                        className="text-xs"
                        style={{ backgroundColor: `${PROVIDER_COLORS[stat.provider] ?? '#888'}20`, color: PROVIDER_COLORS[stat.provider] ?? '#888' }}
                      >
                        {stat.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className={`px-6 py-2 text-right font-mono ${(stat.totalPnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {(stat.totalPnl ?? 0) >= 0 ? '+' : ''}${(stat.totalPnl ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className={`px-6 py-2 text-right font-mono ${(stat.roi ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      {((stat.roi ?? 0) * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">{((stat.winRate ?? 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell className="px-6 py-2 text-right font-mono">{(stat.sharpeRatio ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Equity Curves Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {t('simulation.equityCurves')}
            </CardTitle>
          </CardHeader>
          <div className="p-4 pt-0">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="idx" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {Object.keys(equityCurves).map((provider) => (
                  <Line
                    key={provider}
                    type="monotone"
                    dataKey={provider}
                    stroke={PROVIDER_COLORS[provider] ?? '#888'}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {providerStats.length === 0 && chartData.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FlaskConical className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">{t('simulation.noData')}</p>
          <p className="text-xs text-muted-foreground max-w-md text-center">{t('simulation.noDataDesc')}</p>
        </div>
      )}
    </div>
  );
}
