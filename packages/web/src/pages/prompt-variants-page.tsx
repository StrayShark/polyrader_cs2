import { useEffect, useState } from 'react';
import { FlaskConical, Plus, RefreshCw, Pencil, Trash2, GitCompare } from 'lucide-react';
import { usePromptVariantStore } from '../stores/prompt-variant-store';
import { api } from '../utils/api';
import { DataState } from '../components/DataState';
import { TableSkeleton } from '../components/Skeletons';
import { useI18n } from '../hooks/use-i18n';
import type { PromptVariant } from '@polyrader/core';
import {
  Button,
  Card,
  CardHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui';

interface FormState {
  variantId: string;
  name: string;
  systemPrompt: string;
  trafficWeight: string;
  notes: string;
}

const emptyForm: FormState = {
  variantId: '',
  name: '',
  systemPrompt: '',
  trafficWeight: '100',
  notes: '',
};

interface ABMetricKey {
  totalAnalyses: number;
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  profitLoss: number;
  roi: number;
  accuracy: number;
}

interface ABCompareData {
  variantA: ABMetricKey;
  variantB: ABMetricKey;
  significance?: {
    zScore: number;
    pValue: number;
    isSignificant: boolean;
    hasSufficientData: boolean;
    minSampleSize: number;
    settledA: number;
    settledB: number;
    chiSquare: number;
    chiSqPValue: number;
    bayesProbABetter: number;
    bayesProbBBetter: number;
    recommendation: string;
  };
}

export function PromptVariantsPage() {
  const { t } = useI18n();
  const {
    variants,
    isLoading,
    error,
    fetchVariants,
    createVariant,
    updateVariant,
    deleteVariant,
  } = usePromptVariantStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<PromptVariant | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [variantAId, setVariantAId] = useState('');
  const [variantBId, setVariantBId] = useState('');
  const [compareData, setCompareData] = useState<ABCompareData | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  // Auto-select first two variants for A/B comparison when loaded
  useEffect(() => {
    if (variants.length >= 2 && !variantAId && !variantBId) {
      setVariantAId(variants[0].variantId);
      setVariantBId(variants[1].variantId);
    }
  }, [variants, variantAId, variantBId]);

  const openCreate = () => {
    setEditingVariant(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (v: PromptVariant) => {
    setEditingVariant(v);
    setForm({
      variantId: v.variantId ?? '',
      name: v.name ?? '',
      systemPrompt: v.systemPrompt ?? '',
      trafficWeight: Number.isFinite(v.trafficWeight) ? String(v.trafficWeight * 100) : '100',
      notes: v.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const weightPercent = parseFloat(form.trafficWeight);
    const trafficWeight = Number.isFinite(weightPercent) ? weightPercent / 100 : undefined;

    try {
      if (editingVariant) {
        await updateVariant(editingVariant.variantId, {
          name: form.name,
          systemPrompt: form.systemPrompt,
          trafficWeight,
          notes: form.notes,
        });
      } else {
        await createVariant({
          variantId: form.variantId,
          name: form.name,
          systemPrompt: form.systemPrompt,
          trafficWeight,
          notes: form.notes,
        });
      }
      setDialogOpen(false);
    } catch {
      // Error is already set in store
    }
  };

  const handleDelete = async (v: PromptVariant) => {
    if (v.isControl) return;
    if (!window.confirm(t('promptVariants.confirmDelete'))) return;
    try {
      await deleteVariant(v.variantId);
    } catch {
      // Error is already set in store
    }
  };

  const handleToggleEnabled = async (v: PromptVariant) => {
    try {
      await updateVariant(v.variantId, { isEnabled: !v.isEnabled });
    } catch {
      // Error is already set in store
    }
  };

  const handleCompare = async () => {
    if (!variantAId || !variantBId || variantAId === variantBId) return;
    setIsComparing(true);
    setCompareError(null);
    try {
      const path = `/ai/prompts/ab/compare?variantA=${encodeURIComponent(variantAId)}&variantB=${encodeURIComponent(variantBId)}`;
      const res = await api.get<{ data: ABCompareData }>(path);
      setCompareData(res.data);
    } catch (err) {
      setCompareError((err as Error).message);
      setCompareData(null);
    } finally {
      setIsComparing(false);
    }
  };

  const metricRows: Array<{
    key: keyof ABMetricKey;
    label: string;
    highlight?: boolean;
    format: (v: number | undefined) => string;
  }> = [
    { key: 'totalAnalyses', label: t('abCompare.totalAnalyses'), format: (v) => (v != null && Number.isFinite(v) ? String(v) : '--') },
    { key: 'totalBets', label: t('abCompare.totalBets'), format: (v) => (v != null && Number.isFinite(v) ? String(v) : '--') },
    { key: 'wonBets', label: t('abCompare.won'), format: (v) => (v != null && Number.isFinite(v) ? String(v) : '--') },
    { key: 'lostBets', label: t('abCompare.lost'), format: (v) => (v != null && Number.isFinite(v) ? String(v) : '--') },
    { key: 'pendingBets', label: t('abCompare.pending'), format: (v) => (v != null && Number.isFinite(v) ? String(v) : '--') },
    { key: 'profitLoss', label: t('abCompare.profitLoss'), highlight: true, format: (v) => (v != null && Number.isFinite(v) ? v.toFixed(2) : '--') },
    { key: 'roi', label: t('abCompare.roi'), highlight: true, format: (v) => (v != null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '--') },
    { key: 'accuracy', label: t('abCompare.accuracy'), highlight: true, format: (v) => (v != null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '--') },
  ];

  const betterSide = (key: keyof ABMetricKey): 'A' | 'B' | null => {
    if (!compareData) return null;
    const a = compareData.variantA?.[key];
    const b = compareData.variantB?.[key];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (a === b) return null;
    return a > b ? 'A' : 'B';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('promptVariants.title')}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchVariants()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            {t('promptVariants.create')}
          </Button>
        </div>
      </div>

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && variants.length === 0}
        onRetry={() => fetchVariants()}
        skeleton={<TableSkeleton rows={5} cols={5} />}
      >
        <Card>
          <CardHeader className="border-b px-6 py-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">{t('promptVariants.title')}</h2>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-2">{t('promptVariants.variantId')}</TableHead>
                <TableHead className="px-6 py-2">{t('promptVariants.name')}</TableHead>
                <TableHead className="px-6 py-2 text-center">{t('common.status')}</TableHead>
                <TableHead className="px-6 py-2 text-center">{t('promptVariants.trafficWeight')}</TableHead>
                <TableHead className="px-6 py-2 text-right">{t('aiConfig.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((v) => (
                <TableRow key={v.variantId}>
                  <TableCell className="px-6 py-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      {v.variantId ?? '--'}
                      {v.isControl && (
                        <Badge variant="secondary">{t('promptVariants.control')}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-3 font-medium">{v.name ?? '--'}</TableCell>
                  <TableCell className="px-6 py-3 text-center">
                    <button
                      onClick={() => handleToggleEnabled(v)}
                      className="inline-flex cursor-pointer"
                      disabled={isLoading}
                    >
                      <Badge variant={v.isEnabled ? 'green' : 'secondary'}>
                        {v.isEnabled ? t('promptVariants.enabled') : t('promptVariants.disabled')}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="px-6 py-3 text-center">
                    {Number.isFinite(v.trafficWeight)
                      ? `${(v.trafficWeight * 100).toFixed(0)}%`
                      : '--'}
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                      <Pencil className="h-3 w-3" />
                      {t('promptVariants.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(v)}
                      disabled={v.isControl}
                      className="ml-1"
                      title={v.isControl ? t('promptVariants.cannotDeleteControl') : undefined}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('promptVariants.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </DataState>

      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{t('abCompare.title')}</h2>
          </div>
        </CardHeader>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('abCompare.variantA')}</label>
              <select
                value={variantAId}
                onChange={(e) => setVariantAId(e.target.value)}
                className="w-44 rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('abCompare.selectVariant')}</option>
                {variants.map((v) => (
                  <option key={v.variantId} value={v.variantId}>{v.name ?? v.variantId}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('abCompare.variantB')}</label>
              <select
                value={variantBId}
                onChange={(e) => setVariantBId(e.target.value)}
                className="w-44 rounded border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('abCompare.selectVariant')}</option>
                {variants.map((v) => (
                  <option key={v.variantId} value={v.variantId}>{v.name ?? v.variantId}</option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleCompare}
              disabled={isComparing || !variantAId || !variantBId || variantAId === variantBId}
            >
              {isComparing ? t('common.loading') : t('abCompare.compare')}
            </Button>
          </div>

          {compareError && (
            <div className="text-sm text-red-500">{compareError}</div>
          )}

          {compareData && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2" />
                  <TableHead className="px-4 py-2 text-center">{t('abCompare.variantA')}</TableHead>
                  <TableHead className="px-4 py-2 text-center">{t('abCompare.variantB')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricRows.map((row) => {
                  const aVal = compareData.variantA?.[row.key];
                  const bVal = compareData.variantB?.[row.key];
                  const better = row.highlight ? betterSide(row.key) : null;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="px-4 py-2 font-medium">{row.label}</TableCell>
                      <TableCell className={`px-4 py-2 text-center ${better === 'A' ? 'text-green-600 font-medium' : ''}`}>
                        {row.format(aVal)}
                      </TableCell>
                      <TableCell className={`px-4 py-2 text-center ${better === 'B' ? 'text-green-600 font-medium' : ''}`}>
                        {row.format(bVal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {compareData?.significance && (
            <div className="mt-3 rounded-md bg-muted/50 px-4 py-2 text-xs text-muted-foreground space-y-1">
              {compareData.significance.hasSufficientData ? (
                <>
                  <div>
                    <span className="font-medium">
                      {compareData.significance.isSignificant ? '✓ ' : '✗ '}
                      {t('abCompare.significant')}
                    </span>
                    {' | '}
                    {t('abCompare.pValue')}: {compareData.significance.pValue.toFixed(4)}
                    {' | '}
                    {t('abCompare.zScore')}: {compareData.significance.zScore.toFixed(3)}
                  </div>
                  <div>
                    {t('abCompare.chiSquare')}: {compareData.significance.chiSquare.toFixed(3)}
                    {' (p='}{compareData.significance.chiSqPValue.toFixed(4)}{')'}
                  </div>
                  <div>
                    {t('abCompare.bayesProbA')}: {(compareData.significance.bayesProbABetter * 100).toFixed(1)}%
                    {' | '}
                    {t('abCompare.bayesProbB')}: {(compareData.significance.bayesProbBBetter * 100).toFixed(1)}%
                  </div>
                  {compareData.significance.recommendation !== 'no_significant_difference' && (
                    <div className="font-medium text-green-600">
                      {t(`abCompare.recommendation.${compareData.significance.recommendation}`)}
                    </div>
                  )}
                </>
              ) : (
                <span>
                  {t('abCompare.insufficientData', {
                    min: compareData.significance.minSampleSize,
                    a: compareData.significance.settledA,
                    b: compareData.significance.settledB,
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVariant ? t('promptVariants.edit') : t('promptVariants.create')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('promptVariants.variantId')}</label>
              <Input
                value={form.variantId}
                onChange={(e) => setForm((f) => ({ ...f, variantId: e.target.value }))}
                disabled={!!editingVariant}
                placeholder="control-v1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('promptVariants.name')}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Control Group"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('promptVariants.systemPrompt')}</label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="You are a CS2 prediction analyst..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('promptVariants.trafficWeight')}</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.trafficWeight}
                onChange={(e) => setForm((f) => ({ ...f, trafficWeight: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('promptVariants.notes')}</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('promptVariants.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {t('promptVariants.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
