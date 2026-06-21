import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
} from '@/components/ui';
import { useAlertStore, type AlertType } from '../stores/alert-store';
import { useMarketStore } from '../stores/market-store';
import { useI18n } from '../hooks/use-i18n';

export function AlertManager() {
  const { t } = useI18n();
  const { alerts, isLoading, error, fetchAlerts, createAlert, deleteAlert } = useAlertStore();
  const { markets, fetchMarkets } = useMarketStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('price_above');
  const [threshold, setThreshold] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAlerts();
    fetchMarkets(100);
  }, [fetchAlerts, fetchMarkets]);

  const handleCreate = async () => {
    const thresholdNum = parseFloat(threshold);
    if (!selectedSlug || !selectedQuestion || !Number.isFinite(thresholdNum)) return;
    setSubmitting(true);
    const ok = await createAlert({
      marketSlug: selectedSlug,
      marketQuestion: selectedQuestion,
      alertType,
      threshold: thresholdNum,
    });
    setSubmitting(false);
    if (ok) {
      setDialogOpen(false);
      setSelectedSlug('');
      setSelectedQuestion('');
      setAlertType('price_above');
      setThreshold('');
    }
  };

  const handleSelectMarket = (slug: string) => {
    setSelectedSlug(slug);
    const market = markets.find((m) => m.slug === slug);
    setSelectedQuestion(market?.question ?? slug);
  };

  const typeLabel = (type: AlertType) => {
    switch (type) {
      case 'price_above': return t('alert.typePriceAbove');
      case 'price_below': return t('alert.typePriceBelow');
      case 'volume_above': return t('alert.typeVolumeAbove');
    }
  };

  const formatValue = (type: AlertType, value: number) => {
    if (type === 'volume_above') return value.toLocaleString();
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader className="border-b px-6 py-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle>{t('alert.title')}</CardTitle>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('alert.create')}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('alert.createTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">{t('alert.selectMarket')}</label>
                <select
                  value={selectedSlug}
                  onChange={(e) => handleSelectMarket(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('alert.selectMarketPlaceholder')}</option>
                  {markets.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.question}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('alert.type')}</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value as AlertType)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="price_above">{t('alert.typePriceAbove')}</option>
                  <option value="price_below">{t('alert.typePriceBelow')}</option>
                  <option value="volume_above">{t('alert.typeVolumeAbove')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t('alert.threshold')}
                  {alertType !== 'volume_above' && ' (0-1)'}
                </label>
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1"
                  placeholder={alertType === 'volume_above' ? '10000' : '0.65'}
                  step={alertType === 'volume_above' ? '100' : '0.01'}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={submitting || !selectedSlug || !threshold}>
                {submitting ? t('common.loading') : t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      {error && (
        <div className="p-4 text-sm text-red">{error}</div>
      )}

      {isLoading && alerts.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : alerts.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{t('alert.empty')}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-auto px-6 py-2 text-left">{t('common.market')}</TableHead>
              <TableHead className="h-auto px-6 py-2 text-left">{t('alert.type')}</TableHead>
              <TableHead className="h-auto px-6 py-2 text-right">{t('alert.threshold')}</TableHead>
              <TableHead className="h-auto px-6 py-2 text-right">{t('alert.currentValue')}</TableHead>
              <TableHead className="h-auto px-6 py-2 text-center">{t('common.status')}</TableHead>
              <TableHead className="h-auto px-6 py-2 text-right">{t('alert.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id} className={`text-sm ${alert.triggered ? 'bg-yellow/5' : ''}`}>
                <TableCell className="px-6 py-3 font-medium max-w-xs truncate" title={alert.marketQuestion}>
                  {alert.marketQuestion}
                </TableCell>
                <TableCell className="px-6 py-3">{typeLabel(alert.alertType)}</TableCell>
                <TableCell className="px-6 py-3 text-right tabular-nums">
                  {formatValue(alert.alertType, alert.threshold)}
                </TableCell>
                <TableCell className="px-6 py-3 text-right tabular-nums">
                  {formatValue(alert.alertType, alert.currentValue)}
                </TableCell>
                <TableCell className="px-6 py-3 text-center">
                  {alert.triggered ? (
                    <Badge variant="yellow">{t('alert.triggered')}</Badge>
                  ) : (
                    <Badge variant="green">{t('alert.monitoring')}</Badge>
                  )}
                </TableCell>
                <TableCell className="px-6 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteAlert(alert.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
