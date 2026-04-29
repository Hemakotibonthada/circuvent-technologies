// ============================================================================
// CACHE LAYER — In-memory cache with TTL, hit/miss stats, and admin visibility
// ============================================================================

export interface CacheEntry<T = unknown> {
  data: T;
  createdAt: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: string;
  entries: { key: string; hits: number; age: string; ttl: string; size: string }[];
  memoryUsage: string;
}

class AppCache {
  private store = new Map<string, CacheEntry>();
  private totalHits = 0;
  private totalMisses = 0;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttl) {
      this.store.delete(key);
      this.totalMisses++;
      return null;
    }

    entry.hits++;
    this.totalHits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = 60_000): void {
    this.store.set(key, {
      data,
      createdAt: Date.now(),
      ttl: ttlMs,
      hits: 0,
    });
  }

  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  invalidatePattern(pattern: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  getStats(): CacheStats {
    const entries: CacheStats["entries"] = [];
    const now = Date.now();

    for (const [key, entry] of this.store) {
      const ageSec = Math.round((now - entry.createdAt) / 1000);
      const ttlSec = Math.round(entry.ttl / 1000);
      const size = JSON.stringify(entry.data).length;

      entries.push({
        key,
        hits: entry.hits,
        age: ageSec < 60 ? `${ageSec}s` : `${Math.round(ageSec / 60)}m`,
        ttl: ttlSec < 60 ? `${ttlSec}s` : `${Math.round(ttlSec / 60)}m`,
        size: size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`,
      });
    }

    entries.sort((a, b) => b.hits - a.hits);
    const total = this.totalHits + this.totalMisses;

    return {
      totalEntries: this.store.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate: total > 0 ? `${((this.totalHits / total) * 100).toFixed(1)}%` : "0%",
      entries,
      memoryUsage: this.estimateMemory(),
    };
  }

  private estimateMemory(): string {
    let totalBytes = 0;
    for (const [key, entry] of this.store) {
      totalBytes += key.length * 2; // UTF-16
      totalBytes += JSON.stringify(entry.data).length * 2;
    }
    if (totalBytes > 1048576) return `${(totalBytes / 1048576).toFixed(1)}MB`;
    if (totalBytes > 1024) return `${(totalBytes / 1024).toFixed(1)}KB`;
    return `${totalBytes}B`;
  }
}

// Singleton
const globalForCache = globalThis as unknown as { appCache?: AppCache };
export const appCache = globalForCache.appCache ??= new AppCache();
