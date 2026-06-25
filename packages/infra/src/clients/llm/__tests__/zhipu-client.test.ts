import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZhipuClient } from '../zhipu-client';

describe('ZhipuClient', () => {
  let client: ZhipuClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new ZhipuClient('test-key');
  });

  it('在 analyze() 请求体中包含 enable_thinking: true 和 reasoning_effort: max', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}', reasoning_content: '思考过程内容' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.enable_thinking).toBe(true);
    expect(body.reasoning_effort).toBe('max');
    expect(body.model).toBe('glm-5.2');
  });

  it('在 complete() 请求体中包含 enable_thinking: true 和 reasoning_effort: max', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '回复内容', reasoning_content: '思考' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.enable_thinking).toBe(true);
    expect(body.reasoning_effort).toBe('max');
  });

  it('从 analyze() 响应中提取 reasoning_content 到 thinkingProcess', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}', reasoning_content: '深度思考过程' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    const result = await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });
    expect(result.thinkingProcess).toBe('深度思考过程');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('Zhipu API error: 400');
  });
});
