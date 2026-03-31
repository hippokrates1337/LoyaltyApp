import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyCronSecret } from '../cron-auth';

const CRON_SECRET = 'my-super-secret-cron-token';

function makeRequest(headers: Record<string, string> = {}) {
  return {
    headers: new Headers(headers),
  } as unknown as import('next/server').NextRequest;
}

describe('verifyCronSecret', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns true when Authorization header matches', () => {
    const req = makeRequest({ authorization: `Bearer ${CRON_SECRET}` });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it('returns true when x-cron-secret header matches', () => {
    const req = makeRequest({ 'x-cron-secret': CRON_SECRET });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it('returns false when header is missing', () => {
    const req = makeRequest();
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when Authorization header has wrong value', () => {
    const req = makeRequest({ authorization: 'Bearer wrong-token' });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when Authorization header uses wrong scheme', () => {
    const req = makeRequest({ authorization: `Basic ${CRON_SECRET}` });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when CRON_SECRET env is not set', () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest({ authorization: `Bearer ${CRON_SECRET}` });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('prefers Authorization header over x-cron-secret', () => {
    const req = makeRequest({
      authorization: `Bearer ${CRON_SECRET}`,
      'x-cron-secret': 'wrong',
    });
    expect(verifyCronSecret(req)).toBe(true);
  });
});
