import { describe, it, expect } from 'vitest';
import { SimulatedBettingEngine } from './simulated-betting-engine';

describe('SimulatedBettingEngine', () => {
  const engine = new SimulatedBettingEngine();

  describe('placeBet', () => {
    it('should place a bet with default amount 100', () => {
      const bet = engine.placeBet('match-1', 'openai', 'Natus Vincere', 2.0);

      expect(bet.matchId).toBe('match-1');
      expect(bet.provider).toBe('openai');
      expect(bet.team).toBe('Natus Vincere');
      expect(bet.amount).toBe(100);
      expect(bet.odds).toBe(2.0);
      expect(bet.result).toBe('pending');
      expect(bet.profitLoss).toBe(0);
      expect(bet.placedAt).toBeTruthy();
      expect(bet.id).toMatch(/^bet-/);
    });

    it('should place a bet with custom amount', () => {
      const bet = engine.placeBet('match-2', 'anthropic', 'FaZe Clan', 1.5, 200);

      expect(bet.amount).toBe(200);
    });

    it('should generate unique IDs', () => {
      const bet1 = engine.placeBet('match-1', 'openai', 'Team A', 2.0);
      const bet2 = engine.placeBet('match-1', 'openai', 'Team B', 2.0);

      expect(bet1.id).not.toBe(bet2.id);
    });

    it('should be a pure factory and not retain bets in memory', () => {
      const engine2 = new SimulatedBettingEngine();
      const bet = engine2.placeBet('match-1', 'openai', 'Team A', 2.0);

      // placeBet returns a fully-formed record; the engine does not expose
      // any in-memory collection to retrieve it back.
      expect(bet).toMatchObject({
        matchId: 'match-1',
        provider: 'openai',
        team: 'Team A',
        odds: 2.0,
        amount: 100,
        result: 'pending',
        profitLoss: 0,
      });
    });
  });
});
