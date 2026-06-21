import { create } from 'zustand';
import type { Whale } from '@polyrader/core';
import { api } from '../utils/api';

interface WhaleState {
  whales: Whale[];
  selectedWhale: Whale | null;
  isLoading: boolean;
  error: string | null;
  fetchWhales: (limit?: number) => Promise<void>;
}

export const useWhaleStore = create<WhaleState>((set) => ({
  whales: [],
  selectedWhale: null,
  isLoading: false,
  error: null,

  fetchWhales: async (limit = 50) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: Whale[] }>(`/whales?limit=${limit}`);
      set({ whales: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
