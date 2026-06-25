import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DoubaoClient } from '../doubao-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('DoubaoClient', () => {
  let client: DoubaoClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DoubaoClient('test-key');
  });

  it('默认模型为 doubao-seed-2.0-pro，通过请求体验证', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: '{"winProbability":{"teamA":0.6,"teamB":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    );

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callArgs.model).toBe('doubao-seed-2.0-pro');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/coding/v3/chat/completions');
  });

  it('analyze() 请求中包含 system + output schema 合并、user context', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: '{"winProbability":{"teamA":0.6,"teamB":0.4},"confidence":70,"reasoning":"测试","keyFactors":[],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    );

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[0].content).toContain('系统提示');
    expect(callArgs.messages[0].content).toContain('Output format:');
    expect(callArgs.messages[0].content).toContain('schema');
    expect(callArgs.messages[1].role).toBe('user');
    expect(callArgs.messages[1].content).toBe('上下文');
  });

  it('analyze() 返回解析后的 LLMAnalysisResult', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: '{"winProbability":{"teamA":0.6,"teamB":0.4},"confidence":70,"reasoning":"FURIA更强","keyFactors":["近期状态"],"riskAssessment":"低风险"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'doubao-seed-2.0-pro',
      }),
    );

    const result = await client.analyze({ system: 's', context: 'c', outputSchema: 'sc' });
    expect(result.provider).toBe('doubao');
    expect(result.winProbability.teamA).toBe(0.6);
    expect(result.winProbability.teamB).toBe(0.4);
    expect(result.confidence).toBe(70);
    expect(result.reasoning).toBe('FURIA更强');
    expect(result.tokenUsage.totalTokens).toBe(150);
  });

  it('analyze() 在 HTTP 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'bad request' }, false, 400));

    await expect(
      client.analyze({ system: 's', context: 'c', outputSchema: 'sc' }),
    ).rejects.toThrow('Doubao API error: 400');
  });

  it('complete() 返回文本内容', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: '回复内容' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

    const result = await client.complete({ system: '系统', user: '用户' });
    expect(result).toBe('回复内容');

    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callArgs.messages[0].content).toBe('系统');
    expect(callArgs.messages[1].content).toBe('用户');
  });

  it('testConnection 成功时返回 true', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, true, 200));
    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it('testConnection 失败时返回 false', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Auth error'));
    const result = await client.testConnection();
    expect(result).toBe(false);
  });
});
