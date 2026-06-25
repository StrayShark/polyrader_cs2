import type {
  BackgroundTask,
  BackgroundTaskCategory,
  BackgroundTaskLog,
  BackgroundTaskTrigger,
  ScheduledJobDefinition,
  TaskMonitorSnapshot,
} from '@polyrader/core';
import { broadcast } from '../websocket';

export interface TrackTaskOptions {
  name: string;
  category: BackgroundTaskCategory;
  trigger?: BackgroundTaskTrigger;
  metadata?: Record<string, unknown>;
  /** High-frequency jobs: only keep in recent history when failed or slow (>3s). */
  silent?: boolean;
}

export interface TaskRunContext {
  log: (message: string, level?: BackgroundTaskLog['level']) => void;
  setProgress: (percent: number, label?: string) => void;
  setMetadata: (patch: Record<string, unknown>) => void;
}

export const SCHEDULED_JOBS: ScheduledJobDefinition[] = [
  { jobKey: 'price-poll', name: 'Price Poll', category: 'market', cron: '* * * * *', scheduleLabel: 'Every 1 min', description: 'Poll CLOB midpoints and broadcast prices' },
  { jobKey: 'arbitrage-scan', name: 'Arbitrage Scan', category: 'signal', cron: '*/2 * * * *', scheduleLabel: 'Every 2 min', description: 'Detect cross-market arbitrage opportunities' },
  { jobKey: 'whale-ingestion', name: 'Whale Ingestion', category: 'whale', cron: '*/5 * * * *', scheduleLabel: 'Every 5 min', description: 'Scan Polygon for large Polymarket trades' },
  { jobKey: 'settlement-check', name: 'Settlement Check', category: 'market', cron: '*/10 * * * *', scheduleLabel: 'Every 10 min', description: 'Settle simulated bets on resolved markets' },
  { jobKey: 'llm-auto-analysis', name: 'LLM Auto Analysis', category: 'ai', cron: '*/15 * * * *', scheduleLabel: 'Every 15 min', description: 'Auto-analyze upcoming matches with configured LLMs' },
  { jobKey: 'polymarket-refresh', name: 'Polymarket Refresh', category: 'market', cron: '*/30 * * * *', scheduleLabel: 'Every 30 min', description: 'Refresh markets and enrich esports data' },
  { jobKey: 'hltv-delayed-check', name: 'HLTV Delayed Check', category: 'esports', cron: '*/30 * * * *', scheduleLabel: 'Every 30 min', description: 'Detect postponed matches via HLTV' },
  { jobKey: 'esports-pipeline', name: 'Esports Pipeline', category: 'esports', cron: '0 */2 * * *', scheduleLabel: 'Every 2 hours', description: 'Fetch CS API + HLTV match and team data' },
  { jobKey: 'hltv-rankings', name: 'HLTV Rankings', category: 'esports', cron: '0 */6 * * *', scheduleLabel: 'Every 6 hours', description: 'Update world team rankings' },
  { jobKey: 'daily-dashboard', name: 'Daily Dashboard', category: 'system', cron: '5 0 * * *', scheduleLabel: 'Daily 00:05 UTC', description: 'Generate daily attention dashboard' },
  { jobKey: 'data-cleanup', name: 'Data Cleanup', category: 'system', cron: '15 0 * * *', scheduleLabel: 'Daily 00:15 UTC', description: 'Purge old esports history' },
  { jobKey: 'startup-init', name: 'Startup Init', category: 'system', cron: 'on boot', scheduleLabel: 'On server start', description: 'Initial market and esports data load' },
];

const MAX_RECENT = 80;
const MAX_LOGS = 40;
const SILENT_SLOW_MS = 3000;

export class TaskTrackerService {
  private running = new Map<string, BackgroundTask>();
  private recent: BackgroundTask[] = [];

  getSnapshot(): TaskMonitorSnapshot {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let completedToday = 0;
    let failedToday = 0;
    for (const task of this.recent) {
      const finished = task.finishedAt ? new Date(task.finishedAt).getTime() : 0;
      if (finished < todayMs) continue;
      if (task.status === 'success') completedToday++;
      if (task.status === 'failed') failedToday++;
    }

    return {
      running: Array.from(this.running.values()).sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
      recent: [...this.recent],
      scheduledJobs: SCHEDULED_JOBS,
      stats: {
        runningCount: this.running.size,
        completedToday,
        failedToday,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async run(
    jobKey: string,
    options: TrackTaskOptions,
    fn: (ctx: TaskRunContext) => Promise<void | Record<string, unknown>>,
  ): Promise<void> {
    const id = `${jobKey}-${Date.now().toString(36)}`;
    const startedMs = Date.now();
    const task: BackgroundTask = {
      id,
      jobKey,
      name: options.name,
      category: options.category,
      trigger: options.trigger ?? 'scheduled',
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      logs: [],
      metadata: options.metadata,
    };

    this.running.set(id, task);
    this.publish();

    const ctx: TaskRunContext = {
      log: (message, level = 'info') => {
        task.logs.push({ ts: new Date().toISOString(), level, message });
        if (task.logs.length > MAX_LOGS) task.logs.shift();
        this.publish();
      },
      setProgress: (percent, label) => {
        task.progress = Math.max(0, Math.min(100, percent));
        if (label) task.progressLabel = label;
        this.publish();
      },
      setMetadata: (patch) => {
        task.metadata = { ...task.metadata, ...patch };
        this.publish();
      },
    };

    try {
      ctx.log(`Started: ${options.name}`);
      const result = await fn(ctx);
      task.status = 'success';
      task.progress = 100;
      if (result && typeof result === 'object') {
        task.metadata = { ...task.metadata, ...result };
      }
      ctx.log('Completed successfully');
    } catch (err) {
      task.status = 'failed';
      task.error = (err as Error).message;
      ctx.log(task.error, 'error');
    } finally {
      task.finishedAt = new Date().toISOString();
      task.durationMs = Date.now() - startedMs;
      this.running.delete(id);

      const keepInRecent = !options.silent
        || task.status === 'failed'
        || (task.durationMs ?? 0) >= SILENT_SLOW_MS;

      if (keepInRecent) {
        this.recent.unshift({ ...task, logs: [...task.logs] });
        if (this.recent.length > MAX_RECENT) this.recent.pop();
      }

      this.publish();
    }
  }

  private publish(): void {
    broadcast('tasks', this.getSnapshot());
  }
}

export const taskTracker = new TaskTrackerService();

export function trackTask(
  jobKey: string,
  options: TrackTaskOptions,
  fn: (ctx: TaskRunContext) => Promise<void | Record<string, unknown>>,
): Promise<void> {
  return taskTracker.run(jobKey, options, fn);
}
