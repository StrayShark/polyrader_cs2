import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicClient } from '../anthropic-client';

describe('AnthropicClient', () => {
  let client: AnthropicClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new AnthropicClient('test-key');
  });

  it('默认模型为 claude-sonnet-4-6（通过请求体验证）', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });

    await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('在 analyze() 请求体中设置 temperature 为 0.3 且无 reasoning 参数', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
    expect(body.reasoning).toBeUndefined();
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('在 complete() 请求体中设置 temperature 为 0.3', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '回复内容' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
    expect(body.reasoning).toBeUndefined();
  });

  it('Opus 4.8 模型不发送 temperature', async () => {
    const opusClient = new AnthropicClient('test-key', 'claude-opus-4-8');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });

    await opusClient.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
    expect(body.model).toBe('claude-opus-4-8');
  });

  it('请求头包含 x-api-key 和 anthropic-version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });

    await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('Anthropic API error: 401');
  });
});
