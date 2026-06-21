import type { Whale, AddressGraph } from '@polyrader/core';
import { WhaleScoringEngine } from '@polyrader/core';
import { WhaleRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';

export class WhaleService {
  private engine = new WhaleScoringEngine();
  private whaleRepo = new WhaleRepository();

  async getWhales(limit = 50): Promise<Whale[]> {
    const cacheKey = `whales:${limit}`;
    const cached = await cacheGet<Whale[]>(cacheKey);
    if (cached) return cached;

    const whales = await this.whaleRepo.findAll(limit);

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

  async getAddressGraph(): Promise<AddressGraph> {
    const cacheKey = 'whales:graph';
    const cached = await cacheGet<AddressGraph>(cacheKey);
    if (cached) return cached;

    const graph = this.whaleRepo.getAddressGraph();
    await cacheSet(cacheKey, graph, 120);
    return graph;
  }
}
