import { create } from 'zustand';
import type { FollowedWallet, WalletCopyConfig, WalletCopySignal, CopyTrade } from '@polyrader/core';
import { api } from '../utils/api';

interface WalletFollowState {
  followed: FollowedWallet[];
  followedSet: Set<string>;
  config: WalletCopyConfig | null;
  signals: WalletCopySignal[];
  copyTrades: CopyTrade[];
  isLoading: boolean;
  error: string | null;
  fetchFollowed: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchSignals: () => Promise<void>;
  fetchCopyTrades: () => Promise<void>;
  follow: (address: string, options?: { autoCopyEnabled?: boolean }) => Promise<void>;
  unfollow: (address: string) => Promise<void>;
  updateConfig: (partial: Partial<WalletCopyConfig>) => Promise<void>;
  executeSignal: (signalId: string) => Promise<void>;
  isFollowed: (address: string) => boolean;
}

export const useWalletFollowStore = create<WalletFollowState>((set, get) => ({
  followed: [],
  followedSet: new Set(),
  config: null,
  signals: [],
  copyTrades: [],
  isLoading: false,
  error: null,

  fetchFollowed: async () => {
    try {
      const { data } = await api.get<{ data: FollowedWallet[] }>('/whale-follow');
      set({ followed: data, followedSet: new Set(data.map((w) => w.address.toLowerCase())) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchConfig: async () => {
    try {
      const { data } = await api.get<{ data: WalletCopyConfig }>('/whale-follow/config');
      set({ config: data });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchSignals: async () => {
    try {
      const { data } = await api.get<{ data: WalletCopySignal[] }>('/whale-follow/signals?limit=30');
      set({ signals: data });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchCopyTrades: async () => {
    try {
      const { data } = await api.get<{ data: CopyTrade[] }>('/whale-follow/trades?limit=30');
      set({ copyTrades: data });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  follow: async (address, options) => {
    await api.post('/whale-follow', {
      address,
      autoCopyEnabled: options?.autoCopyEnabled ?? false,
      alertsEnabled: true,
    });
    await get().fetchFollowed();
  },

  unfollow: async (address) => {
    await api.delete(`/whale-follow/${address}`);
    await get().fetchFollowed();
  },

  updateConfig: async (partial) => {
    const { data } = await api.put<{ data: WalletCopyConfig }>('/whale-follow/config', partial);
    set({ config: data });
  },

  executeSignal: async (signalId) => {
    await api.post(`/whale-follow/signals/${signalId}/execute`);
    await Promise.all([get().fetchSignals(), get().fetchCopyTrades()]);
  },

  isFollowed: (address) => get().followedSet.has(address.toLowerCase()),
}));
