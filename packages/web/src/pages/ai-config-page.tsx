import { useEffect, useState } from 'react';
import { Key, Wifi, BarChart3, Eye, EyeOff, RefreshCw, Loader2 } from 'lucide-react';
import { useLLMStore } from '../stores/llm-store';
import { BackgroundTasksPanel } from '../components/background-tasks-panel';
import { BackupPanel } from '../components/BackupPanel';
import { DataState } from '../components/DataState';
import { TableSkeleton } from '../components/Skeletons';
import { useI18n } from '../hooks/use-i18n';
import type { ConnectivityResult } from '@polyrader/core';
import { Button, Card, CardHeader, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Input, Badge, Progress } from '@/components/ui';

export function AiConfigPage() {
  const { t } = useI18n();
  const { configs, isLoading, error, fetchConfigs, setKey, testConnection } = useLLMStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectivityResult>>({});

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleSaveKey = async (providerId: string) => {
    await setKey(providerId, keyInput);
    setEditingProvider(null);
    setKeyInput('');
  };

  const handleTest = async (providerId: string) => {
    setTestingProvider(providerId);
    const result = await testConnection(providerId);
    setTestResults((prev) => ({ ...prev, [providerId]: result }));
    setTestingProvider(null);
    fetchConfigs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('aiConfig.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('aiConfig.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchConfigs()} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <BackgroundTasksPanel />

      <BackupPanel />

      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && configs.length === 0}
        onRetry={() => fetchConfigs()}
        skeleton={<TableSkeleton rows={6} cols={4} />}
      >

      {/* API Key Management */}
      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{t('aiConfig.keyManagement')}</h2>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-2">Provider</TableHead>
              <TableHead className="px-6 py-2">Model</TableHead>
              <TableHead className="px-6 py-2">API Key</TableHead>
              <TableHead className="px-6 py-2 text-center">{t('common.status')}</TableHead>
              <TableHead className="px-6 py-2 text-right">{t('aiConfig.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                  {t('aiConfig.empty')}
                </TableCell>
              </TableRow>
            )}
            {configs.map((c) => (
              <TableRow key={c.provider}>
                <TableCell className="px-6 py-3 font-medium capitalize">{c.provider}</TableCell>
                <TableCell className="px-6 py-3 text-muted-foreground">{c.model}</TableCell>
                <TableCell className="px-6 py-3 font-mono text-xs">
                  {editingProvider === c.provider ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="sk-..."
                        className="w-40 h-7 px-2 text-xs"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleSaveKey(c.provider)}>{t('common.save')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingProvider(null)}>{t('common.cancel')}</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{c.apiKey || '••••••••••••••••'}</span>
                      {c.apiKey && (
                        <button onClick={() => setShowKeys((prev) => ({ ...prev, [c.provider]: !prev[c.provider] }))}
                          className="text-muted-foreground hover:text-foreground">
                          {showKeys[c.provider] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="px-6 py-3 text-center">
                  {testResults[c.provider] ? (
                    <Badge variant={testResults[c.provider].success ? 'green' : 'red'}>
                      <Wifi className="h-2.5 w-2.5" />
                      {testResults[c.provider].success
                        ? `${testResults[c.provider].latency}ms`
                        : t('aiConfig.failed')}
                    </Badge>
                  ) : (
                    <Badge variant={c.isConnected ? 'green' : 'secondary'}>
                      <Wifi className="h-2.5 w-2.5" />
                      {c.isConnected ? t('aiConfig.connected') : c.isEnabled ? t('aiConfig.pendingTest') : t('aiConfig.unconfigured')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-6 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingProvider(c.provider); setKeyInput(''); }}>{t('aiConfig.configure')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleTest(c.provider)}
                    disabled={testingProvider === c.provider || !c.isEnabled} className="ml-1">
                    {testingProvider === c.provider ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : t('aiConfig.test')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Quota & Usage */}
      <Card>
        <CardHeader className="border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{t('aiConfig.quotaUsage')}</h2>
          </div>
        </CardHeader>
        <div className="p-6">
          {configs.filter((c) => c.isEnabled).length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">{t('aiConfig.noEnabledProvider')}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {configs.filter((c) => c.isEnabled).map((c) => (
                <Card key={c.provider} className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{c.provider}</span>
                    <span className="text-xs text-muted-foreground">${c.costEstimate.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {(c.quotaUsed / 1000).toFixed(1)}K / {(c.quotaLimit / 1000).toFixed(0)}K tokens
                  </div>
                  <Progress value={c.quotaUsed} max={c.quotaLimit} className="mt-2" />
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
      </DataState>
    </div>
  );
}
