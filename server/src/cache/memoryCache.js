/**
 * Minimal in-memory cache with a time-to-live. Good enough for this assignment's
 * scope (single instance, 5,000 requests/month cap) - a real multi-instance
 * deployment would swap this for Redis without changing the calling code, since
 * the get/set/has interface stays the same.
 */

const store = new Map();
const DEFAULT_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000; // 10 minutes

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** For the /health endpoint - lets us report cache size without exposing contents. */
export function cacheStats() {
  return { size: store.size, ttlMs: DEFAULT_TTL_MS };
}

export function clearCache() {
  store.clear();
}
