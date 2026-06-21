import { describe, it, expect } from 'vitest';
import { RequestDedup } from '../services/request-dedup';

describe('RequestDedup', () => {
  it('returns the result of the function', async () => {
    const dedup = new RequestDedup<number>();
    const result = await dedup.run('test', async () => 42);
    expect(result).toBe(42);
  });

  it('deduplicates concurrent requests with the same key', async () => {
    const dedup = new RequestDedup<string>();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return `result-${callCount}`;
    };

    // Launch 3 concurrent requests with the same key
    const [r1, r2, r3] = await Promise.all([
      dedup.run('same-key', fn),
      dedup.run('same-key', fn),
      dedup.run('same-key', fn),
    ]);

    // All should get the same result (fn only called once)
    expect(callCount).toBe(1);
    expect(r1).toBe('result-1');
    expect(r2).toBe('result-1');
    expect(r3).toBe('result-1');
  });

  it('does not deduplicate requests with different keys', async () => {
    const dedup = new RequestDedup<number>();
    let callCount = 0;

    const fn = async (val: number) => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return val * 2;
    };

    const [r1, r2] = await Promise.all([
      dedup.run('key-a', () => fn(5)),
      dedup.run('key-b', () => fn(10)),
    ]);

    expect(callCount).toBe(2);
    expect(r1).toBe(10);
    expect(r2).toBe(20);
  });

  it('cleans up in-flight entry after completion', async () => {
    const dedup = new RequestDedup<number>();

    await dedup.run('cleanup-test', async () => 1);

    expect(dedup.has('cleanup-test')).toBe(false);
  });

  it('cleans up in-flight entry after rejection', async () => {
    const dedup = new RequestDedup<number>();

    await expect(
      dedup.run('reject-test', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(dedup.has('reject-test')).toBe(false);
  });

  it('allows re-running the same key after completion', async () => {
    const dedup = new RequestDedup<number>();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return callCount;
    };

    const r1 = await dedup.run('rerun', fn);
    const r2 = await dedup.run('rerun', fn);

    expect(callCount).toBe(2);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('has() returns true for in-flight requests', async () => {
    const dedup = new RequestDedup<number>();

    const promise = dedup.run('inflight', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    });

    expect(dedup.has('inflight')).toBe(true);

    await promise;

    expect(dedup.has('inflight')).toBe(false);
  });

  it('clear() removes all in-flight entries', async () => {
    const dedup = new RequestDedup<number>();

    // Start a slow request
    const promise = dedup.run('clear-test', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    });

    expect(dedup.has('clear-test')).toBe(true);

    dedup.clear();

    expect(dedup.has('clear-test')).toBe(false);

    // The promise should still resolve (clear doesn't cancel)
    await expect(promise).resolves.toBe(1);
  });
});
