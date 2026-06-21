const WS_URL = process.env.POLYMARKET_WS_URL ?? 'wss://ws-subscriptions-clob.polymarket.com/ws';

type MessageHandler = (data: unknown) => void;

interface WsMarketMessage {
  price?: string;
  last_trade_price?: string;
  timestamp?: string;
}

interface WsTradeMessage {
  price?: string;
  size?: string;
  side?: string;
}

export class PolymarketWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private isConnected = false;
  private intentionalClose = false;
  private reconnectAttempts = 0;

  private static readonly BASE_RECONNECT_DELAY = 1000;
  private static readonly MAX_RECONNECT_DELAY = 30000;
  private static readonly MAX_RECONNECT_ATTEMPTS = 20;

  constructor(url?: string) {
    this.url = url ?? WS_URL;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('Polymarket WS connected');
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        const channel = data.channel ?? data.type;
        if (channel && this.handlers.has(channel)) {
          this.handlers.get(channel)!.forEach((handler) => handler(data));
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      if (this.intentionalClose) return;
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('Polymarket WS error:', err);
    };
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    // Send subscription if connected
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    return () => {
      this.handlers.get(channel)?.delete(handler);
      if (this.handlers.get(channel)?.size === 0) {
        this.handlers.delete(channel);
        if (this.isConnected && this.ws) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
        }
      }
    };
  }

  /**
   * Subscribe to market price updates.
   */
  subscribeMarket(assetId: string, handler: (price: number, timestamp: string) => void): () => void {
    const channel = `market.${assetId}`;
    return this.subscribe(channel, (data: unknown) => {
      const msg = data as WsMarketMessage;
      const price = parseFloat(msg.price ?? msg.last_trade_price ?? '0');
      const timestamp = msg.timestamp ?? new Date().toISOString();
      handler(price, timestamp);
    });
  }

  /**
   * Subscribe to last trade price.
   */
  subscribeLastTrade(assetId: string, handler: (price: number, size: number, side: string) => void): () => void {
    const channel = `last_trade_price.${assetId}`;
    return this.subscribe(channel, (data: unknown) => {
      const msg = data as WsTradeMessage;
      const price = parseFloat(msg.price ?? '0');
      const size = parseFloat(msg.size ?? '0');
      const side = msg.side ?? 'BUY';
      handler(price, size, side);
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  private resubscribe(): void {
    for (const channel of this.handlers.keys()) {
      this.ws?.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= PolymarketWsClient.MAX_RECONNECT_ATTEMPTS) {
      console.error(`Polymarket WS: max reconnect attempts (${PolymarketWsClient.MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
      return;
    }

    // Exponential backoff: delay = min(base * 2^attempts, max) + jitter
    const exponentialDelay = Math.min(
      PolymarketWsClient.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      PolymarketWsClient.MAX_RECONNECT_DELAY,
    );
    const jitter = Math.random() * 1000; // 0-1000ms jitter to prevent thundering herd
    const delay = Math.min(exponentialDelay + jitter, PolymarketWsClient.MAX_RECONNECT_DELAY);

    this.reconnectAttempts++;
    console.log(`Polymarket WS: reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
