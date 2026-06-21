import type { MatchInfo } from '../types/index';

/**
 * Match state machine — 7 states with transition rules.
 *
 * States:
 *   scheduled  → Match scheduled, >1h before start
 *   pre_match  → Within 1h of start, pre-match analysis active
 *   live       → Match in progress
 *   finished   → Match ended, awaiting settlement
 *   settled    → Market resolved and bets settled
 *   delayed    → Match delayed
 *   cancelled  → Match cancelled
 *
 * Data update frequencies by state:
 *   scheduled:  prices 30s, HLTV 6h, whales 5min, LLM 2h
 *   pre_match:  prices 10s, HLTV 1h, whales 1min, LLM 30min
 *   live:       prices realtime(WS), HLTV 30min, whales realtime, LLM paused
 *   finished:   all stopped except final settlement check
 *   settled:    all stopped
 *   delayed:    same as scheduled
 *   cancelled:  all stopped
 */
export type MatchState = MatchInfo['status'];

export interface UpdateFrequencies {
  prices: number;      // seconds, 0 = realtime WS
  hltv: number;        // seconds
  whales: number;      // seconds
  llm: number;         // seconds, 0 = paused
}

const UPDATE_FREQUENCIES: Record<MatchState, UpdateFrequencies> = {
  scheduled: { prices: 30, hltv: 21600, whales: 300, llm: 7200 },
  pre_match: { prices: 10, hltv: 3600, whales: 60, llm: 1800 },
  live: { prices: 0, hltv: 1800, whales: 0, llm: 0 },
  finished: { prices: 0, hltv: 0, whales: 0, llm: 0 },
  settled: { prices: 0, hltv: 0, whales: 0, llm: 0 },
  delayed: { prices: 30, hltv: 21600, whales: 300, llm: 7200 },
  cancelled: { prices: 0, hltv: 0, whales: 0, llm: 0 },
};

const TRANSITIONS: Record<MatchState, MatchState[]> = {
  scheduled: ['pre_match', 'delayed', 'cancelled'],
  pre_match: ['live', 'delayed', 'cancelled'],
  live: ['finished', 'delayed'],
  finished: ['settled'],
  settled: [],
  delayed: ['scheduled', 'cancelled'],
  cancelled: [],
};

export class MatchStateMachine {
  static getUpdateFrequencies(state: MatchState): UpdateFrequencies {
    return UPDATE_FREQUENCIES[state];
  }

  static canTransition(from: MatchState, to: MatchState): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static transition(current: MatchState, to: MatchState): MatchState {
    if (!this.canTransition(current, to)) {
      throw new Error(`Invalid state transition: ${current} → ${to}`);
    }
    return to;
  }

  /**
   * Determine the correct state based on match timing and market status.
   */
  static determineState(
    scheduledAt: string,
    marketStatus: 'active' | 'closed' | 'resolved',
    isLive: boolean,
  ): MatchState {
    if (marketStatus === 'resolved') return 'settled';
    if (marketStatus === 'closed') return 'finished';

    const now = Date.now();
    const start = new Date(scheduledAt).getTime();
    const oneHourMs = 60 * 60 * 1000;

    if (isLive) return 'live';
    if (now >= start) return 'live';
    if (now >= start - oneHourMs) return 'pre_match';
    return 'scheduled';
  }

  static isDataCollectionActive(state: MatchState): boolean {
    const freqs = UPDATE_FREQUENCIES[state];
    return freqs.prices > 0 || freqs.prices === 0 && state === 'live';
  }
}
