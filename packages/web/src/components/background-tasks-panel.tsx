import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import type {
  BackgroundTask,
  BackgroundTaskCategory,
  TaskMonitorSnapshot,
} from '@polyrader/core';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  Progress,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { cn } from '../utils/cn';

const CATEGORY_COLORS: Record<BackgroundTaskCategory, string> = {
  market: 'text-cyan',
  esports: 'text-green',
  ai: 'text-primary',
  whale: 'text-yellow',
  signal: 'text-red',
  system: 'text-muted-foreground',
};

function formatDuration(ms?: number): string {
  if (ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusIcon({ status }: { status: BackgroundTask['status'] }) {
  if (status === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-green" />;
  }
  if (status === 'failed') {
    return <XCircle className="h-4 w-4 text-red" />;
  }
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function TriggerBadge({ trigger }: { trigger: BackgroundTask['trigger'] }) {
  const { t } = useI18n();
  const variant = trigger === 'manual' ? 'cyan' : trigger === 'startup' ? 'yellow' : 'secondary';
  const label = trigger === 'manual'
    ? t('tasks.triggerManual')
    : trigger === 'startup'
      ? t('tasks.triggerStartup')
      : t('tasks.triggerScheduled');
  return <Badge variant={variant}>{label}</Badge>;
}

function TaskRow({
  task,
  expanded,
  onToggle,
  active,
}: {
  task: BackgroundTask;
  expanded: boolean;
  onToggle: () => void;
  active?: boolean;
}) {
  const elapsed = task.status === 'running'
    ? Date.now() - new Date(task.startedAt).getTime()
    : task.durationMs;

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30"
      >
        <div className="mt-0.5">
          <StatusIcon status={task.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{task.name}</span>
            <Badge variant="secondary" className={CATEGORY_COLORS[task.category]}>
              {task.category}
            </Badge>
            <TriggerBadge trigger={task.trigger} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(task.startedAt)}
            </span>
            <span>{formatDuration(elapsed)}</span>
            {task.progressLabel && (
              <span className="text-foreground/80">{task.progressLabel}</span>
            )}
            {task.error && (
              <span className="text-red">{task.error}</span>
            )}
          </div>
          {task.status === 'running' && (
            <Progress value={task.progress > 0 ? task.progress : 30} className="mt-2 h-1 animate-pulse" />
          )}
        </div>
        <div className="mt-1 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && task.logs.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-2">
          <ScrollArea className="max-h-36">
            <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              {task.logs.map((line, i) => (
                <div
                  key={`${line.ts}-${i}`}
                  className={cn(
                    line.level === 'error' && 'text-red',
                    line.level === 'warn' && 'text-yellow',
                  )}
                >
                  [{formatTime(line.ts)}] {line.message}
                </div>
              ))}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export function BackgroundTasksPanel() {
  const { t } = useI18n();
  const { subscribe, wsStatus } = useWebSocket();
  const [snapshot, setSnapshot] = useState<TaskMonitorSnapshot | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState('active');

  const fetchSnapshot = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: TaskMonitorSnapshot }>('/system/tasks');
      setSnapshot(data);
    } catch {
      // keep last snapshot on poll failure
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    return subscribe('tasks', (data) => {
      setSnapshot(data as TaskMonitorSnapshot);
    });
  }, [subscribe]);

  const running = snapshot?.running ?? [];
  const recent = snapshot?.recent ?? [];
  const stats = snapshot?.stats ?? { runningCount: 0, completedToday: 0, failedToday: 0 };
  const scheduledJobs = snapshot?.scheduledJobs ?? [];

  const timeline = useMemo(() => recent.slice(0, 30), [recent]);

  return (
    <Card>
      <CardHeader className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">{t('tasks.title')}</h2>
              <p className="text-xs text-muted-foreground">{t('tasks.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  wsStatus === 'connected' ? 'bg-green animate-pulse' : 'bg-muted-foreground',
                )}
              />
              {wsStatus === 'connected' ? t('tasks.live') : t('tasks.polling')}
            </span>
            {stats.runningCount > 0 && (
              <Badge variant="cyan">
                <Zap className="h-3 w-3" />
                {t('tasks.runningCount', { count: stats.runningCount })}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: t('tasks.statRunning'), value: stats.runningCount, accent: stats.runningCount > 0 },
            { label: t('tasks.statCompleted'), value: stats.completedToday, accent: false },
            { label: t('tasks.statFailed'), value: stats.failedToday, accent: stats.failedToday > 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{item.label}</div>
              <div className={cn('text-xl font-semibold tabular-nums', item.accent && 'text-primary')}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="active" className="gap-1.5">
              {t('tasks.tabActive')}
              {running.length > 0 && (
                <Badge variant="cyan" className="h-4 px-1 text-[10px]">{running.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">{t('tasks.tabActivity')}</TabsTrigger>
            <TabsTrigger value="scheduled">{t('tasks.tabScheduled')}</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-2">
            {running.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {t('tasks.noActive')}
              </div>
            ) : (
              running.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active
                  expanded={expandedId === task.id}
                  onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="activity">
            {timeline.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t('tasks.noActivity')}</div>
            ) : (
              <div className="relative space-y-0 pl-4">
                <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
                {timeline.map((task) => (
                  <div key={task.id} className="relative pb-3">
                    <div
                      className={cn(
                        'absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 bg-background',
                        task.status === 'success' && 'border-green',
                        task.status === 'failed' && 'border-red',
                        task.status === 'running' && 'border-primary',
                      )}
                    />
                    <div className="ml-6">
                      <TaskRow
                        task={task}
                        expanded={expandedId === task.id}
                        onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="scheduled">
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">{t('tasks.jobName')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('tasks.schedule')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('common.type')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobs.map((job) => (
                    <tr key={job.jobKey} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{job.name}</div>
                        {job.description && (
                          <div className="text-xs text-muted-foreground">{job.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{job.scheduleLabel}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={CATEGORY_COLORS[job.category]}>
                          {job.category}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
