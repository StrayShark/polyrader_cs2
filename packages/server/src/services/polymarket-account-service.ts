import type {
  PolymarketAccountOverview,
  PolymarketAccountDiagnostic,
  PolymarketBalance,
  PolymarketOpenOrder,
  PolymarketUserActivity,
  PolymarketUserPosition,
  PolymarketUserTrade,
} from '@polyrader/core';
import { PolymarketClobClient, PolymarketDataClient } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';

export class PolymarketAccountService {
  private dataClient = new PolymarketDataClient();
  private clobClient = new PolymarketClobClient();

  async getOverview(): Promise<PolymarketAccountOverview> {
    const status = this.clobClient.getAccountStatus();
    const address = status.address;
    const cacheKey = `polymarket:account:${address ?? 'missing'}`;
    const cached = await cacheGet<PolymarketAccountOverview>(cacheKey);
    if (cached) return cached;

    let totalPositionValue = 0;
    let positions: PolymarketUserPosition[] = [];
    let activity: PolymarketUserActivity[] = [];
    let trades: PolymarketUserTrade[] = [];
    let balances: PolymarketBalance[] = [];
    let openOrders: PolymarketOpenOrder[] = [];
    const diagnostics: PolymarketAccountDiagnostic[] = [];

    if (address) {
      const publicResults = await Promise.allSettled([
        this.dataClient.getTotalValue(address),
        this.dataClient.getCurrentPositions(address, 100),
        this.dataClient.getActivity(address, 100),
        this.dataClient.getTrades(address, 100),
      ]);
      const publicOperations = ['total-value', 'positions', 'activity', 'trades'];

      totalPositionValue = publicResults[0].status === 'fulfilled' ? publicResults[0].value : 0;
      positions = publicResults[1].status === 'fulfilled' ? publicResults[1].value : [];
      activity = publicResults[2].status === 'fulfilled' ? publicResults[2].value : [];
      trades = publicResults[3].status === 'fulfilled' ? publicResults[3].value : [];

      for (const [index, result] of publicResults.entries()) {
        diagnostics.push(toDiagnostic('data-api', publicOperations[index] ?? 'unknown', result));
        if (result.status === 'rejected') {
          logger.warn('Polymarket public account data fetch failed', { error: (result.reason as Error).message });
        }
      }
    }

    if (status.canReadPrivate) {
      const privateResults = await Promise.allSettled([
        this.clobClient.getBalanceAllowance(),
        this.clobClient.getOpenOrders(),
        this.clobClient.getAuthenticatedTrades(100),
      ]);
      const privateOperations = ['balance-allowance', 'open-orders', 'private-trades'];

      balances = privateResults[0].status === 'fulfilled' ? [privateResults[0].value] : [];
      openOrders = privateResults[1].status === 'fulfilled' ? privateResults[1].value : [];
      if (privateResults[2].status === 'fulfilled' && privateResults[2].value.length > 0) {
        trades = privateResults[2].value;
      }

      for (const [index, result] of privateResults.entries()) {
        diagnostics.push(toDiagnostic('clob-api', privateOperations[index] ?? 'unknown', result));
        if (result.status === 'rejected') {
          logger.warn('Polymarket private account data fetch failed', { error: (result.reason as Error).message });
        }
      }
    }

    const overview: PolymarketAccountOverview = {
      status,
      totalPositionValue,
      balances,
      positions,
      activity,
      trades,
      openOrders,
      diagnostics,
      updatedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, overview, 30);
    return overview;
  }
}

function toDiagnostic(
  source: PolymarketAccountDiagnostic['source'],
  operation: string,
  result: PromiseSettledResult<unknown>,
): PolymarketAccountDiagnostic {
  return {
    source,
    operation,
    ok: result.status === 'fulfilled',
    message: result.status === 'fulfilled' ? undefined : sanitizeError(result.reason),
    checkedAt: new Date().toISOString(),
  };
}

function sanitizeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.replace(/\s+/g, ' ').slice(0, 180);
}
