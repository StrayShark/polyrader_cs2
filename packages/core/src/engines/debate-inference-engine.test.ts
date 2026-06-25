import { describe, expect, it } from 'vitest';
import { DebateInferenceEngine } from './debate-inference-engine';

describe('DebateInferenceEngine', () => {
  const engine = new DebateInferenceEngine();

  it('returns skip when no debate evidence is available', () => {
    const result = engine.infer({
      marketId: 'm1',
      marketProb: 0.5,
      yesArguments: [],
      noArguments: [],
    });

    expect(result.calibratedProbability).toBeCloseTo(0.5, 2);
    expect(result.verdict).toBe('skip');
  });

  it('leans yes when affirmative arguments are stronger', () => {
    const result = engine.infer({
      marketId: 'm1',
      marketProb: 0.5,
      yesArguments: [
        {
          stance: 'yes',
          probability: 0.72,
          confidence: 0.8,
          evidence: ['model-a favors yes', 'lineup advantage'],
          reasoning: 'Strong yes case',
          risks: [],
        },
      ],
      noArguments: [
        {
          stance: 'no',
          probability: 0.48,
          confidence: 0.35,
          evidence: ['market near fair'],
          reasoning: 'Weak no case',
          risks: ['low confidence'],
        },
      ],
      calibrationError: 0.05,
    });

    expect(result.calibratedProbability).toBeGreaterThan(0.55);
    expect(result.marketMispricing).toBeGreaterThan(0);
    expect(result.verdict).toBe('buy_yes');
  });

  it('shrinks judge probability toward market probability when calibration error is high', () => {
    const lowError = engine.infer({
      marketId: 'm1',
      marketProb: 0.5,
      yesArguments: [
        {
          stance: 'yes',
          probability: 0.8,
          confidence: 0.8,
          evidence: ['strong yes'],
          reasoning: 'yes',
          risks: [],
        },
      ],
      noArguments: [],
      calibrationError: 0,
    });

    const highError = engine.infer({
      marketId: 'm1',
      marketProb: 0.5,
      yesArguments: [
        {
          stance: 'yes',
          probability: 0.8,
          confidence: 0.8,
          evidence: ['strong yes'],
          reasoning: 'yes',
          risks: [],
        },
      ],
      noArguments: [],
      calibrationError: 0.5,
    });

    expect(highError.calibratedProbability).toBeLessThan(lowError.calibratedProbability);
  });
});
