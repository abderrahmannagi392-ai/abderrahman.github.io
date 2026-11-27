interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryTtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 30_000): void {
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(500, ttlMs),
    });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }

  getStats() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now > v.expiresAt) {
        this.store.delete(k);
      }
    }
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

export const appCache = new MemoryTtlCache(1200);
