import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'node:events';

// ── LRU Memory Cache ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new LRUCache<string, any>({
  max: 5000,
  ttl: 1000 * 60 * 5, // default 5 min TTL
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = cache.get(key);
  return (value as T) ?? null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  cache.set(key, value, { ttl: ttlSeconds * 1000 });
}

export async function cacheDelete(key: string): Promise<void> {
  cache.delete(key);
}

export async function cacheKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      keys.push(key);
    }
  }
  return keys;
}

// ── Event Emitter (replaces Redis Pub/Sub) ────────────────────

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export async function publish(channel: string, message: unknown): Promise<void> {
  emitter.emit(channel, message);
}

export async function subscribe(
  channel: string,
  handler: (message: unknown) => void,
): Promise<() => void> {
  emitter.on(channel, handler);
  return () => {
    emitter.off(channel, handler);
  };
}

// ── Cache stats ───────────────────────────────────────────────

export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: cache.size,
    maxSize: cache.max,
  };
}

export function clearCache(): void {
  cache.clear();
}
