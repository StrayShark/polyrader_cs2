import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock LLMRepository
const mockRepo = {
  getAllVariants: vi.fn(),
  getVariant: vi.fn(),
  upsertVariant: vi.fn(),
  deleteVariant: vi.fn(),
  getBetById: vi.fn(),
  upsertBet: vi.fn(),
  deleteBet: vi.fn(),
  getBets: vi.fn(),
  getBetsByProvider: vi.fn(),
  getAllStats: vi.fn(),
  getVariantStats: vi.fn(),
};

vi.mock('@polyrader/infra', () => ({
  LLMRepository: vi.fn().mockImplementation(() => mockRepo),
}));

import { createPromptVariantRouter } from '../controllers/prompt-variant-controller';
import { AiStatsService } from '../services/ai-stats-service';

// ============================================================
// Helpers
// ============================================================

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai/prompts', createPromptVariantRouter(mockRepo as never));
  return app;
}

// ============================================================
// Helpers
// ============================================================

const sampleVariant = {
  variantId: 'baseline',
  name: 'Baseline',
  systemPrompt: 'You are an expert CS2 analyst.',
  contextTemplate: '',
  outputSchema: '',
  isEnabled: true,
  trafficWeight: 1.0,
  isControl: true,
  notes: '',
  createdAt: '2026-06-19T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
};

const sampleBet = {
  id: 'bet-abc123',
  matchId: 'm1',
  provider: 'user' as const,
  team: 'TeamA',
  amount: 100,
  odds: 2.0,
  result: 'pending' as const,
  profitLoss: 0,
  placedAt: '2026-06-19T10:00:00Z',
  reasoning: '',
};

// ============================================================
// PromptVariantController tests
// ============================================================

describe('PromptVariantController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/ai/prompts', () => {
    it('returns all variants', async () => {
      mockRepo.getAllVariants.mockReturnValue([sampleVariant]);
      const res = await request(makeApp()).get('/api/ai/prompts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].variantId).toBe('baseline');
    });

    it('returns 500 on repo error', async () => {
      mockRepo.getAllVariants.mockImplementation(() => {
        throw new Error('DB error');
      });
      const res = await request(makeApp()).get('/api/ai/prompts');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch variants');
    });
  });

  describe('GET /api/ai/prompts/:variantId', () => {
    it('returns variant by id', async () => {
      mockRepo.getVariant.mockReturnValue(sampleVariant);
      const res = await request(makeApp()).get('/api/ai/prompts/baseline');

      expect(res.status).toBe(200);
      expect(res.body.data.variantId).toBe('baseline');
    });

    it('returns 404 when variant not found', async () => {
      mockRepo.getVariant.mockReturnValue(null);
      const res = await request(makeApp()).get('/api/ai/prompts/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Variant not found');
    });
  });

  describe('GET /api/ai/prompts/ab/compare', () => {
    const statsA = {
      totalAnalyses: 10,
      totalBets: 5,
      wonBets: 3,
      lostBets: 2,
      pendingBets: 0,
      profitLoss: 150,
      roi: 0.3,
      accuracy: 0.6,
    };
    const statsB = {
      totalAnalyses: 8,
      totalBets: 4,
      wonBets: 1,
      lostBets: 3,
      pendingBets: 0,
      profitLoss: -80,
      roi: -0.2,
      accuracy: 0.25,
    };

    it('returns stats for both variants', async () => {
      mockRepo.getVariantStats
        .mockReturnValueOnce(statsA)
        .mockReturnValueOnce(statsB);

      const res = await request(makeApp()).get('/api/ai/prompts/ab/compare?variantA=baseline&variantB=v2');

      expect(res.status).toBe(200);
      expect(res.body.data.variantA).toEqual(statsA);
      expect(res.body.data.variantB).toEqual(statsB);
      expect(mockRepo.getVariantStats).toHaveBeenCalledWith('baseline');
      expect(mockRepo.getVariantStats).toHaveBeenCalledWith('v2');
    });

    it('returns 400 when variantA is missing', async () => {
      const res = await request(makeApp()).get('/api/ai/prompts/ab/compare?variantB=v2');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(mockRepo.getVariantStats).not.toHaveBeenCalled();
    });

    it('returns 400 when variantB is missing', async () => {
      const res = await request(makeApp()).get('/api/ai/prompts/ab/compare?variantA=baseline');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(mockRepo.getVariantStats).not.toHaveBeenCalled();
    });

    it('returns 500 when repo throws', async () => {
      mockRepo.getVariantStats.mockImplementation(() => {
        throw new Error('DB error');
      });

      const res = await request(makeApp()).get('/api/ai/prompts/ab/compare?variantA=baseline&variantB=v2');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to compare variants');
    });

    it('does not match "ab" as a variantId parameter', async () => {
      // Ensures route ordering: /ab/compare must be matched before /:variantId
      mockRepo.getVariantStats.mockReturnValue(statsA);
      mockRepo.getVariant.mockReturnValue(sampleVariant);

      const res = await request(makeApp()).get('/api/ai/prompts/ab/compare?variantA=baseline&variantB=v2');

      expect(res.status).toBe(200);
      // getVariant (the /:variantId handler) should NOT be invoked for the compare route
      expect(mockRepo.getVariant).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/ai/prompts', () => {
    it('creates a new variant', async () => {
      mockRepo.getVariant.mockReturnValue(null);
      mockRepo.upsertVariant.mockImplementation(() => {});
      // After upsert, getVariant returns the created variant
      mockRepo.getVariant.mockReturnValueOnce(null).mockReturnValueOnce({
        ...sampleVariant,
        variantId: 'v2',
        name: 'Variant 2',
        isControl: false,
      });

      const res = await request(makeApp())
        .post('/api/ai/prompts')
        .send({
          variantId: 'v2',
          name: 'Variant 2',
          systemPrompt: 'You are an aggressive CS2 analyst.',
          trafficWeight: 0.5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.variantId).toBe('v2');
      expect(mockRepo.upsertVariant).toHaveBeenCalledOnce();
    });

    it('returns 409 when variant already exists', async () => {
      mockRepo.getVariant.mockReturnValue(sampleVariant);

      const res = await request(makeApp())
        .post('/api/ai/prompts')
        .send({
          variantId: 'baseline',
          name: 'Baseline',
          systemPrompt: 'test',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Variant already exists');
    });

    it('returns 400 on invalid body (missing variantId)', async () => {
      const res = await request(makeApp())
        .post('/api/ai/prompts')
        .send({ name: 'test', systemPrompt: 'test' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/ai/prompts/:variantId', () => {
    it('updates an existing variant (partial merge)', async () => {
      mockRepo.getVariant.mockReturnValue(sampleVariant);
      mockRepo.upsertVariant.mockImplementation(() => {});
      mockRepo.getVariant.mockReturnValueOnce(sampleVariant).mockReturnValueOnce({
        ...sampleVariant,
        notes: 'updated notes',
        trafficWeight: 0.3,
      });

      const res = await request(makeApp())
        .put('/api/ai/prompts/baseline')
        .send({ notes: 'updated notes', trafficWeight: 0.3 });

      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe('updated notes');
      expect(res.body.data.trafficWeight).toBe(0.3);
      // Should preserve existing fields not in update
      expect(mockRepo.upsertVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          variantId: 'baseline',
          name: 'Baseline',
          systemPrompt: 'You are an expert CS2 analyst.',
        }),
      );
    });

    it('returns 404 when variant not found', async () => {
      mockRepo.getVariant.mockReturnValue(null);

      const res = await request(makeApp())
        .put('/api/ai/prompts/nonexistent')
        .send({ notes: 'test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/ai/prompts/:variantId', () => {
    it('deletes a non-control variant', async () => {
      mockRepo.getVariant.mockReturnValue({ ...sampleVariant, isControl: false });

      const res = await request(makeApp()).delete('/api/ai/prompts/v2');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Variant deleted');
      expect(mockRepo.deleteVariant).toHaveBeenCalledWith('v2');
    });

    it('returns 400 when deleting control variant', async () => {
      mockRepo.getVariant.mockReturnValue(sampleVariant);

      const res = await request(makeApp()).delete('/api/ai/prompts/baseline');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot delete control variant');
      expect(mockRepo.deleteVariant).not.toHaveBeenCalled();
    });

    it('returns 404 when variant not found', async () => {
      mockRepo.getVariant.mockReturnValue(null);

      const res = await request(makeApp()).delete('/api/ai/prompts/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});

// ============================================================
// AiStatsService settleBet / deleteBet tests
// ============================================================

describe('AiStatsService.settleBet & deleteBet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settles a bet as won with auto-calculated profitLoss', async () => {
    const bet = { ...sampleBet, amount: 100, odds: 2.0 };
    mockRepo.getBetById.mockReturnValue(bet);
    mockRepo.upsertBet.mockImplementation(() => {});

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    const result = await service.settleBet('bet-abc123', 'won');

    expect(result).not.toBeNull();
    expect(result!.result).toBe('won');
    expect(result!.profitLoss).toBe(100); // 100 * (2.0 - 1) = 100
    expect(result!.settledAt).toBeTruthy();
    expect(mockRepo.upsertBet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bet-abc123',
        result: 'won',
        profitLoss: 100,
      }),
    );
  });

  it('settles a bet as lost with auto-calculated profitLoss', async () => {
    const bet = { ...sampleBet, amount: 200, odds: 1.5 };
    mockRepo.getBetById.mockReturnValue(bet);
    mockRepo.upsertBet.mockImplementation(() => {});

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    const result = await service.settleBet('bet-abc123', 'lost');

    expect(result).not.toBeNull();
    expect(result!.result).toBe('lost');
    expect(result!.profitLoss).toBe(-200); // -amount
  });

  it('uses provided profitLoss when valid', async () => {
    const bet = { ...sampleBet, amount: 100, odds: 2.0 };
    mockRepo.getBetById.mockReturnValue(bet);
    mockRepo.upsertBet.mockImplementation(() => {});

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    const result = await service.settleBet('bet-abc123', 'won', 250);

    expect(result!.profitLoss).toBe(250);
  });

  it('ignores NaN profitLoss and falls back to auto-calculation', async () => {
    const bet = { ...sampleBet, amount: 100, odds: 2.0 };
    mockRepo.getBetById.mockReturnValue(bet);
    mockRepo.upsertBet.mockImplementation(() => {});

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    const result = await service.settleBet('bet-abc123', 'won', NaN);

    expect(result!.profitLoss).toBe(100); // auto-calculated, not NaN
  });

  it('returns null when bet not found', async () => {
    mockRepo.getBetById.mockReturnValue(null);

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    const result = await service.settleBet('nonexistent', 'won');

    expect(result).toBeNull();
    expect(mockRepo.upsertBet).not.toHaveBeenCalled();
  });

  it('deletes a bet via deleteBet', async () => {
    mockRepo.deleteBet.mockImplementation(() => {});

    const service = new AiStatsService();
    // @ts-expect-error — accessing private field for test
    service.llmRepo = mockRepo;

    await service.deleteBet('bet-abc123');

    expect(mockRepo.deleteBet).toHaveBeenCalledWith('bet-abc123');
  });
});
