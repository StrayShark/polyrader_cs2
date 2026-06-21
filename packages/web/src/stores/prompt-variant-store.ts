import { create } from 'zustand';
import type { PromptVariant } from '@polyrader/core';
import { api } from '../utils/api';

interface PromptVariantState {
  variants: PromptVariant[];
  isLoading: boolean;
  error: string | null;
  fetchVariants: () => Promise<void>;
  createVariant: (data: {
    variantId: string;
    name: string;
    systemPrompt: string;
    trafficWeight?: number;
    notes?: string;
  }) => Promise<void>;
  updateVariant: (variantId: string, data: Partial<PromptVariant>) => Promise<void>;
  deleteVariant: (variantId: string) => Promise<void>;
}

export const usePromptVariantStore = create<PromptVariantState>((set) => ({
  variants: [],
  isLoading: false,
  error: null,

  fetchVariants: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ data: PromptVariant[] }>('/ai/prompts');
      set({ variants: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createVariant: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/ai/prompts', data);
      const { data: variants } = await api.get<{ data: PromptVariant[] }>('/ai/prompts');
      set({ variants, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  updateVariant: async (variantId, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/ai/prompts/${variantId}`, data);
      const { data: variants } = await api.get<{ data: PromptVariant[] }>('/ai/prompts');
      set({ variants, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  deleteVariant: async (variantId) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/ai/prompts/${variantId}`);
      const { data: variants } = await api.get<{ data: PromptVariant[] }>('/ai/prompts');
      set({ variants, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
