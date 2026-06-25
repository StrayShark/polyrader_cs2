import crypto from 'node:crypto';
import type {
  PolymarketBalance,
  PolymarketOpenOrder,
  PolymarketUserTrade,
} from '@polyrader/core';
import { fetchJsonWithBrowser } from '../../crawlers/browser-fetch.js';

const CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL ?? 'https://clob.polymarket.com';

export interface OrderBookSummary {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  hash: string;
  timestamp: string;
}

export interface PriceHistory {
  history: Array<{
    t: number;
    p: number;
  }>;
}

export interface PolymarketClobCredentials {
  address?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
}

export class PolymarketClobClient {
  private baseUrl: string;
  private credentials: PolymarketClobCredentials;

  constructor(baseUrl?: string, credentials?: PolymarketClobCredentials) {
    this.baseUrl = baseUrl ?? CLOB_API_URL;
    this.credentials = credentials ?? readCredentialsFromEnv();
  }

  async fetch<T>(path: string): Promise<T> {
    return fetchJsonWithBrowser<T>(`${this.baseUrl}${path}`);
  }

  async fetchAuthenticated<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const credentials = this.requireCredentials();
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const headers = this.createAuthHeaders(method, path, bodyText, credentials);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : bodyText,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`CLOB authenticated API error: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`);
    }
    return response.json() as Promise<T>;
  }

  getAccountStatus(): {
    hasApiCredentials: boolean;
    hasAddress: boolean;
    address?: string;
    canReadPrivate: boolean;
    message?: string;
  } {
    const hasApiCredentials = Boolean(
      this.credentials.apiKey &&
      this.credentials.apiSecret &&
      this.credentials.apiPassphrase,
    );
    const hasAddress = Boolean(this.credentials.address);
    return {
      hasApiCredentials,
      hasAddress,
      address: this.credentials.address,
      canReadPrivate: hasApiCredentials && hasAddress,
      message: !hasApiCredentials
        ? 'Polymarket L2 credentials are not configured'
        : !hasAddress
          ? 'Polymarket address is not configured'
          : undefined,
    };
  }

  /**
   * Get order book for a token.
   */
  async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
    return this.fetch<OrderBookSummary>(`/book?token_id=${tokenId}`);
  }

  /**
   * Get price history for a token.
   */
  async getPriceHistory(
    tokenId: string,
    interval: '1h' | '6h' | '1d' | '1w' | 'max' = '1d',
  ): Promise<PriceHistory> {
    return this.fetch<PriceHistory>(
      `/prices-history?market=${tokenId}&interval=${interval}&fidelity=60`,
    );
  }

  /**
   * Get midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const data = await this.fetch<{ mid: string }>(`/midpoint?token_id=${tokenId}`);
    return parseFloat(data.mid);
  }

  /**
   * Get spread for a token.
   */
  async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number }> {
    const book = await this.getOrderBook(tokenId);
    const bestBid = book.bids[0] ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks[0] ? parseFloat(book.asks[0].price) : 1;
    return {
      bid: bestBid,
      ask: bestAsk,
      spread: bestAsk - bestBid,
    };
  }

  async getOpenOrders(): Promise<PolymarketOpenOrder[]> {
    const data = await this.fetchAuthenticated<unknown[]>('GET', '/orders');
    return data.map((item) => this.mapOrder(item as Record<string, unknown>));
  }

  async getAuthenticatedTrades(limit = 100): Promise<PolymarketUserTrade[]> {
    const data = await this.fetchAuthenticated<unknown[]>('GET', `/trades?limit=${limit}`);
    return data.map((item) => this.mapTrade(item as Record<string, unknown>));
  }

  async getBalanceAllowance(assetType = 'COLLATERAL', tokenId?: string): Promise<PolymarketBalance> {
    const params = new URLSearchParams({ asset_type: assetType });
    if (tokenId) params.set('token_id', tokenId);
    const data = await this.fetchAuthenticated<Record<string, unknown>>('GET', `/balance-allowance?${params.toString()}`);
    return {
      assetType,
      tokenId,
      balance: numberFrom(data.balance ?? data.amount),
      allowance: optionalNumber(data.allowance),
      raw: data,
    };
  }

  private requireCredentials(): Required<PolymarketClobCredentials> {
    const { address, apiKey, apiSecret, apiPassphrase } = this.credentials;
    if (!address || !apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Polymarket L2 credentials require POLYMARKET_ADDRESS, POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE');
    }
    return { address, apiKey, apiSecret, apiPassphrase };
  }

  private createAuthHeaders(
    method: string,
    path: string,
    bodyText: string,
    credentials: Required<PolymarketClobCredentials>,
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${timestamp}${method.toUpperCase()}${path}${bodyText}`;
    const signature = crypto
      .createHmac('sha256', decodeBase64Url(credentials.apiSecret))
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return {
      POLY_ADDRESS: credentials.address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_API_KEY: credentials.apiKey,
      POLY_PASSPHRASE: credentials.apiPassphrase,
    };
  }

  private mapOrder(row: Record<string, unknown>): PolymarketOpenOrder {
    const originalSize = numberFrom(row.original_size ?? row.originalSize ?? row.size);
    const sizeMatched = numberFrom(row.size_matched ?? row.sizeMatched ?? row.matched);
    return {
      id: stringFrom(row.id ?? row.order_id ?? row.orderId),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      assetId: optionalString(row.asset_id ?? row.assetId ?? row.tokenId),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side),
      price: numberFrom(row.price),
      originalSize,
      sizeMatched,
      remainingSize: numberFrom(row.remaining_size ?? row.remainingSize) || Math.max(0, originalSize - sizeMatched),
      status: optionalString(row.status),
      createdAt: optionalString(row.created_at ?? row.createdAt),
      expiration: optionalString(row.expiration),
    };
  }

  private mapTrade(row: Record<string, unknown>): PolymarketUserTrade {
    const price = numberFrom(row.price);
    const size = numberFrom(row.size ?? row.amount);
    return {
      id: stringFrom(row.id ?? row.trade_id ?? row.tradeId ?? row.transactionHash),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      assetId: optionalString(row.asset_id ?? row.assetId ?? row.tokenId),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side ?? row.type),
      price,
      size,
      value: numberFrom(row.value ?? row.usdcValue) || price * size,
      fee: optionalNumber(row.fee),
      status: optionalString(row.status),
      timestamp: stringFrom(row.timestamp ?? row.created_at ?? row.createdAt),
      txHash: optionalString(row.transactionHash ?? row.txHash),
    };
  }
}

function readCredentialsFromEnv(): PolymarketClobCredentials {
  return {
    address: process.env.POLYMARKET_ADDRESS ?? process.env.POLYMARKET_FUNDER ?? process.env.POLY_ADDRESS,
    apiKey: process.env.POLYMARKET_API_KEY ?? process.env.POLY_API_KEY,
    apiSecret: process.env.POLYMARKET_API_SECRET ?? process.env.POLY_API_SECRET,
    apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE ?? process.env.POLY_API_PASSPHRASE,
  };
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function normalizeSide(value: unknown): 'buy' | 'sell' | undefined {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('buy') || text === 'b') return 'buy';
  if (text.includes('sell') || text === 's') return 'sell';
  return undefined;
}

function stringFrom(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function optionalString(value: unknown): string | undefined {
  const text = stringFrom(value);
  return text ? text : undefined;
}

function numberFrom(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function optionalNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
