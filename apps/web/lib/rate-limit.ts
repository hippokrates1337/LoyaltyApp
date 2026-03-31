interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * NOTE: In-memory only — does not persist across server restarts
 * and does not work across multiple instances. Acceptable for MVP.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    store.set(key, entry);
    return { success: false, remaining: 0 };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return { success: true, remaining: limit - entry.timestamps.length };
}

/**
 * Clear all rate limit entries. Useful for testing.
 */
export function resetRateLimitStore(): void {
  store.clear();
}
