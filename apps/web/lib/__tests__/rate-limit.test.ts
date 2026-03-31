import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rateLimit, resetRateLimitStore } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    resetRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const result = rateLimit('ip-1', 5, 60_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks remaining count correctly', () => {
    rateLimit('ip-2', 3, 60_000);
    rateLimit('ip-2', 3, 60_000);
    const third = rateLimit('ip-2', 3, 60_000);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('ip-3', 3, 60_000);
    }
    const blocked = rateLimit('ip-3', 3, 60_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after the time window passes', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('ip-4', 3, 60_000);
    }
    expect(rateLimit('ip-4', 3, 60_000).success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(60_001);

    const result = rateLimit('ip-4', 3, 60_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('different keys are independent', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('ip-a', 3, 60_000);
    }
    expect(rateLimit('ip-a', 3, 60_000).success).toBe(false);
    expect(rateLimit('ip-b', 3, 60_000).success).toBe(true);
  });

  it('sliding window evicts old entries', () => {
    rateLimit('ip-5', 2, 10_000);
    vi.advanceTimersByTime(5_000);
    rateLimit('ip-5', 2, 10_000);

    // First request should still be in window — limit reached
    expect(rateLimit('ip-5', 2, 10_000).success).toBe(false);

    // Advance past first request's window
    vi.advanceTimersByTime(5_001);

    // First request evicted, second still in window — one slot open
    const result = rateLimit('ip-5', 2, 10_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });
});
