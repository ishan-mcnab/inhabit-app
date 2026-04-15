export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export class AppCache {
  private store = new Map<string, CacheEntry<unknown>>()

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    })
  }

  get<T>(key: string): T | null {
    const e = this.store.get(key) as CacheEntry<T> | undefined
    if (!e) return null
    if (Date.now() - e.timestamp > e.ttl) {
      this.store.delete(key)
      return null
    }
    return e.data
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  invalidatePrefix(prefix: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k)
    }
  }

  clear(): void {
    this.store.clear()
  }
}

export const appCache = new AppCache()

export function profileCacheKey(userId: string): string {
  return `profile:${userId}`
}

export function goalsCacheKey(userId: string): string {
  return `goals:${userId}`
}

export function missionsCacheKey(userId: string, dateYmd: string): string {
  return `missions:${userId}:${dateYmd}`
}

export function habitsCacheKey(userId: string): string {
  return `habits:${userId}`
}
