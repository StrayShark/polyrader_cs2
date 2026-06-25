import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const broadcastMock = vi.fn();

vi.mock('../websocket', () => ({
  broadcast: (...args: unknown[]) => broadcastMock(...args),
}));

import {
  SCHEDULED_JOBS,
  TaskTrackerService,
} from '../services/task-tracker-service';

describe('TaskTrackerService', () => {
  let tracker: TaskTrackerService;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new TaskTrackerService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes scheduled jobs in snapshot', () => {
    const snapshot = tracker.getSnapshot();
    expect(snapshot.scheduledJobs).toEqual(SCHEDULED_JOBS);
    expect(snapshot.scheduledJobs.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.updatedAt).toBeTruthy();
  });

  it('tracks a successful task through running → recent', async () => {
    await tracker.run('test-job', {
      name: 'Test Job',
      category: 'system',
      trigger: 'manual',
    }, async (ctx) => {
      ctx.setProgress(50, 'halfway');
      ctx.log('working');
      return { items: 3 };
    });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.running).toHaveLength(0);
    expect(snapshot.recent).toHaveLength(1);
    expect(snapshot.recent[0].status).toBe('success');
    expect(snapshot.recent[0].metadata).toMatchObject({ items: 3 });
    expect(snapshot.recent[0].progress).toBe(100);
    expect(snapshot.recent[0].logs.some((l) => l.message === 'working')).toBe(true);
    expect(snapshot.stats.completedToday).toBe(1);
  });

  it('records failed tasks with error message', async () => {
    await tracker.run('fail-job', {
      name: 'Fail Job',
      category: 'market',
    }, async () => {
      throw new Error('network timeout');
    });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.recent[0].status).toBe('failed');
    expect(snapshot.recent[0].error).toBe('network timeout');
    expect(snapshot.stats.failedToday).toBe(1);
  });

  it('exposes running tasks while in progress', async () => {
    let resolveWork!: () => void;
    const work = new Promise<void>((resolve) => { resolveWork = resolve; });

    const runPromise = tracker.run('long-job', {
      name: 'Long Job',
      category: 'ai',
    }, async () => {
      await work;
    });

    expect(tracker.getSnapshot().running).toHaveLength(1);
    expect(tracker.getSnapshot().running[0].name).toBe('Long Job');

    resolveWork();
    await runPromise;

    expect(tracker.getSnapshot().running).toHaveLength(0);
  });

  it('skips silent fast successes from recent history', async () => {
    await tracker.run('silent-fast', {
      name: 'Silent Fast',
      category: 'signal',
      silent: true,
    }, async () => {
      // completes immediately
    });

    expect(tracker.getSnapshot().recent).toHaveLength(0);
  });

  it('keeps silent tasks in recent when they fail', async () => {
    await tracker.run('silent-fail', {
      name: 'Silent Fail',
      category: 'signal',
      silent: true,
    }, async () => {
      throw new Error('boom');
    });

    expect(tracker.getSnapshot().recent).toHaveLength(1);
    expect(tracker.getSnapshot().recent[0].status).toBe('failed');
  });

  it('keeps silent slow successes in recent history', async () => {
    vi.useFakeTimers();

    const runPromise = tracker.run('silent-slow', {
      name: 'Silent Slow',
      category: 'market',
      silent: true,
    }, async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3500);
      });
    });

    await vi.advanceTimersByTimeAsync(3500);
    await runPromise;

    expect(tracker.getSnapshot().recent).toHaveLength(1);
    expect(tracker.getSnapshot().recent[0].status).toBe('success');
    expect(tracker.getSnapshot().recent[0].durationMs).toBeGreaterThanOrEqual(3000);
  });

  it('broadcasts snapshot on start and finish', async () => {
    await tracker.run('broadcast-job', {
      name: 'Broadcast',
      category: 'whale',
    }, async () => {});

    expect(broadcastMock).toHaveBeenCalled();
    const channels = broadcastMock.mock.calls.map((c) => c[0]);
    expect(channels.every((ch) => ch === 'tasks')).toBe(true);

    const lastPayload = broadcastMock.mock.calls.at(-1)?.[1] as { running: unknown[]; recent: unknown[] };
    expect(lastPayload.running).toHaveLength(0);
    expect(lastPayload.recent.length).toBeGreaterThanOrEqual(1);
  });
});
