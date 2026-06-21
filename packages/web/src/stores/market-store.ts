import { create } from 'zustand';
import type { Market } from '@polyrader/core';
import { api } from '../utils/api';

interface MarketState {
  markets: Market[];
  selectedMarket: Market | null;
  isLoading: boolean;
  error: string | null;
  fetchMarkets: (limit?: number, offset?: number) => Promise<void>;
}

export const useMarketStore = create<MarketState>((set) => ({
  markets: [],
  selectedMarket: null,
  isLoading: false,
  error: null,

  fetchMarkets: async (limit = 50, offset = 0) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: Market[] }>(`/markets?limit=${limit}&offset=${offset}`);
      set({ markets: data ?? [], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
