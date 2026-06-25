import type { Whale, AddressGraph, WhaleDetail } from '@polyrader/core';
import { WhaleScoringEngine } from '@polyrader/core';
import { WhaleRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { WalletPerformanceService } from './wallet-performance-service';

export class WhaleService {
  private engine = new WhaleScoringEngine();
  private whaleRepo = new WhaleRepository();
  private performanceService = new WalletPerformanceService();

  async getWhales(options: {
    limit?: number;
    sort?: 'volume' | 'win_rate';
    minSamples?: number;
    minWinRate?: number;
  } = {}): Promise<Whale[]> {
    const limit = options.limit ?? 50;
    const sort = options.sort ?? 'volume';
    const minSamples = options.minSamples ?? 5;
    const minWinRate = options.minWinRate ?? 0;
    const cacheKey = `whales:${sort}:${limit}:${minSamples}:${minWinRate}`;
    const cached = await cacheGet<Whale[]>(cacheKey);
    if (cached) return cached;

    const whales = sort === 'win_rate'
      ? this.whaleRepo.findByWinRate(limit, minSamples, minWinRate)
      : this.whaleRepo.findAll(limit);

    // Re-score each whale with fresh correlation data from the DB.
    // The engine requires trades + correlation data for accurate scoring.
    const scored = whales.map((w) => {
      const trades = this.whaleRepo.getTrades(w.address, 100);
      const correlationData = this.whaleRepo.findCorrelationData(w.address);
      return this.engine.scoreWhale(
        w.address,
        trades,
        w.totalVolume,
        w.activePositions,
        w.winRate,
        w.pnl,
        correlationData,
      );
    });

    const ranked = this.engine.rankWhales(scored);

    await cacheSet(cacheKey, ranked, 120);
    return ranked;
  }

  async getWhale(address: string): Promise<Whale | null> {
    const cacheKey = `whale:${address}`;
    const cached = await cacheGet<Whale>(cacheKey);
    if (cached) return cached;

    const whale = await this.whaleRepo.findByAddress(address);
    if (whale) {
      await cacheSet(cacheKey, whale, 120);
    }
    return whale;
  }

  async getWhaleDetail(address: string): Promise<WhaleDetail | null> {
    const normalized = address.toLowerCase();
    let whale = await this.getWhale(normalized);
    if (!whale) {
      const trades = this.whaleRepo.getTrades(normalized, 1);
      if (trades.length === 0) return null;
      whale = this.engine.scoreWhale(
        normalized,
        this.whaleRepo.getTrades(normalized, 100),
        trades.reduce((sum, t) => sum + t.amount, 0),
        1,
        0,
        0,
      );
    } else {
      const trades = this.whaleRepo.getTrades(normalized, 100);
      const correlationData = this.whaleRepo.findCorrelationData(normalized);
      whale = this.engine.scoreWhale(
        normalized,
        trades,
        whale.totalVolume,
        whale.activePositions,
        whale.winRate,
        whale.pnl,
        correlationData,
      );
    }

    return this.performanceService.buildWhaleDetail(normalized, whale);
  }

  async getAddressGraph(): Promise<AddressGraph> {
    const cacheKey = 'whales:graph';
    const cached = await cacheGet<AddressGraph>(cacheKey);
    if (cached) return cached;

    const graph = this.whaleRepo.getAddressGraph();
    await cacheSet(cacheKey, graph, 120);
    return graph;
  }
}
