import WebSocket from 'ws';
import { MarketService } from './market-service';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';

const WS_URL = process.env.POLYMARKET_WS_URL ?? 'wss://ws-subscriptions-clob.polymarket.com/ws';

interface TokenSubscription {
  conditionId: string;
  tokenId: string;
}

export class PolymarketStreamService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tokenToMarket = new Map<string, string>();
  private marketService = new MarketService();

  async start(limit = 20): Promise<void> {
    try {
      const subscriptions = await this.loadSubscriptions(limit);
      if (subscriptions.length === 0) {
        logger.warn('Polymarket stream skipped: no token ids available');
        return;
      }
      this.connect(subscriptions);
    } catch (err) {
      logger.warn('Polymarket stream start failed', { error: (err as Error).message });
    }
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  private async loadSubscriptions(limit: number): Promise<TokenSubscription[]> {
    const markets = await this.marketService.getMarkets(limit, 0);
    const subscriptions: TokenSubscription[] = [];
    for (const market of markets) {
      for (const tokenId of market.clobTokenIds ?? []) {
        subscriptions.push({ conditionId: market.conditionId, tokenId });
        this.tokenToMarket.set(tokenId, market.conditionId);
      }
    }
    return subscriptions;
  }

  private connect(subscriptions: TokenSubscription[]): void {
    const url = WS_URL.endsWith('/market') ? WS_URL : `${WS_URL.replace(/\/$/, '')}/market`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      const assetIds = subscriptions.map((subscription) => subscription.tokenId);
      ws.send(JSON.stringify({
        type: 'market',
        assets_ids: assetIds,
      }));
      logger.info('Polymarket stream connected', { assets: assetIds.length });
    });

    ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    ws.on('close', () => {
      logger.warn('Polymarket stream closed, scheduling reconnect');
      this.scheduleReconnect(subscriptions);
    });

    ws.on('error', (err) => {
      logger.warn('Polymarket stream error', { error: err.message });
    });
  }

  private scheduleReconnect(subscriptions: TokenSubscription[]): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(subscriptions);
    }, 15_000);
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events) {
      const payload = event as Record<string, unknown>;
      const tokenId = String(payload.asset_id ?? payload.assetId ?? payload.token_id ?? payload.tokenId ?? '');
      const conditionId = tokenId ? this.tokenToMarket.get(tokenId) : undefined;
      const normalized = {
        type: String(payload.event_type ?? payload.type ?? 'market'),
        conditionId,
        tokenId,
        price: numberOrUndefined(payload.price),
        size: numberOrUndefined(payload.size),
        side: payload.side ? String(payload.side).toLowerCase() : undefined,
        raw: payload,
      };

      broadcast('prices', normalized);
      if (conditionId) {
        broadcast(`market:${conditionId}`, normalized);
      }
    }
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
