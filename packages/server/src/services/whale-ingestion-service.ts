import { PolygonClient, WhaleRepository, MarketRepository } from '@polyrader/infra';
import type { LogEntry } from '@polyrader/infra';
import { WhaleScoringEngine } from '@polyrader/core';
import { logger } from '../utils/logger';
import type { WalletFollowService } from './wallet-follow-service';

/**
 * Ingests whale trading data from Polygon chain.
 *
 * Scans the Polymarket CTF Exchange contract for large trades
 * and stores them in the local SQLite database.
 */

// Polymarket CTF Exchange contract on Polygon
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// OrderFilled event signature
const ORDER_FILLED_TOPIC = '0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb';

// Minimum USDC value to be considered a "whale" trade
const MIN_TRADE_VALUE = 500;

export interface WhaleIngestionStatus {
  lastScanAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastIngestedCount: number;
}

export class WhaleIngestionService {
  private client = new PolygonClient();
  private repo = new WhaleRepository();
  private marketRepo = new MarketRepository();
  private scoringEngine = new WhaleScoringEngine();
  private walletFollowService?: WalletFollowService;
  // Cache tokenId → outcome to avoid querying all markets for every trade log
  private tokenOutcomeCache = new Map<string, string>();
  private status: WhaleIngestionStatus = {
    lastScanAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    lastError: null,
    lastIngestedCount: 0,
  };

  getStatus(): WhaleIngestionStatus {
    return { ...this.status };
  }

  setWalletFollowService(service: WalletFollowService): void {
    this.walletFollowService = service;
  }

  /**
   * Scan recent blocks for large Polymarket trades.
   * Processes the last ~500 blocks (~25 minutes on Polygon).
   */
  async scanRecentTrades(): Promise<number> {
    this.status.lastScanAt = new Date().toISOString();
    try {
      const currentBlock = await this.client.getBlockNumber();
      const fromBlock = '0x' + Math.max(0, currentBlock - 500).toString(16);
      const toBlock = '0x' + currentBlock.toString(16);

      const logs = await this.client.getLogs({
        address: CTF_EXCHANGE,
        topics: [ORDER_FILLED_TOPIC],
        fromBlock,
        toBlock,
      });

      let ingested = 0;
      for (const log of logs) {
        try {
          const trade = this.parseTradeLog(log);
          if (trade && trade.amount >= MIN_TRADE_VALUE) {
            const inserted = this.repo.insertTrade({
              address: trade.maker,
              txHash: log.transactionHash,
              marketId: trade.tokenId,
              outcome: trade.outcome,
              amount: trade.amount,
              price: trade.price,
              timestamp: new Date().toISOString(),
              type: trade.side,
            });

            // Only count and aggregate when the trade was actually inserted
            // (INSERT OR IGNORE returns changes === 0 for duplicate tx_hash)
            if (inserted) {
              await this.updateWhaleAggregate(trade.maker);
              if (this.walletFollowService) {
                const tradeRecord = {
                  txHash: log.transactionHash,
                  marketId: trade.tokenId,
                  outcome: trade.outcome,
                  amount: trade.amount,
                  price: trade.price,
                  timestamp: new Date().toISOString(),
                  type: trade.side,
                };
                void this.walletFollowService.processNewWhaleTrade(trade.maker, tradeRecord).catch((err) => {
                  logger.warn('Failed to process copy signal', { error: (err as Error).message });
                });
              }
              ingested++;
            }
          }
        } catch (err) {
          logger.warn('Failed to ingest whale trade', { error: (err as Error).message });
        }
      }

      this.status.lastSuccessAt = new Date().toISOString();
      this.status.consecutiveFailures = 0;
      this.status.lastError = null;
      this.status.lastIngestedCount = ingested;
      return ingested;
    } catch (err) {
      this.status.consecutiveFailures += 1;
      this.status.lastError = (err as Error).message;
      this.status.lastIngestedCount = 0;
      logger.error('[WhaleIngestion] Scan failed', {
        error: (err as Error).message,
        consecutiveFailures: this.status.consecutiveFailures,
      });
      return 0;
    }
  }

  /**
   * Parse a raw OrderFilled log into a structured trade.
   */
  private parseTradeLog(log: LogEntry): {
    maker: string;
    taker: string;
    tokenId: string;
    outcome: string;
    amount: number;
    price: number;
    side: 'buy' | 'sell';
  } | null {
    const data = log.data ?? '';
    const topics = log.topics ?? [];

    if (topics.length < 4 || data.length < 2) return null;

    // Strip 0x prefix from data
    const raw = data.startsWith('0x') ? data.slice(2) : data;
    if (raw.length < 256) return null; // Need 4 × 64 hex chars

    // Decode maker address from topics[2] (last 20 bytes = 40 hex chars)
    const maker = '0x' + (topics[2] ?? '').slice(26);
    // Decode taker address from topics[3] (last 20 bytes = 40 hex chars)
    const taker = '0x' + (topics[3] ?? '').slice(26);

    // Decode 4 uint256 from data (using BigInt for safety)
    const makerAssetId = BigInt('0x' + raw.slice(0, 64));
    const takerAssetId = BigInt('0x' + raw.slice(64, 128));
    const makerAmountFilled = BigInt('0x' + raw.slice(128, 192));
    const takerAmountFilled = BigInt('0x' + raw.slice(192, 256));

    // Determine side and extract tokenId
    // assetId == 0 means USDC (collateral)
    let side: 'buy' | 'sell';
    let tokenId: string;
    let usdcAmount: bigint;
    let shareAmount: bigint;

    if (makerAssetId === 0n) {
      // Maker gives USDC, receives shares → buy
      side = 'buy';
      tokenId = takerAssetId.toString();
      usdcAmount = makerAmountFilled;
      shareAmount = takerAmountFilled;
    } else if (takerAssetId === 0n) {
      // Maker gives shares, receives USDC → sell
      side = 'sell';
      tokenId = makerAssetId.toString();
      usdcAmount = takerAmountFilled;
      shareAmount = makerAmountFilled;
    } else {
      // Both non-zero: share-to-share trade (rare on Polymarket)
      // No USDC involved — can't determine dollar amount
      side = 'buy';
      tokenId = makerAssetId.toString();
      usdcAmount = 0n;
      shareAmount = makerAmountFilled;
    }

    // Convert from 6 decimals to human-readable
    const amount = Number(usdcAmount) / 1e6;
    const shares = Number(shareAmount) / 1e6;
    const price = shares > 0 ? amount / shares : 0;

    // Determine outcome (Yes/No) by looking up tokenId in market clobTokenIds
    const outcome = this.lookupOutcome(tokenId);

    return {
      maker,
      taker,
      tokenId,
      outcome,
      amount,
      price,
      side,
    };
  }

  /**
   * Look up the outcome (Yes/No) for a given tokenId by checking
   * market clobTokenIds in the database.
   */
  private lookupOutcome(tokenId: string): string {
    if (this.tokenOutcomeCache.has(tokenId)) {
      return this.tokenOutcomeCache.get(tokenId)!;
    }
    let outcome = 'Unknown';
    try {
      // Search all markets for a matching clobTokenId
      const markets = this.marketRepo.findAll(500);
      for (const market of markets) {
        if (market.clobTokenIds) {
          const idx = market.clobTokenIds.indexOf(tokenId);
          if (idx >= 0 && market.outcomes[idx]) {
            outcome = market.outcomes[idx];
            break;
          }
        }
      }
    } catch {
      // DB lookup failed
    }
    this.tokenOutcomeCache.set(tokenId, outcome);
    return outcome;
  }

  /**
   * Get recent whales sorted by last activity.
   */
  getRecentWhales(limit = 20) {
    return this.repo.findAll(limit);
  }

  /**
   * Get recent trades for a specific whale address.
   */
  getRecentTrades(address: string, limit = 10) {
    return this.repo.getTrades(address, limit);
  }

  /**
   * Update the whale aggregate row after a new trade.
   */
  private async updateWhaleAggregate(address: string): Promise<void> {
    const trades = this.repo.getTrades(address, 100);
    const existing = this.repo.findByAddress(address);

    const totalVolume = trades.reduce((sum, t) => sum + t.amount, 0);
    const activePositions = new Set(trades.map((t) => t.marketId)).size;

    const whale = this.scoringEngine.scoreWhale(
      address,
      trades,
      totalVolume,
      activePositions,
      existing?.winRate ?? 0,
      existing?.pnl ?? 0,
    );

    this.repo.upsert({
      address,
      label: existing?.label,
      totalVolume,
      totalPositions: trades.length,
      activePositions,
      winRate: existing?.winRate ?? 0,
      pnl: existing?.pnl ?? 0,
      suspiciousScore: whale.suspiciousScore,
      recentTrades: trades.slice(0, 10),
      lastActive: trades[0]?.timestamp ?? new Date().toISOString(),
    });
  }
}

/** Shared instance for cron + health monitoring */
export const sharedWhaleIngestion = new WhaleIngestionService();
