import type {
  BankrollConfig,
  BankrollState,
  AllocationPlan,
  AllocationOpportunity,
} from '@polyrader/core';
import { BetAllocationEngine, PromptEngine, KeyManager } from '@polyrader/core';
import { AllocationRepository, LLMRepository, LLMClientFactory, CircuitBreakerLLMClient } from '@polyrader/infra';
import { logger } from '../utils/logger';

/**
 * AllocationService — Manages bankroll config, computes bankroll state,
 * and generates AI-driven bet allocation plans.
 *
 * Two allocation modes:
 *   1. Algorithmic — Modified Kelly with bankroll constraints (no LLM call)
 *   2. LLM-driven  — Asks an LLM to allocate based on capital + target return
 */
export class AllocationService {
  private allocRepo = new AllocationRepository();
  private llmRepo = new LLMRepository();
  private engine = new BetAllocationEngine();
  private promptEngine = new PromptEngine();
  private keyManager: KeyManager | null = null;

  private getKeyManager(): KeyManager {
    if (!this.keyManager) {
      const encKey = process.env.POLYRADER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
      if (!encKey) {
        throw new Error('Encryption key is required. Set POLYRADER_ENCRYPTION_KEY or ENCRYPTION_KEY.');
      }
      this.keyManager = new KeyManager(encKey);
    }
    return this.keyManager;
  }

  // ============================================================
  // Bankroll Config
  // ============================================================

  getBankrollConfig(): BankrollConfig {
    return this.allocRepo.getBankrollConfig();
  }

  updateBankrollConfig(config: Omit<BankrollConfig, 'updatedAt'>): BankrollConfig {
    return this.allocRepo.updateBankrollConfig(config);
  }

  /**
   * Compute runtime bankroll state from config + bet history.
   */
  getBankrollState(): BankrollState {
    const config = this.getBankrollConfig();

    // Pending bets lock capital
    const pendingBets = this.llmRepo.getPendingBets();
    const usedCapital = pendingBets.reduce((s, b) => s + b.amount, 0);

    // Settled bets contribute to realized PnL
    const allBets = this.llmRepo.getBets(500);
    const settledBets = allBets.filter((b) => b.result !== 'pending');
    const realizedPnL = settledBets.reduce((s, b) => s + b.profitLoss, 0);

    const availableCapital = Math.max(0, config.totalCapital - usedCapital);
    const netCapital = availableCapital + realizedPnL;
    const targetProfit = netCapital * config.targetReturnRate;

    return {
      totalCapital: config.totalCapital,
      usedCapital: Math.round(usedCapital * 100) / 100,
      availableCapital: Math.round(availableCapital * 100) / 100,
      realizedPnL: Math.round(realizedPnL * 100) / 100,
      netCapital: Math.round(netCapital * 100) / 100,
      targetReturnRate: config.targetReturnRate,
      targetProfit: Math.round(targetProfit * 100) / 100,
      riskTolerance: config.riskTolerance,
    };
  }

  // ============================================================
  // Allocation Plans
  // ============================================================

  /**
   * Generate an allocation plan from a list of betting opportunities.
   *
   * @param opportunities  Match opportunities with Kelly/probability data
   * @param useLLM         If true, use LLM-driven allocation; else algorithmic
   */
  async createAllocation(
    opportunities: AllocationOpportunity[],
    useLLM = false,
  ): Promise<AllocationPlan> {
    const bankroll = this.getBankrollState();

    if (bankroll.availableCapital <= 0) {
      return {
        allocations: [],
        totalAllocated: 0,
        remainingCapital: 0,
        expectedReturn: 0,
        expectedROI: 0,
        portfolioRisk: 0,
        reasoning: '可用资金不足，请增加总资金或结算已完成的投注。',
        generatedAt: new Date().toISOString(),
        source: useLLM ? 'llm' : 'algorithmic',
      };
    }

    let plan: AllocationPlan;

    if (useLLM) {
      plan = await this.allocateWithLLM(bankroll, opportunities);
    } else {
      plan = this.engine.allocateAlgorithmic(bankroll, opportunities);
    }

    // Persist the plan
    this.allocRepo.savePlan(plan);
    return plan;
  }

  getLatestPlan(): AllocationPlan | null {
    return this.allocRepo.getLatestPlan();
  }

  getPlanHistory(limit = 20): AllocationPlan[] {
    return this.allocRepo.getPlans(limit);
  }

  // ============================================================
  // LLM-driven allocation
  // ============================================================

  private async allocateWithLLM(
    bankroll: BankrollState,
    opportunities: AllocationOpportunity[],
  ): Promise<AllocationPlan> {
    const configs = this.llmRepo.getAllConfigs();
    const enabledConfigs = configs.filter((c) => c.isEnabled && c.apiKey);

    if (enabledConfigs.length === 0) {
      logger.warn('[Allocation] No LLM providers configured, falling back to algorithmic');
      return this.engine.allocateAlgorithmic(bankroll, opportunities);
    }

    // Use the first enabled provider for allocation
    const config = enabledConfigs[0];
    const userContent = this.engine.buildAllocationPrompt(bankroll, opportunities);
    const systemPrompt = this.promptEngine.getAllocationSystemPrompt();

    try {
      const apiKey = this.getKeyManager().decrypt(config.apiKey);
      const client = new CircuitBreakerLLMClient(
        config.provider,
        LLMClientFactory.create(config.provider, apiKey, config.model),
      );

      const responseText = await Promise.race([
        client.complete({ system: systemPrompt, user: userContent }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM allocation timeout after 30s')), 30000),
        ),
      ]);

      return this.engine.parseLLMAllocation(bankroll, opportunities, responseText);
    } catch (err) {
      logger.error('[Allocation] LLM allocation failed, falling back to algorithmic', {
        error: (err as Error).message,
        provider: config.provider,
      });
      return this.engine.allocateAlgorithmic(bankroll, opportunities);
    }
  }
}
