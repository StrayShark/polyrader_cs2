import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatchStateMachine } from './match-state-machine';
import type { MatchState, UpdateFrequencies } from './match-state-machine';

describe('MatchStateMachine', () => {
  // ============================================================
  // Valid transitions
  // ============================================================
  describe('canTransition — valid transitions', () => {
    const valid: Array<[MatchState, MatchState]> = [
      ['scheduled', 'pre_match'],
      ['scheduled', 'delayed'],
      ['scheduled', 'cancelled'],
      ['pre_match', 'live'],
      ['pre_match', 'delayed'],
      ['pre_match', 'cancelled'],
      ['live', 'finished'],
      ['live', 'delayed'],
      ['finished', 'settled'],
      ['delayed', 'scheduled'],
      ['delayed', 'cancelled'],
    ];

    it.each(valid)('allows %s → %s', (from, to) => {
      expect(MatchStateMachine.canTransition(from, to)).toBe(true);
    });
  });

  // ============================================================
  // Invalid transitions
  // ============================================================
  describe('canTransition — invalid transitions', () => {
    const invalid: Array<[MatchState, MatchState]> = [
      ['scheduled', 'live'],
      ['scheduled', 'finished'],
      ['scheduled', 'settled'],
      ['pre_match', 'scheduled'],
      ['live', 'scheduled'],
      ['live', 'pre_match'],
      ['finished', 'live'],
      ['finished', 'scheduled'],
      ['settled', 'scheduled'],
      ['settled', 'live'],
      ['cancelled', 'scheduled'],
      ['cancelled', 'live'],
    ];

    it.each(invalid)('rejects %s → %s', (from, to) => {
      expect(MatchStateMachine.canTransition(from, to)).toBe(false);
    });
  });

  // ============================================================
  // transition()
  // ============================================================
  describe('transition', () => {
    it('returns the target state for a valid transition', () => {
      expect(MatchStateMachine.transition('scheduled', 'pre_match')).toBe('pre_match');
    });

    it('returns the target state for finished → settled', () => {
      expect(MatchStateMachine.transition('finished', 'settled')).toBe('settled');
    });

    it('throws on an invalid transition', () => {
      expect(() => MatchStateMachine.transition('scheduled', 'live')).toThrow(
        'Invalid state transition: scheduled → live',
      );
    });

    it('throws when transitioning from a terminal state (settled)', () => {
      expect(() => MatchStateMachine.transition('settled', 'scheduled')).toThrow();
    });

    it('throws when transitioning from a terminal state (cancelled)', () => {
      expect(() => MatchStateMachine.transition('cancelled', 'live')).toThrow();
    });
  });

  // ============================================================
  // determineState()
  // ============================================================
  describe('determineState', () => {
    const NOW = new Date('2025-06-20T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns settled when market is resolved', () => {
      expect(MatchStateMachine.determineState('2025-06-20T12:00:00Z', 'resolved', false)).toBe('settled');
    });

    it('returns settled when market is resolved even if match is in the future', () => {
      expect(MatchStateMachine.determineState('2025-06-20T14:00:00Z', 'resolved', false)).toBe('settled');
    });

    it('returns finished when market is closed', () => {
      expect(MatchStateMachine.determineState('2025-06-20T12:00:00Z', 'closed', false)).toBe('finished');
    });

    it('returns live when isLive is true regardless of scheduled time', () => {
      expect(MatchStateMachine.determineState('2025-06-20T14:00:00Z', 'active', true)).toBe('live');
    });

    it('returns live when current time equals start time', () => {
      expect(MatchStateMachine.determineState('2025-06-20T12:00:00Z', 'active', false)).toBe('live');
    });

    it('returns live when start time has passed', () => {
      expect(MatchStateMachine.determineState('2025-06-20T10:00:00Z', 'active', false)).toBe('live');
    });

    it('returns pre_match when within 1h before start', () => {
      // 30 min before start
      expect(MatchStateMachine.determineState('2025-06-20T12:30:00Z', 'active', false)).toBe('pre_match');
    });

    it('returns pre_match at exactly 1h before start', () => {
      // exactly 1h before start → now >= start - 1h
      expect(MatchStateMachine.determineState('2025-06-20T13:00:00Z', 'active', false)).toBe('pre_match');
    });

    it('returns scheduled when more than 1h before start', () => {
      // 2h before start
      expect(MatchStateMachine.determineState('2025-06-20T14:00:00Z', 'active', false)).toBe('scheduled');
    });

    it('returns scheduled for a match far in the future', () => {
      expect(MatchStateMachine.determineState('2025-07-20T12:00:00Z', 'active', false)).toBe('scheduled');
    });
  });

  // ============================================================
  // getUpdateFrequencies()
  // ============================================================
  describe('getUpdateFrequencies', () => {
    const expected: Array<[MatchState, UpdateFrequencies]> = [
      ['scheduled', { prices: 30, hltv: 21600, whales: 300, llm: 7200 }],
      ['pre_match', { prices: 10, hltv: 3600, whales: 60, llm: 1800 }],
      ['live', { prices: 0, hltv: 1800, whales: 0, llm: 0 }],
      ['finished', { prices: 0, hltv: 0, whales: 0, llm: 0 }],
      ['settled', { prices: 0, hltv: 0, whales: 0, llm: 0 }],
      ['delayed', { prices: 30, hltv: 21600, whales: 300, llm: 7200 }],
      ['cancelled', { prices: 0, hltv: 0, whales: 0, llm: 0 }],
    ];

    it.each(expected)('returns correct frequencies for %s', (state, freq) => {
      expect(MatchStateMachine.getUpdateFrequencies(state)).toEqual(freq);
    });

    it('has identical frequencies for delayed and scheduled', () => {
      expect(MatchStateMachine.getUpdateFrequencies('delayed')).toEqual(
        MatchStateMachine.getUpdateFrequencies('scheduled'),
      );
    });

    it('returns llm paused (0) for live state', () => {
      expect(MatchStateMachine.getUpdateFrequencies('live').llm).toBe(0);
    });
  });

  // ============================================================
  // isDataCollectionActive()
  // ============================================================
  describe('isDataCollectionActive', () => {
    const cases: Array<[MatchState, boolean]> = [
      ['scheduled', true],
      ['pre_match', true],
      ['live', true],
      ['finished', false],
      ['settled', false],
      ['delayed', true],
      ['cancelled', false],
    ];

    it.each(cases)('returns %s for state %s', (state, expected) => {
      expect(MatchStateMachine.isDataCollectionActive(state)).toBe(expected);
    });

    it('returns true for live despite prices being 0 (realtime WS)', () => {
      expect(MatchStateMachine.isDataCollectionActive('live')).toBe(true);
    });

    it('returns false for finished (all collection stopped)', () => {
      expect(MatchStateMachine.isDataCollectionActive('finished')).toBe(false);
    });
  });
});
