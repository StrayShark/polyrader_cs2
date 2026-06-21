import { useEffect, useRef, useCallback, useState } from 'react';
import { getWsUrl } from '../utils/tauri-bridge';

type MessageHandler = (data: unknown) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const wsUrlRef = useRef<string>('');

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [latency, setLatency] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

    // Get WS URL (from Tauri bridge or fallback)
    if (!wsUrlRef.current) {
      wsUrlRef.current = await getWsUrl();
    }

    const ws = new WebSocket(wsUrlRef.current);

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;
      setLastEvent(new Date().toISOString());

      // Re-subscribe to all channels
      for (const channel of handlersRef.current.keys()) {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          setLatency(Date.now() - (data.sentAt ?? 0));
          return;
        }
        if (data.type === 'system') {
          setLastEvent(new Date().toISOString());
          return;
        }
        const channel = data.channel;
        if (channel && handlersRef.current.has(channel)) {
          handlersRef.current.get(channel)!.forEach((handler) => handler(data.data));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionState('disconnected');

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      reconnectAttemptRef.current++;

      reconnectTimerRef.current = setTimeout(() => { connect(); }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [connectionState]);

  const subscribe = useCallback((channel: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(channel)) {
      handlersRef.current.set(channel, new Set());
    }
    handlersRef.current.get(channel)!.add(handler);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    return () => {
      handlersRef.current.get(channel)?.delete(handler);
    };
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connectionState, latency, lastEvent, subscribe, send };
}
