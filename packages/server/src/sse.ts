import type { Response } from 'express';

/**
 * SSE (Server-Sent Events) helper for streaming LLM responses.
 *
 * Usage in Express route:
 *   const stream = createSSEStream(res);
 *   for await (const chunk of llmClient.stream(prompt)) {
 *     stream.send('token', { text: chunk });
 *   }
 *   stream.done();
 */

export interface SSEStream {
  send(event: string, data: unknown): void;
  done(): void;
  error(message: string): void;
}

export function createSSEStream(res: Response): SSEStream {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  });

  // Send initial comment to establish connection
  res.write(':ok\n\n');

  return {
    send(event: string, data: unknown) {
      const payload = JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    },

    done() {
      res.write('event: done\ndata: {}\n\n');
      res.end();
    },

    error(message: string) {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    },
  };
}

/**
 * Parse SSE stream from a fetch Response.
 */
export async function* parseSSEStream(response: globalThis.Response): AsyncGenerator<{ event: string; data: string }> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
        // Empty line = end of event
      }
    }
  } finally {
    reader.releaseLock();
  }
}
