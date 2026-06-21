import { query, queryOne, getDb } from '../connection';
import type { BankrollConfig, AllocationPlan, RiskTolerance } from '@polyrader/core';

/**
 * Repository for bankroll configuration and allocation plan persistence.
 */
export class AllocationRepository {
  // --- Bankroll Config (single-row table) ---

  getBankrollConfig(): BankrollConfig {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM bankroll_config WHERE id = 1`,
    );
    if (!row) {
      return {
        totalCapital: 10000,
        targetReturnRate: 0.15,
        riskTolerance: 'balanced',
        maxBetFraction: 0.15,
        maxTotalExposure: 0.6,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      totalCapital: row.total_capital as number,
      targetReturnRate: row.target_return_rate as number,
      riskTolerance: row.risk_tolerance as RiskTolerance,
      maxBetFraction: row.max_bet_fraction as number,
      maxTotalExposure: row.max_total_exposure as number,
      updatedAt: row.updated_at as string,
    };
  }

  updateBankrollConfig(config: Omit<BankrollConfig, 'updatedAt'>): BankrollConfig {
    query(
      `UPDATE bankroll_config SET
         total_capital = ?,
         target_return_rate = ?,
         risk_tolerance = ?,
         max_bet_fraction = ?,
         max_total_exposure = ?,
         updated_at = datetime('now')
       WHERE id = 1`,
      config.totalCapital,
      config.targetReturnRate,
      config.riskTolerance,
      config.maxBetFraction,
      config.maxTotalExposure,
    );
    return this.getBankrollConfig();
  }

  // --- Allocation Plans ---

  savePlan(plan: AllocationPlan): number {
    const result = getDb().prepare(
      `INSERT INTO allocation_plans
         (allocations, total_allocated, remaining_capital, expected_return, expected_roi, portfolio_risk, reasoning, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      JSON.stringify(plan.allocations),
      plan.totalAllocated,
      plan.remainingCapital,
      plan.expectedReturn,
      plan.expectedROI,
      plan.portfolioRisk,
      plan.reasoning,
      plan.source,
    );
    return result.lastInsertRowid as number;
  }

  getLatestPlan(): AllocationPlan | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM allocation_plans ORDER BY generated_at DESC LIMIT 1`,
    );
    return row ? this.mapPlan(row) : null;
  }

  getPlans(limit = 20): AllocationPlan[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM allocation_plans ORDER BY generated_at DESC LIMIT ?`,
      limit,
    );
    return rows.map(this.mapPlan);
  }

  private mapPlan(row: Record<string, unknown>): AllocationPlan {
    return {
      allocations: JSON.parse(row.allocations as string),
      totalAllocated: row.total_allocated as number,
      remainingCapital: row.remaining_capital as number,
      expectedReturn: row.expected_return as number,
      expectedROI: row.expected_roi as number,
      portfolioRisk: row.portfolio_risk as number,
      reasoning: row.reasoning as string,
      generatedAt: row.generated_at as string,
      source: row.source as 'algorithmic' | 'llm',
    };
  }
}
