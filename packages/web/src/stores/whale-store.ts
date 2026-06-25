import { create } from 'zustand';
import type { Whale } from '@polyrader/core';
import { api } from '../utils/api';

export type WhaleListMode = 'volume' | 'win_rate';

interface WhaleFetchOptions {
  limit?: number;
  sort?: WhaleListMode;
  minSamples?: number;
}

interface WhaleState {
  whales: Whale[];
  listMode: WhaleListMode;
  isLoading: boolean;
  error: string | null;
  fetchWhales: (options?: WhaleFetchOptions) => Promise<void>;
  setListMode: (mode: WhaleListMode) => void;
}

export const useWhaleStore = create<WhaleState>((set, get) => ({
  whales: [],
  listMode: 'volume',
  isLoading: false,
  error: null,

  setListMode: (mode) => {
    set({ listMode: mode });
  },

  fetchWhales: async (options) => {
    const state = get();
    const limit = options?.limit ?? 50;
    const sort = options?.sort ?? state.listMode;
    const minSamples = options?.minSamples ?? (sort === 'win_rate' ? 10 : 0);

    set({ isLoading: true, error: null, listMode: sort });
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        sort,
      });
      if (sort === 'win_rate') {
        params.set('minSamples', String(minSamples));
      }

      const { data } = await api.get<{ data: Whale[] }>(`/whales?${params.toString()}`);
      set({ whales: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
