import { describe, it, expect } from 'vitest';
import {
  classifyEventTier,
  tierMeetsMinimum,
  tierDescription,
  TIER_ORDER,
  type EventTier,
} from '../../utils/tier-classifier';

describe('tier-classifier', () => {
  describe('classifyEventTier — keyword matching', () => {
    it('classifies Majors as S-tier', () => {
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'BLAST.tv Paris Major 2025' })).toBe('S');
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'PGL Major Copenhagen' })).toBe('S');
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'Perfect World Major Shanghai' })).toBe('S');
    });

    it('classifies IEM Katowice/Cologne as S-tier', () => {
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'IEM Katowice 2025' })).toBe('S');
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'IEM Cologne 2025' })).toBe('S');
    });

    it('classifies BLAST Premier World Final as S-tier', () => {
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'BLAST Premier World Final' })).toBe('S');
    });

    it('classifies ESL Pro League as A-tier', () => {
      expect(classifyEventTier({ stars: 4, eventType: 'LAN', eventName: 'ESL Pro League Season 21' })).toBe('A');
    });

    it('classifies BLAST Premier Spring as A-tier', () => {
      expect(classifyEventTier({ stars: 4, eventType: 'LAN', eventName: 'BLAST Premier Spring Final' })).toBe('A');
    });

    it('classifies IEM Dallas as A-tier', () => {
      expect(classifyEventTier({ stars: 4, eventType: 'LAN', eventName: 'IEM Dallas 2025' })).toBe('A');
    });

    it('classifies RMR as B-tier', () => {
      expect(classifyEventTier({ stars: 2, eventType: 'LAN', eventName: 'EU RMR A' })).toBe('B');
    });

    it('classifies ESEA Premier as B-tier', () => {
      expect(classifyEventTier({ stars: 1, eventType: 'Online', eventName: 'ESEA Premier Season 50' })).toBe('B');
    });
  });

  describe('classifyEventTier — star rating fallback', () => {
    it('5 stars → S', () => {
      expect(classifyEventTier({ stars: 5, eventType: 'LAN', eventName: 'Unknown Event' })).toBe('S');
    });

    it('4 stars → A', () => {
      expect(classifyEventTier({ stars: 4, eventType: 'LAN', eventName: 'Unknown Event' })).toBe('A');
    });

    it('3 stars → B', () => {
      expect(classifyEventTier({ stars: 3, eventType: 'LAN', eventName: 'Unknown Event' })).toBe('B');
    });

    it('2 stars LAN → B', () => {
      expect(classifyEventTier({ stars: 2, eventType: 'LAN', eventName: 'Unknown LAN' })).toBe('B');
    });

    it('1 star LAN → C', () => {
      expect(classifyEventTier({ stars: 1, eventType: 'LAN', eventName: 'Unknown LAN' })).toBe('C');
    });

    it('2 stars online → B', () => {
      expect(classifyEventTier({ stars: 2, eventType: 'Online', eventName: 'Unknown Cup' })).toBe('B');
    });

    it('0 stars online → C', () => {
      expect(classifyEventTier({ stars: 0, eventType: 'Online', eventName: 'Random Cup' })).toBe('C');
    });
  });

  describe('classifyEventTier — prize pool fallback', () => {
    it('prize ≥ $500k → A', () => {
      expect(classifyEventTier({ stars: 0, eventType: 'LAN', eventName: 'X', prizePool: 500_000 })).toBe('A');
    });

    it('prize ≥ $100k → B', () => {
      expect(classifyEventTier({ stars: 0, eventType: 'Online', eventName: 'X', prizePool: 100_000 })).toBe('B');
    });

    it('prize ≥ $25k → C', () => {
      expect(classifyEventTier({ stars: 0, eventType: 'Online', eventName: 'X', prizePool: 25_000 })).toBe('C');
    });

    it('prize < $25k → C', () => {
      expect(classifyEventTier({ stars: 0, eventType: 'Online', eventName: 'X', prizePool: 5_000 })).toBe('C');
    });
  });

  describe('tierMeetsMinimum', () => {
    it('S meets all minimums', () => {
      expect(tierMeetsMinimum('S', 'S')).toBe(true);
      expect(tierMeetsMinimum('S', 'A')).toBe(true);
      expect(tierMeetsMinimum('S', 'B')).toBe(true);
      expect(tierMeetsMinimum('S', 'C')).toBe(true);
    });

    it('A meets A/B/C but not S', () => {
      expect(tierMeetsMinimum('A', 'S')).toBe(false);
      expect(tierMeetsMinimum('A', 'A')).toBe(true);
      expect(tierMeetsMinimum('A', 'B')).toBe(true);
      expect(tierMeetsMinimum('A', 'C')).toBe(true);
    });

    it('B meets B/C but not A/S', () => {
      expect(tierMeetsMinimum('B', 'S')).toBe(false);
      expect(tierMeetsMinimum('B', 'A')).toBe(false);
      expect(tierMeetsMinimum('B', 'B')).toBe(true);
      expect(tierMeetsMinimum('B', 'C')).toBe(true);
    });

    it('C meets only C', () => {
      expect(tierMeetsMinimum('C', 'S')).toBe(false);
      expect(tierMeetsMinimum('C', 'A')).toBe(false);
      expect(tierMeetsMinimum('C', 'B')).toBe(false);
      expect(tierMeetsMinimum('C', 'C')).toBe(true);
    });

    it('undefined tier fails all minimums', () => {
      expect(tierMeetsMinimum(undefined, 'C')).toBe(false);
      expect(tierMeetsMinimum(undefined, 'S')).toBe(false);
    });
  });

  describe('TIER_ORDER', () => {
    it('ranks S > A > B > C', () => {
      expect(TIER_ORDER.S).toBeGreaterThan(TIER_ORDER.A);
      expect(TIER_ORDER.A).toBeGreaterThan(TIER_ORDER.B);
      expect(TIER_ORDER.B).toBeGreaterThan(TIER_ORDER.C);
    });
  });

  describe('tierDescription', () => {
    it('returns non-empty description for each tier', () => {
      (['S', 'A', 'B', 'C'] as EventTier[]).forEach((t) => {
        const desc = tierDescription(t);
        expect(desc).toBeTruthy();
        expect(desc.startsWith(t)).toBe(true);
      });
    });
  });
});
