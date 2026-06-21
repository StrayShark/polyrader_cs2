import { create } from 'zustand';
import type { LLMConfig, LLMStats, LLMAggregation, ConnectivityResult, LLMProvider } from '@polyrader/core';
import { api } from '../utils/api';

interface LLMState {
  configs: LLMConfig[];
  stats: LLMStats[];
  aggregation: LLMAggregation | null;
  isLoading: boolean;
  error: string | null;
  fetchConfigs: () => Promise<void>;
  setKey: (providerId: string, apiKey: string, model?: string) => Promise<void>;
  testConnection: (providerId: string) => Promise<ConnectivityResult>;
  fetchLeaderboard: () => Promise<void>;
  settleBet: (id: string, result: 'won' | 'lost', profitLoss?: number) => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
}

export const useLLMStore = create<LLMState>((set) => ({
  configs: [],
  stats: [],
  aggregation: null,
  isLoading: false,
  error: null,

  fetchConfigs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: LLMConfig[] }>('/ai/config/keys');
      set({ configs: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  setKey: async (providerId, apiKey, model) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/ai/config/keys/${providerId}`, { apiKey, model });
      // Refresh configs
      const { data } = await api.get<{ data: LLMConfig[] }>('/ai/config/keys');
      set({ configs: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  testConnection: async (providerId) => {
    try {
      const { data } = await api.post<{ data: ConnectivityResult }>(`/ai/config/test/${providerId}`);
      return data;
    } catch {
      return { provider: providerId as LLMProvider, success: false, latency: 0, error: 'Test failed', testedAt: new Date().toISOString() };
    }
  },

  fetchLeaderboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: LLMStats[] }>('/ai/stats/leaderboard');
      set({ stats: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  settleBet: async (id, result, profitLoss) => {
    try {
      await api.patch(`/ai/stats/bet/${id}`, { result, profitLoss });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteBet: async (id) => {
    try {
      await api.delete(`/ai/stats/bet/${id}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
