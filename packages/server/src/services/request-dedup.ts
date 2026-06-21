/**
 * Request deduplication utility.
 * Prevents thundering herd — if multiple callers request the same key
 * while an in-flight request is pending, they all share the same Promise.
 */
export class RequestDedup<T> {
  private inflight = new Map<string, Promise<T>>();

  /**
   * Execute a function with deduplication by key.
   * If a request with the same key is already in-flight, returns its Promise.
   * Otherwise, starts a new request and caches its Promise.
   */
  async run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Check if a key is currently in-flight */
  has(key: string): boolean {
    return this.inflight.has(key);
  }

  /** Clear all in-flight requests (does not cancel them) */
  clear(): void {
    this.inflight.clear();
  }
}
