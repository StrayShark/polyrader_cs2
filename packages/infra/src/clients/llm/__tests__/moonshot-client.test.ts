import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoonshotClient } from '../moonshot-client';

describe('MoonshotClient', () => {
  let client: MoonshotClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new MoonshotClient('test-key');
  });

  it('在 analyze() 请求体中包含 thinking: { type: "enabled" }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}', reasoning_content: '思考1思考2' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.model).toBe('kimi-k2.7-code');
  });

  it('在 complete() 请求体中包含 thinking: { type: "enabled" }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '回复内容', reasoning_content: '' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  it('从 analyze() 响应中提取 reasoning_content 到 thinkingProcess', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}', reasoning_content: '思考1思考2' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    const result = await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });
    expect(result.thinkingProcess).toBe('思考1思考2');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('Moonshot API error: 400');
  });
});
