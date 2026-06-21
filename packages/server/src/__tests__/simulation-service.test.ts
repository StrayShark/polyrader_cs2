import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMAnalysisResult, SimulatedBet } from '@polyrader/core';

// Mock core — SimulatedBettingEngine constructor returns mock instance
vi.mock('@polyrader/core', () => ({
  SimulatedBettingEngine: vi.fn().mockImplementation(() => ({
    placeBetFromAnalysis: vi.fn(),
    calculateProviderStats: vi.fn(),
  })),
}));

// Mock infra — SimulationRepository and LLMRepository constructors return mock instances
vi.mock('@polyrader/infra', () => ({
  SimulationRepository: vi.fn().mockImplementation(() => ({
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  })),
  LLMRepository: vi.fn().mockImplementation(() => ({
    upsertBet: vi.fn(),
    getBetsByProviders: vi.fn(),
    getEquityCurveByProvider: vi.fn(),
    getBetsByProvider: vi.fn(),
  })),
}));

import { SimulationService } from '../services/simulation-service';

// ============================================================
// SimulationService tests
// ============================================================
describe('SimulationService', () => {
  let service: SimulationService;
  let simRepo: Record<string, ReturnType<typeof vi.fn>>;
  let llmRepo: Record<string, ReturnType<typeof vi.fn>>;
  let bettingEngine: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SimulationService();
    simRepo = (service as unknown as { simRepo: Record<string, ReturnType<typeof vi.fn>> }).simRepo;
    llmRepo = (service as unknown as { llmRepo: Record<string, ReturnType<typeof vi.fn>> }).llmRepo;
    bettingEngine = (service as unknown as { bettingEngine: Record<string, ReturnType<typeof vi.fn>> }).bettingEngine;
  });

  // ----------------------------------------------------------
  // getConfig
  // ----------------------------------------------------------
  describe('getConfig', () => {
    it('returns config from repository', () => {
      const mockConfig = { enabled: true, initialCapital: 10000, participatingProviders: [] };
      simRepo.getConfig.mockReturnValue(mockConfig);

      const result = service.getConfig();

      expect(result).toEqual(mockConfig);
      expect(simRepo.getConfig).toHaveBeenCalledOnce();
    });
  });

  // ----------------------------------------------------------
  // updateConfig
  // ----------------------------------------------------------
  describe('updateConfig', () => {
    it('calls repository updateConfig with provided partial config', () => {
      const update = { enabled: false };
      const mockConfig = { enabled: false, initialCapital: 10000, participatingProviders: [] };
      simRepo.updateConfig.mockReturnValue(mockConfig);

      const result = service.updateConfig(update);

      expect(result).toEqual(mockConfig);
      expect(simRepo.updateConfig).toHaveBeenCalledWith(update);
    });
  });

  // ----------------------------------------------------------
  // autoBetFromAnalysis
  // ----------------------------------------------------------
  describe('autoBetFromAnalysis', () => {
    const mockAnalysisResults: LLMAnalysisResult[] = [
      {
        provider: 'openai',
        model: 'gpt-4o',
        winProbability: { teamA: 0.65, teamB: 0.35 },
        confidence: 0.8,
        reasoning: 'Team A is stronger',
        keyFactors: ['rank', 'form'],
        riskAssessment: 'low',
        latency: 100,
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        winProbability: { teamA: 0.55, teamB: 0.45 },
        confidence: 0.7,
        reasoning: 'Team A has advantage',
        keyFactors: ['rank'],
        riskAssessment: 'low',
        latency: 120,
        tokenUsage: { promptTokens: 100, completionTokens: 60, totalTokens: 160 },
      },
    ];

    it('returns empty array when simulation is disabled', () => {
      simRepo.getConfig.mockReturnValue({ enabled: false, participatingProviders: [], initialCapital: 10000 });

      const result = service.autoBetFromAnalysis('match1', mockAnalysisResults, 0.5, 'TeamA', 'TeamB');

      expect(result).toEqual([]);
      expect(bettingEngine.placeBetFromAnalysis).not.toHaveBeenCalled();
    });

    it('generates bets for each provider when enabled and no participating list filter', () => {
      simRepo.getConfig.mockReturnValue({ enabled: true, participatingProviders: [], initialCapital: 10000 });
      const mockBet1: SimulatedBet = {
        id: 'bet-1', matchId: 'match1', provider: 'openai', team: 'TeamA',
        amount: 100, odds: 2.0, result: 'pending', profitLoss: 0, placedAt: '2024-01-01T00:00:00Z',
      };
      const mockBet2: SimulatedBet = {
        id: 'bet-2', matchId: 'match1', provider: 'anthropic', team: 'TeamA',
        amount: 100, odds: 2.0, result: 'pending', profitLoss: 0, placedAt: '2024-01-01T00:00:00Z',
      };
      bettingEngine.placeBetFromAnalysis
        .mockReturnValueOnce(mockBet1)
        .mockReturnValueOnce(mockBet2);

      const result = service.autoBetFromAnalysis('match1', mockAnalysisResults, 0.5, 'TeamA', 'TeamB');

      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('openai');
      expect(result[1].provider).toBe('anthropic');
      expect(llmRepo.upsertBet).toHaveBeenCalledTimes(2);
      // Verify placeBetFromAnalysis receives correct arguments
      expect(bettingEngine.placeBetFromAnalysis).toHaveBeenCalledWith(
        'match1', mockAnalysisResults[0], expect.objectContaining({ enabled: true }), 0.5, 'TeamA', 'TeamB',
      );
    });

    it('skips providers not in participating list', () => {
      simRepo.getConfig.mockReturnValue({
        enabled: true,
        participatingProviders: ['openai'],
        initialCapital: 10000,
      });
      const mockBet: SimulatedBet = {
        id: 'bet-1', matchId: 'match1', provider: 'openai', team: 'TeamA',
        amount: 100, odds: 2.0, result: 'pending', profitLoss: 0, placedAt: '2024-01-01T00:00:00Z',
      };
      bettingEngine.placeBetFromAnalysis.mockReturnValue(mockBet);

      const result = service.autoBetFromAnalysis('match1', mockAnalysisResults, 0.5, 'TeamA', 'TeamB');

      // Only openai should produce a bet; anthropic is skipped
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('openai');
      expect(bettingEngine.placeBetFromAnalysis).toHaveBeenCalledTimes(1);
    });

    it('does not call upsertBet when betting engine returns null', () => {
      simRepo.getConfig.mockReturnValue({ enabled: true, participatingProviders: [], initialCapital: 10000 });
      bettingEngine.placeBetFromAnalysis.mockReturnValue(null);

      const result = service.autoBetFromAnalysis('match1', mockAnalysisResults, 0.5, 'TeamA', 'TeamB');

      expect(result).toEqual([]);
      expect(llmRepo.upsertBet).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // getProviderStats
  // ----------------------------------------------------------
  describe('getProviderStats', () => {
    it('returns stats for all default providers when no participating list', () => {
      simRepo.getConfig.mockReturnValue({ enabled: true, participatingProviders: [], initialCapital: 10000 });
      llmRepo.getBetsByProviders.mockReturnValue([]);
      const mockStats = { provider: 'openai', totalBets: 0, winRate: 0, profitLoss: 0, roi: 0 };
      bettingEngine.calculateProviderStats.mockReturnValue(mockStats);

      const result = service.getProviderStats();

      // Default providers: openai, anthropic, google, deepseek, xai, groq (6)
      expect(result).toHaveLength(6);
      expect(bettingEngine.calculateProviderStats).toHaveBeenCalledTimes(6);
    });

    it('returns stats only for participating providers', () => {
      simRepo.getConfig.mockReturnValue({
        enabled: true,
        participatingProviders: ['openai', 'anthropic'],
        initialCapital: 10000,
      });
      llmRepo.getBetsByProviders.mockReturnValue([]);
      bettingEngine.calculateProviderStats.mockReturnValue({ provider: 'openai', totalBets: 0 });

      const result = service.getProviderStats();

      expect(result).toHaveLength(2);
      expect(bettingEngine.calculateProviderStats).toHaveBeenCalledTimes(2);
    });
  });

  // ----------------------------------------------------------
  // getEquityCurve
  // ----------------------------------------------------------
  describe('getEquityCurve', () => {
    it('returns equity curve for specified provider', () => {
      simRepo.getConfig.mockReturnValue({ enabled: true, participatingProviders: [], initialCapital: 10000 });
      const mockCurve = [
        { date: '2024-01-01', equity: 10000 },
        { date: '2024-01-02', equity: 10100 },
      ];
      llmRepo.getEquityCurveByProvider.mockReturnValue(mockCurve);

      const result = service.getEquityCurve('openai');

      expect(result).toEqual(mockCurve);
      expect(llmRepo.getEquityCurveByProvider).toHaveBeenCalledWith('openai', 10000);
    });
  });

  // ----------------------------------------------------------
  // getAllEquityCurves
  // ----------------------------------------------------------
  describe('getAllEquityCurves', () => {
    it('returns equity curves for all default providers', () => {
      simRepo.getConfig.mockReturnValue({ enabled: true, participatingProviders: [], initialCapital: 10000 });
      const mockCurve = [{ date: '2024-01-01', equity: 10000 }];
      llmRepo.getEquityCurveByProvider.mockReturnValue(mockCurve);

      const result = service.getAllEquityCurves();

      // 6 default providers
      expect(Object.keys(result)).toHaveLength(6);
      expect(result.openai).toEqual(mockCurve);
      expect(llmRepo.getEquityCurveByProvider).toHaveBeenCalledTimes(6);
    });
  });

  // ----------------------------------------------------------
  // getBetHistory
  // ----------------------------------------------------------
  describe('getBetHistory', () => {
    it('returns bet history for specified provider with default limit', () => {
      const mockBets: SimulatedBet[] = [
        { id: 'bet-1', matchId: 'm1', provider: 'openai', team: 'TeamA', amount: 100, odds: 2.0, result: 'pending', profitLoss: 0, placedAt: '2024-01-01T00:00:00Z' },
      ];
      llmRepo.getBetsByProvider.mockReturnValue(mockBets);

      const result = service.getBetHistory('openai');

      expect(result).toEqual(mockBets);
      expect(llmRepo.getBetsByProvider).toHaveBeenCalledWith('openai', 50);
    });

    it('uses provided limit', () => {
      llmRepo.getBetsByProvider.mockReturnValue([]);

      service.getBetHistory('openai', 10);

      expect(llmRepo.getBetsByProvider).toHaveBeenCalledWith('openai', 10);
    });
  });
});
