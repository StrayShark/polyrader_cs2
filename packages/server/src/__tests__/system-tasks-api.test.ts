import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';

// task-tracker-service.test.ts mocks broadcast; restore real WS for this file
vi.unmock('../websocket');

import { SystemController } from '../controllers/system-controller';
import type { TaskTrackerService } from '../services/task-tracker-service';

function makeApp() {
  const app = express();
  const ctrl = new SystemController();
  app.get('/api/system/tasks', (req, res) => ctrl.getTasks(req, res));
  return app;
}

describe('GET /api/system/tasks', () => {
  it('returns task monitor snapshot', async () => {
    const res = await request(makeApp()).get('/api/system/tasks');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.scheduledJobs)).toBe(true);
    expect(res.body.data.scheduledJobs.length).toBeGreaterThan(0);
    expect(res.body.data.stats).toMatchObject({
      runningCount: expect.any(Number),
      completedToday: expect.any(Number),
      failedToday: expect.any(Number),
    });
    expect(Array.isArray(res.body.data.running)).toBe(true);
    expect(Array.isArray(res.body.data.recent)).toBe(true);
  });
});

describe('WebSocket tasks channel', () => {
  let server: Server;
  let port: number;
  let taskTracker: TaskTrackerService;

  beforeAll(async () => {
    const wsMod = await import('../websocket');
    const trackerMod = await import('../services/task-tracker-service');
    taskTracker = trackerMod.taskTracker;

    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });
    wsMod.setupWebSocket(wss);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        server = httpServer;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }, 15000);

  it('pushes snapshot when a task completes', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const taskMessages: Array<Record<string, unknown>> = [];

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { channel?: string; data?: Record<string, unknown> };
        if (msg.channel === 'tasks' && msg.data) {
          taskMessages.push(msg.data);
        }
      } catch {
        // ignore malformed
      }
    });

    ws.send(JSON.stringify({ type: 'subscribe', channel: 'tasks' }));
    await new Promise((r) => setTimeout(r, 100));

    await taskTracker.run('ws-test-job', {
      name: 'WS Test',
      category: 'system',
      trigger: 'manual',
    }, async () => ({ ok: true }));

    await vi.waitFor(() => {
      const found = taskMessages.some((payload) =>
        (payload.recent as Array<{ jobKey: string }> | undefined)?.some((t) => t.jobKey === 'ws-test-job'),
      );
      expect(found).toBe(true);
    }, { timeout: 3000 });

    ws.close();
  }, 10000);
});
