import { useEffect, useRef, useState } from 'react';
import { Database, Download, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { useToast } from './ToastProvider';
import { getBase } from '../utils/api';
import { Button, Card, CardHeader, CardTitle, Badge } from '@/components/ui';

interface BackupInfo {
  fileSize: number;
  fileSizeFormatted: string;
  tableCounts: Record<string, number>;
  dbPath: string;
}

export function BackupPanel() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const base = await getBase();
      const res = await fetch(`${base}/backup/info`);
      if (!res.ok) throw new Error('Failed to load backup info');
      const json = await res.json() as { data: BackupInfo };
      setInfo(json.data);
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInfo();
  }, []);

  const handleExport = async () => {
    try {
      const base = await getBase();
      const res = await fetch(`${base}/backup/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `polyrader-backup-${new Date().toISOString().slice(0, 10)}.db`;
      anchor.click();
      URL.revokeObjectURL(url);
      addToast('success', t('backup.exportSuccess'));
    } catch (err) {
      addToast('error', (err as Error).message);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const base = await getBase();
      const buffer = await file.arrayBuffer();
      const res = await fetch(`${base}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer,
      });
      const json = await res.json().catch(() => ({})) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      addToast('success', json.message ?? t('backup.importSuccess'));
      await fetchInfo();
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('backup.title')}</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchInfo()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-2 rounded-md border border-yellow/30 bg-yellow/5 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow" />
          {t('backup.warning')}
        </div>

        {info && (
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">{t('backup.fileSize')}</div>
              <div className="font-medium tabular-nums">{info.fileSizeFormatted}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('backup.fileName')}</div>
              <div className="font-mono text-xs">{info.dbPath}</div>
            </div>
            {Object.entries(info.tableCounts).slice(0, 2).map(([table, count]) => (
              <div key={table}>
                <div className="text-xs text-muted-foreground">{table}</div>
                <div className="font-medium tabular-nums">{count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            {t('backup.export')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? t('common.loading') : t('backup.import')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
            }}
          />
          <Badge variant="default">{t('backup.localOnly')}</Badge>
        </div>
      </div>
    </Card>
  );
}
