import type { WebSocketServer, WebSocket } from 'ws';
import { wsMessageSchema, isAllowedChannel, MAX_CONNECTIONS, MAX_CONNECTIONS_PER_IP } from './validation';
import { logger } from '../utils/logger';

interface ClientState {
  ws: WebSocket;
  subscriptions: Set<string>;
  ip: string;
  isAlive: boolean;
}

const clients = new Map<WebSocket, ClientState>();

function getIpCount(ip: string): number {
  let count = 0;
  for (const [, state] of clients) {
    if (state.ip === ip) count++;
  }
  return count;
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req) => {
    // Connection limit check
    if (clients.size >= MAX_CONNECTIONS) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server at max connections' }));
      ws.close(1013, 'Max connections reached');
      return;
    }

    // Per-IP limit check
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';

    if (getIpCount(ip) >= MAX_CONNECTIONS_PER_IP) {
      ws.send(JSON.stringify({ type: 'error', message: 'Too many connections from this IP' }));
      ws.close(1013, 'Per-IP connection limit reached');
      return;
    }

    const state: ClientState = { ws, subscriptions: new Set(), ip, isAlive: true };
    clients.set(ws, state);
    logger.info('WS client connected', { ip, total: clients.size });

    ws.on('pong', () => {
      state.isAlive = true;
    });

    ws.on('message', (data: Buffer) => {
      try {
        const raw = JSON.parse(data.toString());
        const parsed = wsMessageSchema.safeParse(raw);

        if (!parsed.success) {
          const zodErr = parsed.error as { issues: Array<{ message: string }> };
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            details: zodErr.issues.map((e) => e.message),
          }));
          return;
        }

        const message = parsed.data;

        switch (message.type) {
          case 'subscribe': {
            if (!isAllowedChannel(message.channel)) {
              ws.send(JSON.stringify({ type: 'error', message: `Channel not allowed: ${message.channel}` }));
              return;
            }
            state.subscriptions.add(message.channel);
            break;
          }
          case 'unsubscribe': {
            state.subscriptions.delete(message.channel);
            break;
          }
          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', sentAt: message.sentAt }));
            break;
          }
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('WS client disconnected', { total: clients.size });
    });

    ws.on('error', (err) => {
      logger.error('WS error', { error: err.message });
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
    }));
  });

  // Heartbeat
  setInterval(() => {
    for (const [ws, conn] of clients) {
      if (conn.isAlive === false) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      conn.isAlive = false;
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }
  }, 30000);
}

/**
 * Broadcast to all clients subscribed to a channel.
 */
export function broadcast(channel: string, data: unknown): void {
  const message = JSON.stringify({ channel, data, timestamp: new Date().toISOString() });
  for (const [ws, state] of clients) {
    if (ws.readyState === ws.OPEN && state.subscriptions.has(channel)) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast to ALL connected clients (system messages).
 */
export function broadcastAll(data: unknown): void {
  const message = JSON.stringify({ type: 'system', data, timestamp: new Date().toISOString() });
  for (const [ws] of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Get connected client count.
 */
export function getClientCount(): number {
  return clients.size;
}
