/**
 * SSE (Server-Sent Events) client utility for the frontend.
 * Used to stream LLM analysis results from the server.
 */

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse an SSE stream from a fetch Response.
 * Yields events as they arrive.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        yield { event: currentEvent, data };
      }
    }
  }
}

/**
 * Stream LLM analysis from the server via SSE.
 * Calls onProgress for each LLM result, and onComplete with the final aggregation.
 */
export async function streamAnalysis(
  url: string,
  body: Record<string, unknown>,
  callbacks: {
    onProgress?: (data: { provider: string; probability: number; confidence: number; reasoning: string }) => void;
    onComplete?: (data: { aggregation: unknown; kelly: unknown }) => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  const controller = new AbortController();
  // Connection timeout: only applies until response headers arrive.
  // SSE streams can take 60s+ for the first LLM result, so the connection
  // timeout must be short (just to detect server down), and the stream
  // timeout must be generous.
  const connectTimer = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(connectTimer);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Stream timeout: 5 minutes for the entire analysis to complete
  const streamTimer = setTimeout(() => controller.abort(), 300000);

  try {
    for await (const { event, data } of parseSSEStream(response)) {
      try {
        const parsed = JSON.parse(data);

        switch (event) {
          case 'llm_result':
            callbacks.onProgress?.(parsed);
            break;
          case 'result':
            callbacks.onComplete?.(parsed);
            break;
          case 'error':
            callbacks.onError?.(parsed.message ?? 'Analysis failed');
            break;
          case 'done':
            return;
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  } finally {
    clearTimeout(streamTimer);
  }
}
