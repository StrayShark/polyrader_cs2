import { create } from 'zustand';
import type { DailyDashboard } from '@polyrader/core';
import { api } from '../utils/api';

interface DailyState {
  dashboard: DailyDashboard | null;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
}

export const useDailyStore = create<DailyState>((set) => ({
  dashboard: null,
  isLoading: false,
  error: null,

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: DailyDashboard }>('/daily');
      set({ dashboard: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  refreshDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<{ data: DailyDashboard }>('/daily/refresh');
      set({ dashboard: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
