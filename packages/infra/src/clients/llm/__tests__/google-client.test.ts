import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleClient } from '../google-client';

describe('GoogleClient', () => {
  let client: GoogleClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new GoogleClient('test-key');
  });

  it('在 analyze() 请求体中为 Gemini 3.5 添加 thinkingConfig', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      }),
    });

    await client.analyze({ system: '系统提示', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'medium' });
    expect(body.generationConfig.temperature).toBe(0.3);
    // URL 应包含模型名和 generateContent
    expect(mockFetch.mock.calls[0][0]).toContain('gemini-3.5-flash');
    expect(mockFetch.mock.calls[0][0]).toContain('generateContent');
  });

  it('在 complete() 请求体中为 Gemini 3.5 添加 thinkingConfig', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '回复内容' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      }),
    });

    await client.complete({ system: '系统', user: '用户' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'medium' });
  });

  it('非 Gemini 3.5 模型不添加 thinkingConfig', async () => {
    const oldClient = new GoogleClient('test-key', 'gemini-2.0-flash');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"winProbability":{"yes":0.6,"no":0.4},"confidence":70,"reasoning":"测试","keyFactors":["因素1"],"riskAssessment":"低风险"}' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      }),
    });

    await oldClient.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('API 错误时抛出异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.analyze({ system: '系统', context: '上下文', outputSchema: 'schema' }))
      .rejects.toThrow('Google API error: 400');
  });
});
