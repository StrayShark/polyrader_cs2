import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HunyuanClient } from '../hunyuan-client';

describe('HunyuanClient', () => {
  let client: HunyuanClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new HunyuanClient('test-key');
  });

  it('默认模型为 hy3-preview（通过请求体验证）', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}', reasoning_content: '思考1思考2' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('hy3-preview');
  });

  it('使用 TokenHub Base URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    await client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tokenhub.tencentmaas.com');
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

  it('complete() 正常返回内容', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '回复内容', reasoning_content: '思考' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const result = await client.complete({ system: '系统', user: '用户' });
    expect(result).toBe('回复内容');
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('Hunyuan API error: 400');
  });
});
