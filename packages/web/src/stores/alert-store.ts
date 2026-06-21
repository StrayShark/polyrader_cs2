import { create } from 'zustand';
import { api } from '../utils/api';

export type AlertType = 'price_above' | 'price_below' | 'volume_above';

export interface PriceAlert {
  id: string;
  marketSlug: string;
  marketQuestion: string;
  alertType: AlertType;
  threshold: number;
  currentValue: number;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AlertState {
  alerts: PriceAlert[];
  isLoading: boolean;
  error: string | null;
  fetchAlerts: (triggered?: boolean) => Promise<void>;
  createAlert: (input: {
    marketSlug: string;
    marketQuestion: string;
    alertType: AlertType;
    threshold: number;
  }) => Promise<boolean>;
  updateAlert: (id: string, input: {
    threshold?: number;
    currentValue?: number;
    triggered?: boolean;
  }) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  isLoading: false,
  error: null,

  fetchAlerts: async (triggered?) => {
    set({ isLoading: true, error: null });
    try {
      const queryStr = triggered === undefined ? '' : `?triggered=${triggered}`;
      const { data } = await api.get<{ data: PriceAlert[] }>(`/alerts${queryStr}`);
      set({ alerts: data ?? [], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createAlert: async (input) => {
    set({ error: null });
    try {
      const { data } = await api.post<{ data: PriceAlert }>('/alerts', input);
      set({ alerts: [data, ...get().alerts] });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  updateAlert: async (id, input) => {
    try {
      const { data } = await api.put<{ data: PriceAlert }>(`/alerts/${id}`, input);
      set({ alerts: get().alerts.map((a) => (a.id === id ? data : a)) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteAlert: async (id) => {
    try {
      await api.delete(`/alerts/${id}`);
      set({ alerts: get().alerts.filter((a) => a.id !== id) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
