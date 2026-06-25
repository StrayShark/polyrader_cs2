import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XAIClient } from '../xai-client';

describe('XAIClient', () => {
  let client: XAIClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new XAIClient('test-key');
  });

  it('在 analyze() 请求体中为 Grok 4.3 添加 reasoning_effort: medium', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.model).toBe('grok-4.3');
    // 不应使用 reasoning.effort 结构
    expect(body.reasoning).toBeUndefined();
  });

  it('在 complete() 请求体中为 Grok 4.3 添加 reasoning_effort: medium', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '回复内容' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.reasoning).toBeUndefined();
  });

  it('非 Grok 4.3 模型不添加 reasoning_effort', async () => {
    const oldClient = new XAIClient('test-key', 'grok-2');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await oldClient.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('从 analyze() 响应中提取 choices[0].message.content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    const result = await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });
    expect(result.confidence).toBe(70);
    expect(result.reasoning).toBe('测试');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('xAI API error: 400');
  });
});
