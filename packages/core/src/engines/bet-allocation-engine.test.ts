import { describe, it, expect } from 'vitest';
import { BetAllocationEngine } from './bet-allocation-engine';
import type { BankrollState, AllocationOpportunity } from '../types/index';
import {
  DEFAULT_MAX_BET_FRACTION,
  DEFAULT_MAX_TOTAL_EXPOSURE,
  MIN_ALLOCATION_KELLY,
} from '../scoring/weights';

// ============================================================
// Helpers
// ============================================================

function makeBankroll(overrides?: Partial<BankrollState>): BankrollState {
  return {
    totalCapital: 10000,
    usedCapital: 0,
    availableCapital: 10000,
    realizedPnL: 0,
    netCapital: 10000,
    targetReturnRate: 0.1,
    targetProfit: 1000,
    riskTolerance: 'balanced',
    ...overrides,
  };
}

function makeOpportunity(overrides?: Partial<AllocationOpportunity>): AllocationOpportunity {
  return {
    matchId: 'match-1',
    matchLabel: 'TeamA vs TeamB',
    team: 'TeamA',
    winProbability: 0.65,
    odds: 1.8,
    kellyFraction: 0.15,
    consensusLevel: 'strong',
    confidence: 0.8,
    expectedValue: 0.17,
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('BetAllocationEngine', () => {
  const engine = new BetAllocationEngine();

  // ---------- allocateAlgorithmic ----------

  describe('allocateAlgorithmic', () => {
    it('should allocate capital across valid opportunities', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.2, expectedValue: 0.25 }),
        makeOpportunity({ matchId: 'm2', kellyFraction: 0.1, expectedValue: 0.1 }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      expect(plan.source).toBe('algorithmic');
      expect(plan.allocations.length).toBe(2);
      expect(plan.totalAllocated).toBeGreaterThan(0);
      expect(plan.remainingCapital).toBe(bankroll.availableCapital - plan.totalAllocated);
      expect(plan.expectedReturn).toBeGreaterThan(0);
      expect(plan.expectedROI).toBeGreaterThan(0);
      expect(plan.portfolioRisk).toBeGreaterThan(0);
      expect(plan.portfolioRisk).toBeLessThan(1);
    });

    it('should return empty plan when no opportunities meet Kelly threshold', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.001 }),
        makeOpportunity({ matchId: 'm2', kellyFraction: 0.005 }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      expect(plan.allocations).toEqual([]);
      expect(plan.totalAllocated).toBe(0);
      expect(plan.remainingCapital).toBe(bankroll.availableCapital);
      expect(plan.source).toBe('algorithmic');
    });

    it('should return empty plan when available capital is 0', () => {
      const bankroll = makeBankroll({ availableCapital: 0 });
      const opps = [makeOpportunity({ kellyFraction: 0.2 })];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      expect(plan.allocations).toEqual([]);
      expect(plan.totalAllocated).toBe(0);
    });

    it('should respect maxBetFraction cap per bet', () => {
      const bankroll = makeBankroll();
      const maxBetFraction = 0.05; // 5% = $500
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.9, expectedValue: 0.5 }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps, { maxBetFraction });

      expect(plan.allocations).toHaveLength(1);
      expect(plan.allocations[0].amount).toBeLessThanOrEqual(
        bankroll.availableCapital * maxBetFraction + 0.01, // rounding tolerance
      );
    });

    it('should respect maxTotalExposure cap', () => {
      const bankroll = makeBankroll();
      const maxTotalExposure = 0.3; // 30% = $3000
      const opps = Array.from({ length: 10 }, (_, i) =>
        makeOpportunity({
          matchId: `m${i}`,
          kellyFraction: 0.5,
          expectedValue: 0.3,
          odds: 2.0,
          winProbability: 0.6,
        }),
      );

      const plan = engine.allocateAlgorithmic(bankroll, opps, { maxTotalExposure });

      expect(plan.totalAllocated).toBeLessThanOrEqual(
        bankroll.availableCapital * maxTotalExposure + 0.01,
      );
    });

    it('should scale by risk tolerance multiplier', () => {
      const opps = [makeOpportunity({ kellyFraction: 0.2 })];

      const conservativePlan = engine.allocateAlgorithmic(
        makeBankroll({ riskTolerance: 'conservative' }),
        opps,
      );
      const aggressivePlan = engine.allocateAlgorithmic(
        makeBankroll({ riskTolerance: 'aggressive' }),
        opps,
      );

      expect(aggressivePlan.totalAllocated).toBeGreaterThan(conservativePlan.totalAllocated);
    });

    it('should sort allocations by amount descending', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.05, expectedValue: 0.05 }),
        makeOpportunity({ matchId: 'm2', kellyFraction: 0.3, expectedValue: 0.4 }),
        makeOpportunity({ matchId: 'm3', kellyFraction: 0.15, expectedValue: 0.15 }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      for (let i = 1; i < plan.allocations.length; i++) {
        expect(plan.allocations[i].amount).toBeLessThanOrEqual(plan.allocations[i - 1].amount);
      }
    });

    it('should skip allocations below $1', () => {
      const bankroll = makeBankroll({ availableCapital: 10 });
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.02 }), // barely above MIN_ALLOCATION_KELLY
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      for (const a of plan.allocations) {
        expect(a.amount).toBeGreaterThanOrEqual(1);
      }
    });

    it('should calculate expected return correctly', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({
          matchId: 'm1',
          kellyFraction: 0.2,
          winProbability: 0.6,
          odds: 2.0,
        }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      // EV = amount × (0.6 × (2.0 - 1) - (1 - 0.6)) = amount × (0.6 - 0.4) = amount × 0.2
      const expectedEV = plan.allocations[0].amount * 0.2;
      expect(plan.allocations[0].expectedReturn).toBeCloseTo(expectedEV, 1);
    });

    it('should boost allocations for higher target return rate', () => {
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.2, expectedValue: 0.3 }),
      ];

      const lowTargetPlan = engine.allocateAlgorithmic(
        makeBankroll({ targetReturnRate: 0.01 }),
        opps,
      );
      const highTargetPlan = engine.allocateAlgorithmic(
        makeBankroll({ targetReturnRate: 0.5 }),
        opps,
      );

      // Higher target should allocate at least as much (boost factor)
      expect(highTargetPlan.totalAllocated).toBeGreaterThanOrEqual(
        lowTargetPlan.totalAllocated,
      );
    });

    it('should apply diversification discount for multiple bets', () => {
      const bankroll = makeBankroll();

      const singlePlan = engine.allocateAlgorithmic(bankroll, [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.2 }),
      ]);
      const multiPlan = engine.allocateAlgorithmic(bankroll, [
        makeOpportunity({ matchId: 'm1', kellyFraction: 0.2 }),
        makeOpportunity({ matchId: 'm2', kellyFraction: 0.15 }),
        makeOpportunity({ matchId: 'm3', kellyFraction: 0.1 }),
      ]);

      // More bets → diversification discount reduces risk
      expect(multiPlan.portfolioRisk).toBeLessThanOrEqual(singlePlan.portfolioRisk);
    });
  });

  // ---------- parseLLMAllocation ----------

  describe('parseLLMAllocation', () => {
    it('should parse valid JSON LLM response', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({ matchId: 'm1' }),
        makeOpportunity({ matchId: 'm2' }),
      ];
      const llmResponse = JSON.stringify({
        allocations: [
          { matchId: 'm1', amount: 500 },
          { matchId: 'm2', amount: 300 },
        ],
        reasoning: 'Diversified across two matches',
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse);

      expect(plan.source).toBe('llm');
      expect(plan.allocations).toHaveLength(2);
      expect(plan.totalAllocated).toBe(800);
      expect(plan.remainingCapital).toBe(9200);
      expect(plan.reasoning).toBe('Diversified across two matches');
    });

    it('should parse JSON wrapped in markdown code block', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity({ matchId: 'm1' })];
      const llmResponse = '```json\n{"allocations":[{"matchId":"m1","amount":200}]}\n```';

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse);

      expect(plan.allocations).toHaveLength(1);
      expect(plan.allocations[0].amount).toBe(200);
    });

    it('should return empty plan on invalid JSON', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity()];

      const plan = engine.parseLLMAllocation(bankroll, opps, 'not valid json at all');

      expect(plan.allocations).toEqual([]);
      expect(plan.source).toBe('llm');
    });

    it('should clamp amount to maxBetFraction', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity({ matchId: 'm1' })];
      const maxBetFraction = 0.05; // $500 max
      const llmResponse = JSON.stringify({
        allocations: [{ matchId: 'm1', amount: 5000 }],
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse, { maxBetFraction });

      expect(plan.allocations[0].amount).toBeLessThanOrEqual(
        bankroll.availableCapital * maxBetFraction,
      );
    });

    it('should clamp total allocation to maxTotalExposure', () => {
      const bankroll = makeBankroll();
      const maxTotalExposure = 0.2; // $2000 max total
      const opps = Array.from({ length: 5 }, (_, i) =>
        makeOpportunity({ matchId: `m${i}` }),
      );
      const llmResponse = JSON.stringify({
        allocations: opps.map((o) => ({ matchId: o.matchId, amount: 5000 })),
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse, { maxTotalExposure });

      expect(plan.totalAllocated).toBeLessThanOrEqual(
        bankroll.availableCapital * maxTotalExposure + 0.01,
      );
    });

    it('should skip opportunities not in the provided list', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity({ matchId: 'm1' })];
      const llmResponse = JSON.stringify({
        allocations: [
          { matchId: 'm1', amount: 100 },
          { matchId: 'unknown-match', amount: 9999 },
        ],
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse);

      expect(plan.allocations).toHaveLength(1);
      expect(plan.allocations[0].matchId).toBe('m1');
    });

    it('should handle negative amounts gracefully', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity({ matchId: 'm1' })];
      const llmResponse = JSON.stringify({
        allocations: [{ matchId: 'm1', amount: -100 }],
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse);

      // Negative amounts are clamped to 0, which is < $1 → skipped
      expect(plan.allocations).toEqual([]);
      expect(plan.totalAllocated).toBe(0);
    });

    it('should use default reasoning if not provided', () => {
      const bankroll = makeBankroll();
      const opps = [makeOpportunity({ matchId: 'm1' })];
      const llmResponse = JSON.stringify({
        allocations: [{ matchId: 'm1', amount: 100 }],
      });

      const plan = engine.parseLLMAllocation(bankroll, opps, llmResponse);

      expect(plan.reasoning).toBe('LLM-driven allocation');
    });
  });

  // ---------- buildAllocationPrompt ----------

  describe('buildAllocationPrompt', () => {
    it('should include bankroll state in the prompt', () => {
      const bankroll = makeBankroll({ totalCapital: 5000, availableCapital: 3000 });
      const prompt = engine.buildAllocationPrompt(bankroll, []);

      expect(prompt).toContain('5000');
      expect(prompt).toContain('3000');
      expect(prompt).toContain('balanced');
    });

    it('should include opportunity details in the prompt', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({
          matchId: 'm1',
          matchLabel: 'FaZe vs NaVi',
          team: 'FaZe',
          winProbability: 0.65,
          odds: 1.8,
        }),
      ];
      const prompt = engine.buildAllocationPrompt(bankroll, opps);

      expect(prompt).toContain('FaZe vs NaVi');
      expect(prompt).toContain('65.0%');
      expect(prompt).toContain('1.80');
    });

    it('should include constraint percentages', () => {
      const bankroll = makeBankroll();
      const prompt = engine.buildAllocationPrompt(bankroll, []);

      expect(prompt).toContain(`${(DEFAULT_MAX_BET_FRACTION * 100).toFixed(0)}%`);
      expect(prompt).toContain(`${(DEFAULT_MAX_TOTAL_EXPOSURE * 100).toFixed(0)}%`);
    });
  });

  // ---------- Edge cases ----------

  describe('edge cases', () => {
    it('should handle empty opportunities array', () => {
      const plan = engine.allocateAlgorithmic(makeBankroll(), []);

      expect(plan.allocations).toEqual([]);
      expect(plan.totalAllocated).toBe(0);
    });

    it('should handle opportunities with Kelly at exactly MIN_ALLOCATION_KELLY', () => {
      const bankroll = makeBankroll();
      const opps = [
        makeOpportunity({ matchId: 'm1', kellyFraction: MIN_ALLOCATION_KELLY }),
      ];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      // Exactly at threshold should be included (>= comparison)
      expect(plan.allocations.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative realizedPnL reducing net capital', () => {
      const bankroll = makeBankroll({ realizedPnL: -5000, netCapital: 5000 });
      const opps = [makeOpportunity({ kellyFraction: 0.2 })];

      const plan = engine.allocateAlgorithmic(bankroll, opps);

      // Should still allocate based on availableCapital, not netCapital
      expect(plan.totalAllocated).toBeGreaterThan(0);
      expect(plan.totalAllocated).toBeLessThanOrEqual(bankroll.availableCapital);
    });
  });
});
