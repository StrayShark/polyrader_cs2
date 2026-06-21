import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ============================================================
// Test Zod schemas directly (unit test, no Express needed)
// ============================================================

const marketQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'closed', 'resolved']).optional(),
});

const analyzeBodySchema = z.object({
  matchId: z.string().min(1),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
});

const setKeyBodySchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

const providerParamsSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google', 'deepseek', 'xai', 'groq']),
});

const placeBetBodySchema = z.object({
  matchId: z.string().min(1),
  team: z.string().min(1),
  amount: z.number().min(10).max(10000),
  odds: z.number().min(1.01).max(100),
});

const whaleParamsSchema = z.object({
  address: z.string().min(1).regex(/^0x[a-fA-F0-9]{40}$/),
});

describe('Zod Schema Validation', () => {
  // ============================================================
  // Market query
  // ============================================================
  describe('marketQuerySchema', () => {
    it('accepts valid query', () => {
      expect(() => marketQuerySchema.parse({ limit: '10', offset: '0' })).not.toThrow();
    });

    it('rejects limit > 200', () => {
      expect(() => marketQuerySchema.parse({ limit: '999' })).toThrow();
    });

    it('rejects invalid status', () => {
      expect(() => marketQuerySchema.parse({ status: 'invalid' })).toThrow();
    });

    it('accepts valid status', () => {
      expect(() => marketQuerySchema.parse({ status: 'active' })).not.toThrow();
    });

    it('applies defaults', () => {
      const result = marketQuerySchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });
  });

  // ============================================================
  // Analyze body
  // ============================================================
  describe('analyzeBodySchema', () => {
    it('rejects empty body', () => {
      expect(() => analyzeBodySchema.parse({})).toThrow();
    });

    it('rejects wrong types', () => {
      expect(() => analyzeBodySchema.parse({ matchId: 123, teamAId: 'a', teamBId: 'b' })).toThrow();
    });

    it('accepts valid body', () => {
      expect(() => analyzeBodySchema.parse({
        matchId: 'match-1',
        teamAId: 'team-a',
        teamBId: 'team-b',
      })).not.toThrow();
    });
  });

  // ============================================================
  // SetKey
  // ============================================================
  describe('setKeyBodySchema', () => {
    it('rejects missing apiKey', () => {
      expect(() => setKeyBodySchema.parse({})).toThrow();
    });

    it('accepts valid request', () => {
      expect(() => setKeyBodySchema.parse({ apiKey: 'sk-test123' })).not.toThrow();
    });
  });

  describe('providerParamsSchema', () => {
    it('rejects invalid providerId', () => {
      expect(() => providerParamsSchema.parse({ providerId: 'unknown' })).toThrow();
    });

    it('accepts valid providerId', () => {
      expect(() => providerParamsSchema.parse({ providerId: 'openai' })).not.toThrow();
    });
  });

  // ============================================================
  // Bet
  // ============================================================
  describe('placeBetBodySchema', () => {
    it('rejects amount < 10', () => {
      expect(() => placeBetBodySchema.parse({
        matchId: 'test', team: 'Team A', amount: 5, odds: 2.0,
      })).toThrow();
    });

    it('rejects odds < 1.01', () => {
      expect(() => placeBetBodySchema.parse({
        matchId: 'test', team: 'Team A', amount: 100, odds: 0.5,
      })).toThrow();
    });

    it('rejects amount > 10000', () => {
      expect(() => placeBetBodySchema.parse({
        matchId: 'test', team: 'Team A', amount: 99999, odds: 2.0,
      })).toThrow();
    });

    it('accepts valid bet', () => {
      expect(() => placeBetBodySchema.parse({
        matchId: 'test', team: 'Team A', amount: 100, odds: 2.0,
      })).not.toThrow();
    });
  });

  // ============================================================
  // Whale address
  // ============================================================
  describe('whaleParamsSchema', () => {
    it('rejects invalid address', () => {
      expect(() => whaleParamsSchema.parse({ address: 'not-an-address' })).toThrow();
    });

    it('accepts valid Ethereum address', () => {
      expect(() => whaleParamsSchema.parse({
        address: '0x1234567890abcdef1234567890abcdef12345678',
      })).not.toThrow();
    });
  });

  // ============================================================
  // WS message schema
  // ============================================================
  describe('wsMessageSchema', () => {
    const wsMessageSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('subscribe'), channel: z.string().min(1).max(64) }),
      z.object({ type: z.literal('unsubscribe'), channel: z.string().min(1).max(64) }),
      z.object({ type: z.literal('ping'), sentAt: z.number().optional() }),
    ]);

    it('accepts subscribe message', () => {
      expect(() => wsMessageSchema.parse({ type: 'subscribe', channel: 'markets' })).not.toThrow();
    });

    it('rejects unknown type', () => {
      expect(() => wsMessageSchema.parse({ type: 'hack', data: 'evil' })).toThrow();
    });

    it('rejects missing channel on subscribe', () => {
      expect(() => wsMessageSchema.parse({ type: 'subscribe' })).toThrow();
    });

    it('rejects channel too long', () => {
      expect(() => wsMessageSchema.parse({ type: 'subscribe', channel: 'x'.repeat(65) })).toThrow();
    });
  });
});
