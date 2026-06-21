import { Router, type Request, type Response } from 'express';
import { LLMRepository } from '@polyrader/infra';
import { validate, createVariantSchema, updateVariantSchema, variantParamsSchema, abCompareQuerySchema } from '../validation';
import { logger } from '../utils/logger';

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 * Accurate to ~7 decimal places.
 */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Chi-square CDF approximation using Wilson-Hilferty transformation.
 */
function chiSquareCdf(df: number, x: number): number {
  if (x <= 0) return 0;
  // Wilson-Hilferty approximation: (x/df)^(1/3) ~ N(1 - 2/(9df), 2/(9df))
  const h = 2 / (9 * df);
  const z = (Math.pow(x / df, 1 / 3) - (1 - h)) / Math.sqrt(h);
  return normalCdf(z);
}

/**
 * Combined recommendation based on multiple significance tests.
 */
function getRecommendation(
  zTestPValue: number,
  chiSqPValue: number,
  bayesProbABetter: number,
  hasSufficientData: boolean,
  pA: number,
  pB: number,
): string {
  if (!hasSufficientData) {
    return 'insufficient_data';
  }
  // Require both frequentist tests to agree at p<0.05
  const bothSignificant = zTestPValue < 0.05 && chiSqPValue < 0.05;
  // Bayesian: >90% probability is strong evidence
  const bayesStrong = bayesProbABetter > 0.9 || bayesProbABetter < 0.1;

  if (bothSignificant || bayesStrong) {
    // Determine which variant is better
    if (pA > pB && bayesProbABetter > 0.5) return 'promote_variant_a';
    if (pB > pA && bayesProbABetter < 0.5) return 'promote_variant_b';
  }
  return 'no_significant_difference';
}

/**
 * Router for Prompt A/B testing variant management.
 * Mounted at /api/ai/prompts
 */
export function createPromptVariantRouter(llmRepo: LLMRepository): Router {
  const router = Router();

  // GET / — list all variants
  router.get('/', (_req: Request, res: Response) => {
    try {
      const variants = llmRepo.getAllVariants();
      res.json({ data: variants });
    } catch (err) {
      logger.error('Failed to fetch prompt variants', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch variants' });
    }
  });

  // GET /ab/compare?variantA=baseline&variantB=v2 — A/B variant comparison stats
  // NOTE: must be registered before /:variantId, otherwise Express matches "ab" as a variantId.
  router.get('/ab/compare', validate(abCompareQuerySchema, 'query'), (req: Request, res: Response) => {
    try {
      const variantA = req.query.variantA as string;
      const variantB = req.query.variantB as string;
      const statsA = llmRepo.getVariantStats(variantA);
      const statsB = llmRepo.getVariantStats(variantB);

      // Two-proportion z-test for accuracy significance
      // H0: pA = pB, H1: pA != pB
      const settledA = statsA.wonBets + statsA.lostBets;
      const settledB = statsB.wonBets + statsB.lostBets;
      const pA = settledA > 0 ? statsA.wonBets / settledA : 0;
      const pB = settledB > 0 ? statsB.wonBets / settledB : 0;
      // Pooled proportion
      const pooled = settledA + settledB > 0
        ? (statsA.wonBets + statsB.wonBets) / (settledA + settledB)
        : 0;
      const se = pooled > 0 && pooled < 1
        ? Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(1, settledA) + 1 / Math.max(1, settledB)))
        : 0;
      const zScore = se > 0 ? Math.abs(pA - pB) / se : 0;
      // Two-tailed p-value approximation (normal CDF)
      // |z| > 1.96 → p < 0.05, |z| > 2.576 → p < 0.01
      const pValue = zScore > 0 ? 2 * (1 - normalCdf(zScore)) : 1;
      const minSampleSize = 30;
      const hasSufficientData = settledA >= minSampleSize && settledB >= minSampleSize;

      // Chi-square test (2x2 contingency table)
      // |          | Won  | Lost | Total |
      // | VariantA | a    | b    | nA    |
      // | VariantB | c    | d    | nB    |
      const a = statsA.wonBets;
      const b = statsA.lostBets;
      const c = statsB.wonBets;
      const d = statsB.lostBets;
      const nA = a + b;
      const nB = c + d;
      const n = nA + nB;
      const colWon = a + c;
      const colLost = b + d;
      // Chi-square statistic with Yates' correction
      const chiSq = n > 0 && colWon > 0 && colLost > 0
        ? n * Math.pow(Math.abs(a * d - b * c) - n / 2, 2) / (Math.max(1, nA) * Math.max(1, nB) * Math.max(1, colWon) * Math.max(1, colLost))
        : 0;
      const chiSqPValue = chiSq > 0 ? 1 - chiSquareCdf(1, chiSq) : 1;

      // Bayesian A/B testing: Beta-Binomial model
      // Prior: Beta(1, 1) (uniform), Posterior: Beta(1 + wins, 1 + losses)
      // P(VariantA > VariantB) via Monte Carlo or numerical integration
      // Using Beta posterior: A ~ Beta(1+a, 1+b), B ~ Beta(1+c, 1+d)
      // P(A > B) = integral of f_A(x) * F_B(x) dx
      // Approximate using incomplete beta function
      const alphaA = 1 + a;
      const betaA = 1 + b;
      const alphaB = 1 + c;
      const betaB = 1 + d;
      // P(B < A) = sum over k of C(nB, k) * B(alphaA + k, betaA + betaB) / B(alphaA, betaA) ... (complex)
      // Simpler: use normal approximation of Beta for large samples
      const meanA = alphaA / (alphaA + betaA);
      const meanB = alphaB / (alphaB + betaB);
      const varA = (alphaA * betaA) / (Math.pow(alphaA + betaA, 2) * (alphaA + betaA + 1));
      const varB = (alphaB * betaB) / (Math.pow(alphaB + betaB, 2) * (alphaB + betaB + 1));
      const bayesSe = Math.sqrt(varA + varB);
      const bayesZ = bayesSe > 0 ? (meanA - meanB) / bayesSe : 0;
      // P(A > B) ≈ Phi(bayesZ)
      const probABetter = Number.isFinite(bayesZ) ? normalCdf(bayesZ) : 0.5;

      res.json({
        data: {
          variantA: statsA,
          variantB: statsB,
          significance: {
            // Z-test
            zScore: Number.isFinite(zScore) ? Math.round(zScore * 1000) / 1000 : 0,
            pValue: Number.isFinite(pValue) ? Math.round(pValue * 10000) / 10000 : 1,
            isSignificant: pValue < 0.05 && hasSufficientData,
            hasSufficientData,
            minSampleSize,
            settledA,
            settledB,
            // Chi-square test
            chiSquare: Number.isFinite(chiSq) ? Math.round(chiSq * 1000) / 1000 : 0,
            chiSqPValue: Number.isFinite(chiSqPValue) ? Math.round(chiSqPValue * 10000) / 10000 : 1,
            // Bayesian
            bayesProbABetter: Number.isFinite(probABetter) ? Math.round(probABetter * 10000) / 10000 : 0.5,
            bayesProbBBetter: Number.isFinite(probABetter) ? Math.round((1 - probABetter) * 10000) / 10000 : 0.5,
            // Recommendation based on combined evidence
            recommendation: getRecommendation(pValue, chiSqPValue, probABetter, hasSufficientData, pA, pB),
          },
        },
      });
    } catch (err) {
      logger.error('Failed to compare prompt variants', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to compare variants' });
    }
  });

  // GET /:variantId — get one variant
  router.get('/:variantId', validate(variantParamsSchema, 'params'), (req: Request, res: Response) => {
    try {
      const variant = llmRepo.getVariant(req.params.variantId);
      if (!variant) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      res.json({ data: variant });
    } catch (err) {
      logger.error('Failed to fetch prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch variant' });
    }
  });

  // POST / — create a variant
  router.post('/', validate(createVariantSchema, 'body'), (req: Request, res: Response) => {
    try {
      const existing = llmRepo.getVariant(req.body.variantId);
      if (existing) {
        res.status(409).json({ error: 'Variant already exists' });
        return;
      }
      llmRepo.upsertVariant(req.body);
      const variant = llmRepo.getVariant(req.body.variantId);
      res.status(201).json({ data: variant });
    } catch (err) {
      logger.error('Failed to create prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create variant' });
    }
  });

  // PUT /:variantId — update a variant (partial merge)
  router.put(
    '/:variantId',
    validate(variantParamsSchema, 'params'),
    validate(updateVariantSchema, 'body'),
    (req: Request, res: Response) => {
      try {
        const existing = llmRepo.getVariant(req.params.variantId);
        if (!existing) {
          res.status(404).json({ error: 'Variant not found' });
          return;
        }
        // Merge existing values with updates before upserting
        const merged = { ...existing, ...req.body, variantId: req.params.variantId };
        llmRepo.upsertVariant(merged);
        const variant = llmRepo.getVariant(req.params.variantId);
        res.json({ data: variant });
      } catch (err) {
        logger.error('Failed to update prompt variant', { error: (err as Error).message });
        res.status(500).json({ error: 'Failed to update variant' });
      }
    },
  );

  // DELETE /:variantId — delete a variant (only if not control)
  router.delete('/:variantId', validate(variantParamsSchema, 'params'), (req: Request, res: Response) => {
    try {
      const existing = llmRepo.getVariant(req.params.variantId);
      if (!existing) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      if (existing.isControl) {
        res.status(400).json({ error: 'Cannot delete control variant' });
        return;
      }
      llmRepo.deleteVariant(req.params.variantId);
      res.json({ message: 'Variant deleted' });
    } catch (err) {
      logger.error('Failed to delete prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to delete variant' });
    }
  });

  return router;
}
