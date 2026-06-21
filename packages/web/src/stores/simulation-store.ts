import { create } from 'zustand';
import { api } from '../utils/api';
import type { SimulationConfig, ProviderSimulationStats, EquityCurvePoint } from '@polyrader/core';

interface SimulationState {
  config: SimulationConfig | null;
  providerStats: ProviderSimulationStats[];
  equityCurves: Record<string, EquityCurvePoint[]>;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (config: Partial<SimulationConfig>) => Promise<boolean>;
  fetchProviderStats: () => Promise<void>;
  fetchEquityCurves: () => Promise<void>;
}

const DEFAULT_CONFIG: Partial<SimulationConfig> = {
  enabled: false,
  initialCapital: 10000,
  betStrategy: 'fixed',
  betAmount: 100,
  maxBetFraction: 0.05,
  minConfidence: 0.6,
  minEdge: 0.05,
  oddsSource: 'market',
  participatingProviders: [],
  autoSettle: true,
};

export const useSimulationStore = create<SimulationState>((set) => ({
  config: null,
  providerStats: [],
  equityCurves: {},
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    try {
      const res = await api.get<{ data: SimulationConfig }>('/simulation/config');
      set({ config: res.data ?? (DEFAULT_CONFIG as SimulationConfig) });
    } catch {
      set({ config: DEFAULT_CONFIG as SimulationConfig });
    }
  },

  updateConfig: async (config) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.put<{ data: SimulationConfig }>('/simulation/config', config);
      set({ config: res.data, isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  fetchProviderStats: async () => {
    try {
      const res = await api.get<{ data: ProviderSimulationStats[] }>('/simulation/stats');
      set({ providerStats: res.data ?? [] });
    } catch {
      set({ providerStats: [] });
    }
  },

  fetchEquityCurves: async () => {
    try {
      const res = await api.get<{ data: Record<string, EquityCurvePoint[]> }>('/simulation/equity-curves');
      set({ equityCurves: res.data ?? {} });
    } catch {
      set({ equityCurves: {} });
    }
  },
}));
