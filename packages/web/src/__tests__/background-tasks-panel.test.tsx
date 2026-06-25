import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { TaskMonitorSnapshot } from '@polyrader/core';

const mockSnapshot: TaskMonitorSnapshot = {
  running: [],
  recent: [
    {
      id: 'startup-init',
      jobKey: 'startup-init',
      name: '启动初始化',
      category: 'system',
      trigger: 'startup',
      status: 'success',
      startedAt: '2026-06-25T08:00:00.000Z',
      finishedAt: '2026-06-25T08:00:01.000Z',
      durationMs: 1000,
      progress: 100,
      logs: [],
    },
  ],
  scheduledJobs: [
    {
      jobKey: 'price-poll',
      name: '价格轮询',
      category: 'market',
      cron: '*/30 * * * * *',
      scheduleLabel: '每 30 秒',
      description: '轮询 CLOB 价格',
    },
    {
      jobKey: 'market-refresh',
      name: '市场刷新',
      category: 'market',
      cron: '0 */5 * * * *',
      scheduleLabel: '每 5 分钟',
    },
  ],
  stats: {
    runningCount: 0,
    completedToday: 3,
    failedToday: 1,
  },
  updatedAt: '2026-06-25T08:00:00.000Z',
};

vi.mock('../utils/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: mockSnapshot })),
  },
}));

vi.mock('../hooks/use-websocket', () => ({
  useWebSocket: () => ({
    connectionState: 'connected',
    wsStatus: 'connected' as const,
    latency: 10,
    lastEvent: null,
    subscribe: () => () => {},
    send: () => {},
  }),
}));

import { BackgroundTasksPanel } from '../components/background-tasks-panel';
import { api } from '../utils/api';

describe('BackgroundTasksPanel', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockSnapshot });
  });

  it('renders title, stats, and fetches task snapshot', async () => {
    render(<BackgroundTasksPanel />);

    expect(screen.getByText('后台任务')).toBeInTheDocument();
    expect(screen.getByText('实时')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/system/tasks');
    });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('当前没有正在执行的任务')).toBeInTheDocument();
  });

  it('shows scheduled jobs when scheduled tab is selected', async () => {
    render(<BackgroundTasksPanel />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('tab', { name: '定时任务' }));

    expect(screen.getByText('价格轮询')).toBeInTheDocument();
    expect(screen.getByText('市场刷新')).toBeInTheDocument();
    expect(screen.getByText('每 30 秒')).toBeInTheDocument();
  });
});
