import type {
  MarketBehaviorResult,
  OrderBookSnapshot,
  PolymarketHolder,
  PolymarketMarketPosition,
  SignalTuningConfigInput,
  Whale,
  WhaleTrade,
} from '../types/index';
import { mergeSignalTuningConfig } from '../scoring/weights';
import { MeanReversionEngine, type PricePoint } from './mean-reversion-engine';

export interface MarketBehaviorInput {
  marketId?: string;
  marketProb: number;
  priceHistory: PricePoint[];
  orderBook?: OrderBookSnapshot;
  whaleTrades?: WhaleTrade[];
  whales?: Whale[];
  holders?: PolymarketHolder[];
  marketPositions?: PolymarketMarketPosition[];
  primaryOutcome?: string;
  marketVolume?: number;
  liquidity?: number;
  tuningConfig?: SignalTuningConfigInput;
}

interface OrderBookMetrics {
  imbalance: number;
  spread: number;
  slippageRisk: number;
  topDepth: number;
  concentrationRisk: number;
}

/**
 * MarketBehaviorEngine turns price action, capital pressure, and whale flow
 * into a probability signal that can be compared with the market price.
 */
export class MarketBehaviorEngine {
  private meanReversionEngine = new MeanReversionEngine();

  analyze(input: MarketBehaviorInput): MarketBehaviorResult {
    const tuningConfig = mergeSignalTuningConfig(input.tuningConfig);
    const marketProb = clamp(input.marketProb, 0.01, 0.99);
    const prices = input.priceHistory.length > 0
      ? input.priceHistory
      : [{ timestamp: new Date().toISOString(), price: marketProb }];

    const meanReversion = this.meanReversionEngine.analyze(prices);
    const orderBookMetrics = this.calculateOrderBookMetrics(input.orderBook);
    const capitalWeightedProb = this.calculateCapitalWeightedProb(marketProb, orderBookMetrics);
    const rawWhaleProb = this.calculateWhaleAdjustedProb(
      marketProb,
      input.whaleTrades ?? [],
      input.primaryOutcome,
    );
    const smartMoneyProb = this.calculateSmartMoneyProb(
      marketProb,
      input.whales ?? [],
      input.primaryOutcome,
      input.marketId,
    );
    const holderMetrics = this.calculateHolderMetrics(
      marketProb,
      input.holders ?? [],
      input.marketPositions ?? [],
      input.primaryOutcome,
    );
    const whaleAdjustedProb = input.whales && input.whales.length > 0
      ? rawWhaleProb * 0.35 + smartMoneyProb * 0.65
      : rawWhaleProb;
    const reversion = this.calculateMeanReversionProb(marketProb, meanReversion, {
      orderBookImbalance: orderBookMetrics.imbalance,
      smartMoneyEdge: smartMoneyProb - marketProb,
      liquidity: input.liquidity ?? 0,
      marketVolume: input.marketVolume ?? 0,
    });
    const concentrationRisk = orderBookMetrics.concentrationRisk;
    const bubbleScore = this.calculateBubbleScore(
      meanReversion.zScore,
      Math.max(concentrationRisk, holderMetrics.concentrationRisk),
      input.liquidity ?? 0,
      input.marketVolume ?? 0,
      orderBookMetrics.slippageRisk,
    );

    const weights = {
      capital: input.orderBook
        ? tuningConfig.behaviorWeights.capitalWithOrderBook
        : tuningConfig.behaviorWeights.capitalWithoutOrderBook,
      reversion: prices.length >= 3
        ? tuningConfig.behaviorWeights.reversionWithHistory
        : tuningConfig.behaviorWeights.reversionWithoutHistory,
      whale: ((input.whaleTrades?.length ?? 0) > 0 || (input.whales?.length ?? 0) > 0)
        ? tuningConfig.behaviorWeights.whaleWithFlow
        : tuningConfig.behaviorWeights.whaleWithoutFlow,
      market: tuningConfig.behaviorWeights.market,
      holder: holderMetrics.hasData ? 0.22 : 0,
    };
    const totalWeight = weights.capital + weights.reversion + weights.whale + weights.market + weights.holder;
    const probability = clamp(
      totalWeight > 0 ? (
        capitalWeightedProb * weights.capital +
        reversion.probability * weights.reversion +
        whaleAdjustedProb * weights.whale +
        holderMetrics.probability * weights.holder +
        marketProb * weights.market
      ) / totalWeight : marketProb,
      0.01,
      0.99,
    );

    const confidence = this.calculateConfidence({
      pricePoints: prices.length,
      hasOrderBook: !!input.orderBook,
      whaleTradeCount: input.whaleTrades?.length ?? 0,
      smartWhaleCount: input.whales?.filter((whale) => this.smartMoneyScore(whale) >= 0.55).length ?? 0,
      holderCount: holderMetrics.holderCount,
      liquidity: input.liquidity ?? 0,
      marketVolume: input.marketVolume ?? 0,
      topDepth: orderBookMetrics.topDepth,
      spread: orderBookMetrics.spread,
      bubbleScore,
    });

    const edge = probability - marketProb;
    const direction: MarketBehaviorResult['direction'] =
      edge > 0.03 ? 'buy_yes' : edge < -0.03 ? 'buy_no' : 'neutral';

    return {
      probability: round4(probability),
      confidence: round4(confidence),
      capitalWeightedProb: round4(capitalWeightedProb),
      meanReversionProb: round4(reversion.probability),
      whaleAdjustedProb: round4(whaleAdjustedProb),
      smartMoneyProb: round4(smartMoneyProb),
      holderWeightedProb: round4(holderMetrics.probability),
      zScore: meanReversion.zScore,
      bubbleScore: round4(bubbleScore),
      concentrationRisk: round4(Math.max(concentrationRisk, holderMetrics.concentrationRisk)),
      holderConcentrationRisk: round4(holderMetrics.concentrationRisk),
      holderDirectionalBias: round4(holderMetrics.directionalBias),
      topHolders: holderMetrics.topHolders,
      orderBookImbalance: round4(orderBookMetrics.imbalance),
      spread: round4(orderBookMetrics.spread),
      slippageRisk: round4(orderBookMetrics.slippageRisk),
      topDepth: round4(orderBookMetrics.topDepth),
      meanReversionSuppressed: reversion.suppressed,
      direction,
      reasons: this.buildReasons({
        marketProb,
        probability,
        capitalWeightedProb,
        meanReversionProb: reversion.probability,
        whaleAdjustedProb,
        smartMoneyProb,
        holderWeightedProb: holderMetrics.probability,
        zScore: meanReversion.zScore,
        concentrationRisk: Math.max(concentrationRisk, holderMetrics.concentrationRisk),
        holderConcentrationRisk: holderMetrics.concentrationRisk,
        holderDirectionalBias: holderMetrics.directionalBias,
        orderBookImbalance: orderBookMetrics.imbalance,
        spread: orderBookMetrics.spread,
        slippageRisk: orderBookMetrics.slippageRisk,
        bubbleScore,
        whaleTradeCount: input.whaleTrades?.length ?? 0,
        smartWhaleCount: input.whales?.filter((whale) => this.smartMoneyScore(whale) >= 0.55).length ?? 0,
        holderCount: holderMetrics.holderCount,
        meanReversionSuppressed: reversion.suppressed,
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  private calculateCapitalWeightedProb(marketProb: number, metrics: OrderBookMetrics): number {
    if (metrics.topDepth <= 0) {
      return marketProb;
    }

    const spreadPenalty = clamp(metrics.spread / 0.08, 0, 1) * 0.02;
    const liquidityBoost = (1 - metrics.slippageRisk) * 0.04;
    return clamp(marketProb + metrics.imbalance * (0.08 + liquidityBoost) - spreadPenalty, 0.01, 0.99);
  }

  private calculateMeanReversionProb(
    marketProb: number,
    meanReversion: ReturnType<MeanReversionEngine['analyze']>,
    context: {
      orderBookImbalance: number;
      smartMoneyEdge: number;
      liquidity: number;
      marketVolume: number;
    },
  ): { probability: number; suppressed: boolean } {
    if (!meanReversion.isOverreacted) return { probability: marketProb, suppressed: false };

    const shockDirection = Math.sign(marketProb - meanReversion.reversionTarget);
    const orderBookConfirmsMove =
      shockDirection !== 0 &&
      Math.sign(context.orderBookImbalance) === shockDirection &&
      Math.abs(context.orderBookImbalance) >= 0.2;
    const smartMoneyConfirmsMove =
      shockDirection !== 0 &&
      Math.sign(context.smartMoneyEdge) === shockDirection &&
      Math.abs(context.smartMoneyEdge) >= 0.025;
    const hasMeaningfulLiquidity = context.liquidity >= 2_500 || context.marketVolume >= 5_000;
    const suppressed = hasMeaningfulLiquidity && (orderBookConfirmsMove || smartMoneyConfirmsMove);

    const baseStrength = clamp(Math.abs(meanReversion.zScore) / 4, 0.1, 0.4);
    const strength = suppressed ? baseStrength * 0.25 : baseStrength;
    const probability = clamp(
      marketProb + (meanReversion.reversionTarget - marketProb) * strength,
      0.01,
      0.99,
    );
    return { probability, suppressed };
  }

  private calculateWhaleAdjustedProb(
    marketProb: number,
    whaleTrades: WhaleTrade[],
    primaryOutcome?: string,
  ): number {
    if (whaleTrades.length === 0) return marketProb;

    let directionalAmount = 0;
    let totalAmount = 0;
    for (const trade of whaleTrades) {
      const amount = Math.max(0, trade.amount);
      if (amount === 0) continue;
      totalAmount += amount;

      const outcome = trade.outcome.toLowerCase();
      const primary = (primaryOutcome ?? 'yes').toLowerCase();
      const isPrimary = outcome === primary || outcome === 'yes' || outcome.includes(primary);
      const outcomeSign = isPrimary ? 1 : -1;
      const tradeSign = trade.type === 'buy' ? 1 : -1;
      directionalAmount += amount * outcomeSign * tradeSign;
    }

    if (totalAmount <= 0) return marketProb;
    const netFlow = clamp(directionalAmount / totalAmount, -1, 1);
    return clamp(marketProb + netFlow * 0.08, 0.01, 0.99);
  }

  private calculateSmartMoneyProb(
    marketProb: number,
    whales: Whale[],
    primaryOutcome?: string,
    marketId?: string,
  ): number {
    let directionalAmount = 0;
    let totalWeightedAmount = 0;

    for (const whale of whales) {
      const score = this.smartMoneyScore(whale);
      if (score <= 0.15) continue;

      const trades = whale.recentTrades.filter((trade) => !marketId || trade.marketId === marketId);
      for (const trade of trades) {
        const amount = Math.max(0, trade.amount) * score;
        if (amount === 0) continue;

        const outcome = trade.outcome.toLowerCase();
        const primary = (primaryOutcome ?? 'yes').toLowerCase();
        const isPrimary = outcome === primary || outcome === 'yes' || outcome.includes(primary);
        const outcomeSign = isPrimary ? 1 : -1;
        const tradeSign = trade.type === 'buy' ? 1 : -1;

        totalWeightedAmount += amount;
        directionalAmount += amount * outcomeSign * tradeSign;
      }
    }

    if (totalWeightedAmount <= 0) return marketProb;
    const smartFlow = clamp(directionalAmount / totalWeightedAmount, -1, 1);
    return clamp(marketProb + smartFlow * 0.12, 0.01, 0.99);
  }

  private calculateHolderMetrics(
    marketProb: number,
    holders: PolymarketHolder[],
    marketPositions: PolymarketMarketPosition[],
    primaryOutcome?: string,
  ): {
    hasData: boolean;
    probability: number;
    concentrationRisk: number;
    directionalBias: number;
    holderCount: number;
    topHolders: PolymarketHolder[];
  } {
    const holderRows = holders.filter((holder) => holder.value > 0 || holder.shares > 0);
    const positionRows = marketPositions.filter((position) => position.value > 0 || position.shares > 0);
    const rows = holderRows.length > 0
      ? holderRows.map((holder) => ({
        address: holder.address,
        outcome: holder.outcome,
        tokenId: holder.tokenId,
        shares: holder.shares,
        value: holder.value,
        avgPrice: holder.avgPrice,
        percentage: holder.percentage,
      }))
      : positionRows.map((position) => ({
        address: position.address,
        outcome: position.outcome,
        tokenId: position.tokenId,
        shares: position.shares,
        value: position.value,
        avgPrice: position.avgPrice,
        percentage: undefined,
      }));

    if (rows.length === 0) {
      return {
        hasData: false,
        probability: marketProb,
        concentrationRisk: 0,
        directionalBias: 0,
        holderCount: 0,
        topHolders: [],
      };
    }

    const primary = (primaryOutcome ?? 'yes').toLowerCase();
    let primaryValue = 0;
    let oppositeValue = 0;
    let totalValue = 0;
    for (const row of rows) {
      const value = Math.max(0, row.value || row.shares * (row.avgPrice ?? marketProb));
      if (value <= 0) continue;
      totalValue += value;

      const outcome = String(row.outcome ?? '').toLowerCase();
      const isPrimary = outcome === primary || outcome === 'yes' || outcome.includes(primary);
      if (isPrimary) primaryValue += value;
      else oppositeValue += value;
    }

    const sizes = rows.map((row) => Math.max(0, row.value || row.shares)).filter((value) => value > 0);
    const sizeTotal = sizes.reduce((sum, value) => sum + value, 0);
    const hhi = sizeTotal > 0
      ? sizes.reduce((sum, value) => {
        const share = value / sizeTotal;
        return sum + share * share;
      }, 0)
      : 0;

    const directionalBias = totalValue > 0 ? (primaryValue - oppositeValue) / totalValue : 0;
    const probability = clamp(marketProb + directionalBias * 0.1, 0.01, 0.99);
    const topHolders = rows
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((row) => ({
        address: row.address,
        outcome: row.outcome,
        tokenId: row.tokenId,
        shares: row.shares,
        value: row.value,
        avgPrice: row.avgPrice,
        percentage: row.percentage ?? (totalValue > 0 ? row.value / totalValue : undefined),
      }));

    return {
      hasData: true,
      probability,
      concentrationRisk: clamp(hhi * 3, 0, 1),
      directionalBias: clamp(directionalBias, -1, 1),
      holderCount: rows.length,
      topHolders,
    };
  }

  private smartMoneyScore(whale: Whale): number {
    const winRateScore = clamp((whale.winRate - 0.45) / 0.25, 0, 1) * 0.35;
    const pnlScore = whale.pnl > 0 ? clamp(Math.log10(whale.pnl + 1) / 5, 0, 1) * 0.25 : 0;
    const volumeScore = clamp(Math.log10(whale.totalVolume + 1) / 6, 0, 1) * 0.2;
    const activityScore = clamp(whale.activePositions / 20, 0, 1) * 0.1;
    const suspiciousPenalty = clamp((whale.suspiciousScore?.total ?? 0) / 100, 0, 1) * 0.35;
    return clamp(0.1 + winRateScore + pnlScore + volumeScore + activityScore - suspiciousPenalty, 0, 1);
  }

  private calculateOrderBookMetrics(orderBook?: OrderBookSnapshot): OrderBookMetrics {
    if (!orderBook || (orderBook.bids.length === 0 && orderBook.asks.length === 0)) {
      return {
        imbalance: 0,
        spread: 0,
        slippageRisk: 0.5,
        topDepth: 0,
        concentrationRisk: 0,
      };
    }

    const bids = orderBook.bids
      .filter((level) => level.price > 0 && level.size > 0)
      .sort((a, b) => b.price - a.price);
    const asks = orderBook.asks
      .filter((level) => level.price > 0 && level.size > 0)
      .sort((a, b) => a.price - b.price);
    const bidValue = bids.slice(0, 10).reduce((sum, level) => sum + level.price * level.size, 0);
    const askValue = asks.slice(0, 10).reduce((sum, level) => sum + (1 - level.price) * level.size, 0);
    const topDepth = bidValue + askValue;
    const imbalance = topDepth > 0 ? (bidValue - askValue) / topDepth : 0;
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    const spread = Math.max(0, bestAsk - bestBid);
    const slippageRisk = this.estimateSlippageRisk(asks, 1_000);
    const concentrationRisk = this.calculateConcentrationRisk(orderBook);

    return {
      imbalance: clamp(imbalance, -1, 1),
      spread,
      slippageRisk,
      topDepth,
      concentrationRisk,
    };
  }

  private estimateSlippageRisk(asks: OrderBookSnapshot['asks'], targetNotional: number): number {
    if (asks.length === 0) return 0.8;
    const sorted = [...asks]
      .filter((level) => level.price > 0 && level.size > 0)
      .sort((a, b) => a.price - b.price);
    const bestAsk = sorted[0]?.price ?? 1;
    let remaining = targetNotional;
    let cost = 0;
    let shares = 0;

    for (const level of sorted) {
      const levelNotional = level.price * level.size;
      const spend = Math.min(remaining, levelNotional);
      if (spend <= 0) break;
      cost += spend;
      shares += spend / level.price;
      remaining -= spend;
      if (remaining <= 0) break;
    }

    if (shares <= 0 || cost <= 0) return 0.8;
    const avgPrice = cost / shares;
    const priceImpact = bestAsk > 0 ? (avgPrice - bestAsk) / bestAsk : 0;
    const fillPenalty = remaining > 0 ? remaining / targetNotional : 0;
    return clamp(priceImpact * 5 + fillPenalty, 0, 1);
  }

  private calculateConcentrationRisk(orderBook: OrderBookSnapshot): number {
    const sizes = [...orderBook.bids, ...orderBook.asks]
      .map((level) => Math.max(0, level.size))
      .filter((size) => size > 0);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (total <= 0) return 0;

    const hhi = sizes.reduce((sum, size) => {
      const share = size / total;
      return sum + share * share;
    }, 0);

    return clamp(hhi * 3, 0, 1);
  }

  private calculateBubbleScore(
    zScore: number,
    concentrationRisk: number,
    liquidity: number,
    marketVolume: number,
    slippageRisk: number,
  ): number {
    const zComponent = clamp(Math.abs(zScore) / 4, 0, 1);
    const combinedDepth = liquidity + marketVolume * 0.25;
    const lowLiquidity = combinedDepth > 0 ? clamp(1 - Math.log10(combinedDepth + 1) / 5, 0, 1) : 0.5;
    return clamp(zComponent * 0.38 + concentrationRisk * 0.28 + lowLiquidity * 0.18 + slippageRisk * 0.16, 0, 1);
  }

  private calculateConfidence(input: {
    pricePoints: number;
    hasOrderBook: boolean;
    whaleTradeCount: number;
    smartWhaleCount: number;
    holderCount: number;
    liquidity: number;
    marketVolume: number;
    topDepth: number;
    spread: number;
    bubbleScore: number;
  }): number {
    const priceScore = clamp(input.pricePoints / 20, 0, 1) * 0.35;
    const spreadPenalty = clamp(input.spread / 0.08, 0, 1) * 0.08;
    const orderBookScore = input.hasOrderBook
      ? clamp(Math.log10(input.topDepth + 1) / 5, 0, 1) * 0.25 - spreadPenalty
      : 0;
    const whaleScore = (
      clamp(input.whaleTradeCount / 8, 0, 1) * 0.1 +
      clamp(input.smartWhaleCount / 4, 0, 1) * 0.14
    );
    const holderScore = clamp(input.holderCount / 30, 0, 1) * 0.12;
    const depth = input.liquidity + input.marketVolume * 0.25;
    const liquidityScore = depth > 0 ? clamp(Math.log10(depth + 1) / 5, 0, 1) * 0.2 : 0;
    const raw = priceScore + orderBookScore + whaleScore + holderScore + liquidityScore;
    return clamp(raw * (1 - input.bubbleScore * 0.25), 0.05, 0.95);
  }

  private buildReasons(input: {
    marketProb: number;
    probability: number;
    capitalWeightedProb: number;
    meanReversionProb: number;
    whaleAdjustedProb: number;
    smartMoneyProb: number;
    holderWeightedProb: number;
    zScore: number;
    concentrationRisk: number;
    holderConcentrationRisk: number;
    holderDirectionalBias: number;
    orderBookImbalance: number;
    spread: number;
    slippageRisk: number;
    bubbleScore: number;
    whaleTradeCount: number;
    smartWhaleCount: number;
    holderCount: number;
    meanReversionSuppressed: boolean;
  }): string[] {
    const reasons: string[] = [];
    const edge = input.probability - input.marketProb;

    if (Math.abs(edge) >= 0.03) {
      reasons.push(edge > 0 ? 'Behavior signal above market price' : 'Behavior signal below market price');
    }
    if (Math.abs(input.zScore) >= 2) {
      reasons.push(`Price overreaction detected (z=${input.zScore.toFixed(2)})`);
    }
    if (Math.abs(input.capitalWeightedProb - input.marketProb) >= 0.03) {
      reasons.push('Order book capital pressure diverges from market price');
    }
    if (input.whaleTradeCount > 0 && Math.abs(input.whaleAdjustedProb - input.marketProb) >= 0.02) {
      reasons.push('Recent whale flow is directional');
    }
    if (input.smartWhaleCount > 0 && Math.abs(input.smartMoneyProb - input.marketProb) >= 0.025) {
      reasons.push('Smart-money flow is directional');
    }
    if (input.holderCount > 0 && Math.abs(input.holderWeightedProb - input.marketProb) >= 0.02) {
      reasons.push('Holder positioning diverges from market price');
    }
    if (input.holderConcentrationRisk >= 0.5) {
      reasons.push('Top-holder concentration risk is elevated');
    }
    if (Math.abs(input.holderDirectionalBias) >= 0.25) {
      reasons.push(`Holder directional bias ${(input.holderDirectionalBias * 100).toFixed(0)}%`);
    }
    if (Math.abs(input.orderBookImbalance) >= 0.2) {
      reasons.push(`Order book imbalance ${(input.orderBookImbalance * 100).toFixed(0)}%`);
    }
    if (input.spread >= 0.05 || input.slippageRisk >= 0.6) {
      reasons.push('Execution quality risk is elevated');
    }
    if (input.meanReversionSuppressed) {
      reasons.push('Mean reversion muted because capital flow confirms the move');
    }
    if (input.concentrationRisk >= 0.5) {
      reasons.push('Order book concentration risk is elevated');
    }
    if (input.bubbleScore >= 0.6) {
      reasons.push('Bubble risk is elevated');
    }

    return reasons.length > 0 ? reasons : ['Behavior signal is close to market consensus'];
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
