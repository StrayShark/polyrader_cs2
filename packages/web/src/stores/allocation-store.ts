import { create } from 'zustand';
import type { BankrollConfig, BankrollState, AllocationPlan, RiskTolerance } from '@polyrader/core';
import { api } from '../utils/api';

interface AllocationState {
  config: BankrollConfig | null;
  bankrollState: BankrollState | null;
  latestPlan: AllocationPlan | null;
  history: AllocationPlan[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  fetchBankroll: () => Promise<void>;
  updateBankroll: (config: {
    totalCapital: number;
    targetReturnRate: number;
    riskTolerance: RiskTolerance;
    maxBetFraction?: number;
    maxTotalExposure?: number;
  }) => Promise<void>;
  createAllocation: (opportunities: Array<{
    matchId: string;
    matchLabel: string;
    team: string;
    winProbability: number;
    odds: number;
    kellyFraction: number;
    consensusLevel: 'strong' | 'moderate' | 'weak' | 'divergent';
    confidence: number;
    expectedValue: number;
  }>, useLLM?: boolean) => Promise<AllocationPlan | null>;
  fetchLatestPlan: () => Promise<void>;
  fetchHistory: (limit?: number) => Promise<void>;
}

export const useAllocationStore = create<AllocationState>((set, get) => ({
  config: null,
  bankrollState: null,
  latestPlan: null,
  history: [],
  isLoading: false,
  isGenerating: false,
  error: null,

  fetchBankroll: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: { config: BankrollConfig; state: BankrollState } }>('/allocation/bankroll');
      set({ config: data.config, bankrollState: data.state, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  updateBankroll: async (config) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<{ data: BankrollConfig }>('/allocation/bankroll', config);
      // Refresh state after config update
      await get().fetchBankroll();
      set({ config: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createAllocation: async (opportunities, useLLM = false) => {
    set({ isGenerating: true, error: null });
    try {
      const { data } = await api.post<{ data: AllocationPlan }>('/allocation/plan', { opportunities, useLLM });
      set({ latestPlan: data, isGenerating: false });
      // Refresh bankroll state after allocation
      await get().fetchBankroll();
      return data;
    } catch (err) {
      set({ error: (err as Error).message, isGenerating: false });
      return null;
    }
  },

  fetchLatestPlan: async () => {
    try {
      const { data } = await api.get<{ data: AllocationPlan | null }>('/allocation/plan/latest');
      set({ latestPlan: data });
    } catch {
      // ignore
    }
  },

  fetchHistory: async (limit = 20) => {
    try {
      const { data } = await api.get<{ data: AllocationPlan[] }>(`/allocation/plan/history?limit=${limit}`);
      set({ history: data });
    } catch {
      // ignore
    }
  },
}));
