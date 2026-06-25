import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIClient } from '../openai-client';

describe('OpenAIClient', () => {
  let client: OpenAIClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new OpenAIClient('test-key');
  });

  it('默认模型为 gpt-5.5（通过请求体验证）', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-5.5');
  });

  it('在 analyze() 请求体中为 GPT-5 系列添加 reasoning.effort', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.model).toBe('gpt-5.5');
    expect(body.temperature).toBe(0.3);
  });

  it('在 complete() 请求体中为 GPT-5 系列添加 reasoning.effort', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '回复内容' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.model).toBe('gpt-5.5');
    expect(body.temperature).toBe(0.3);
  });

  it('非 GPT-5 模型不添加 reasoning 参数', async () => {
    const oldModelClient = new OpenAIClient('test-key', 'gpt-4o');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await oldModelClient.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toBeUndefined();
    expect(body.model).toBe('gpt-4o');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('OpenAI API error: 401');
  });
});
