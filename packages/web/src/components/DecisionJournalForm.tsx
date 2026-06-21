import { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useToast } from './ToastProvider';
import { api } from '@/utils/api';
import { Card, CardHeader, CardTitle, Button, Input, Textarea } from '@/components/ui';

const EMPTY_FORM = {
  matchId: '',
  team: '',
  amount: '',
  odds: '',
  reasoning: '',
};

export function DecisionJournalForm() {
  const { t } = useI18n();
  const { addToast } = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Required fields (reasoning is optional)
    if (!form.matchId.trim() || !form.team.trim() || !form.amount || !form.odds) {
      addToast('warning', t('journal.requiredFields'));
      return;
    }

    const amountNum = parseFloat(form.amount);
    const oddsNum = parseFloat(form.odds);

    // NaN guards per project rules
    if (!Number.isFinite(amountNum) || amountNum < 10 || amountNum > 10000) {
      addToast('warning', t('journal.invalidAmount'));
      return;
    }
    if (!Number.isFinite(oddsNum) || oddsNum < 1.01 || oddsNum > 100) {
      addToast('warning', t('journal.invalidOdds'));
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/ai/stats/bet', {
        matchId: form.matchId.trim(),
        team: form.team.trim(),
        amount: amountNum,
        odds: oddsNum,
        provider: 'user',
        reasoning: form.reasoning.trim() || undefined,
      });
      addToast('success', t('journal.success'));
      setForm(EMPTY_FORM);
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('journal.title')}</CardTitle>
        </div>
      </CardHeader>
      <div className="p-6 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t('journal.matchId')}</label>
            <Input
              value={form.matchId}
              onChange={(e) => update('matchId', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('journal.team')}</label>
            <Input
              value={form.team}
              onChange={(e) => update('team', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('journal.amount')}</label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('journal.odds')}</label>
            <Input
              type="number"
              value={form.odds}
              onChange={(e) => update('odds', e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('journal.reasoning')}</label>
          <Textarea
            value={form.reasoning}
            onChange={(e) => update('reasoning', e.target.value)}
            className="mt-1"
            rows={3}
          />
        </div>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <BookOpen className="h-4 w-4 mr-2" />
          )}
          {t('journal.submit')}
        </Button>
      </div>
    </Card>
  );
}
