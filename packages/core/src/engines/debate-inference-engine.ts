import type { DebateArgument, DebateInferenceResult } from '../types/index';

export interface DebateInferenceInput {
  marketId: string;
  marketProb: number;
  yesArguments: DebateArgument[];
  noArguments: DebateArgument[];
  calibrationError?: number;
}

/**
 * DebateInferenceEngine judges opposed Yes/No arguments and calibrates the
 * resulting probability before it enters the trading signal stack.
 */
export class DebateInferenceEngine {
  infer(input: DebateInferenceInput): DebateInferenceResult {
    const marketProb = clamp(input.marketProb, 0.01, 0.99);
    const yesCase = this.mergeArguments('yes', input.yesArguments, marketProb);
    const noCase = this.mergeArguments('no', input.noArguments, marketProb);

    const yesWeight = this.argumentWeight(yesCase);
    const noWeight = this.argumentWeight(noCase);
    const totalWeight = yesWeight + noWeight;

    const judgeProbability = totalWeight > 0
      ? (yesCase.probability * yesWeight + noCase.probability * noWeight) / totalWeight
      : marketProb;

    const calibrationError = clamp(input.calibrationError ?? 0.1, 0, 0.5);
    const shrinkage = clamp(0.15 + calibrationError * 0.8, 0.15, 0.55);
    const calibratedProbability = clamp(
      judgeProbability * (1 - shrinkage) + marketProb * shrinkage,
      0.01,
      0.99,
    );

    const evidenceStrength = clamp((yesWeight + noWeight) / 2, 0, 1);
    const confidence = clamp(
      evidenceStrength * (1 - Math.abs(yesCase.probability - noCase.probability) * 0.25),
      0.05,
      0.95,
    );
    const marketMispricing = calibratedProbability - marketProb;
    const verdict: DebateInferenceResult['verdict'] =
      marketMispricing > 0.05 && confidence > 0.35
        ? 'buy_yes'
        : marketMispricing < -0.05 && confidence > 0.35
          ? 'buy_no'
          : 'skip';

    return {
      marketId: input.marketId,
      yesCase,
      noCase,
      judgeProbability: round4(judgeProbability),
      calibratedProbability: round4(calibratedProbability),
      confidence: round4(confidence),
      marketMispricing: round4(marketMispricing),
      verdict,
      evidenceStrength: round4(evidenceStrength),
      generatedAt: new Date().toISOString(),
    };
  }

  private mergeArguments(
    stance: DebateArgument['stance'],
    args: DebateArgument[],
    marketProb: number,
  ): DebateArgument {
    const validArgs = args.filter((arg) => Number.isFinite(arg.probability));
    if (validArgs.length === 0) {
      return {
        stance,
        probability: marketProb,
        confidence: 0.05,
        evidence: [],
        reasoning: stance === 'yes' ? 'No affirmative AI case available' : 'No negative AI case available',
        risks: ['Insufficient debate evidence'],
      };
    }

    let totalWeight = 0;
    let weightedProb = 0;
    const evidence: string[] = [];
    const risks: string[] = [];

    for (const arg of validArgs) {
      const weight = this.argumentWeight(arg);
      totalWeight += weight;
      weightedProb += clamp(arg.probability, 0.01, 0.99) * weight;
      evidence.push(...arg.evidence);
      risks.push(...arg.risks);
    }

    const probability = totalWeight > 0 ? weightedProb / totalWeight : marketProb;
    const confidence = validArgs.reduce((sum, arg) => sum + clamp(arg.confidence, 0, 1), 0) / validArgs.length;

    return {
      stance,
      probability: round4(probability),
      confidence: round4(confidence),
      evidence: unique(evidence).slice(0, 8),
      reasoning: `${validArgs.length} AI argument${validArgs.length === 1 ? '' : 's'} support the ${stance.toUpperCase()} case`,
      risks: unique(risks).slice(0, 5),
    };
  }

  private argumentWeight(arg: DebateArgument): number {
    const evidenceBonus = clamp(arg.evidence.length / 4, 0, 1) * 0.25;
    const riskPenalty = clamp(arg.risks.length / 5, 0, 1) * 0.15;
    return clamp(arg.confidence * 0.75 + evidenceBonus - riskPenalty, 0.05, 1);
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
