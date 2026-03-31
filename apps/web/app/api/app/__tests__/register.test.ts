import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@loyalty/db', () => ({
  prisma: {
    merchant: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
}));

// Don't mock shopware-auth — use the real functions so we test signature logic end-to-end

import { GET } from '../register/route';
import { prisma } from '@loyalty/db';

// ── Helpers ────────────────────────────────────────────────────────

const APP_SECRET = 'test-app-secret';
const APP_NAME = 'LoyaltyApp';
const APP_URL = 'https://app.example.com';

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function buildRegisterRequest(
  params: Record<string, string>,
  signature?: string,
): NextRequest {
  const qs = new URLSearchParams(params).toString();
  const url = `https://app.example.com/api/app/register?${qs}`;
  const headers: Record<string, string> = {};
  if (signature) {
    headers['shopware-app-signature'] = signature;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GET /api/app/register', () => {
  beforeEach(() => {
    process.env.APP_SECRET = APP_SECRET;
    process.env.APP_NAME = APP_NAME;
    process.env.APP_URL = APP_URL;
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APP_SECRET;
    delete process.env.APP_NAME;
    delete process.env.APP_URL;
    delete process.env.ENCRYPTION_KEY;
  });

  it('returns 200 with proof, secret, and confirmation_url for a valid signature', async () => {
    const params = {
      'shop-id': 'shop-123',
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proof).toBeDefined();
    expect(typeof body.proof).toBe('string');
    expect(body.secret).toBeDefined();
    expect(typeof body.secret).toBe('string');
    expect(body.secret.length).toBe(128); // 64 random bytes → 128 hex chars
    expect(body.confirmation_url).toBe(`${APP_URL}/api/app/confirm`);
  });

  it('proof is the HMAC of shopId + shopUrl + appName', async () => {
    const params = {
      'shop-id': 'shop-123',
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    const response = await GET(request);
    const body = await response.json();

    const expectedProof = hmac('shop-123https://myshop.example.comLoyaltyApp', APP_SECRET);
    expect(body.proof).toBe(expectedProof);
  });

  it('upserts the merchant with encrypted shopSecret and default settings', async () => {
    const params = {
      'shop-id': 'shop-456',
      'shop-url': 'https://another-shop.example.com',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    await GET(request);

    expect(prisma.merchant.upsert).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.merchant.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ shopId: 'shop-456' });
    expect(call.create.shopId).toBe('shop-456');
    expect(call.create.shopUrl).toBe('https://another-shop.example.com');
    expect(call.create.shopSecret).toMatch(/^encrypted:/); // was passed through encrypt()
    expect(call.create.apiKey).toBe('');
    expect(call.create.secretKey).toBe('');
    expect(call.create.active).toBe(false);
    expect(call.update.active).toBe(false);
    expect(call.update.shopSecret).toMatch(/^encrypted:/);
  });

  it('returns 401 for an invalid signature', async () => {
    const params = {
      'shop-id': 'shop-123',
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const request = buildRegisterRequest(params, 'invalid-signature');

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const params = {
      'shop-id': 'shop-123',
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const request = buildRegisterRequest(params); // no signature

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when shop-id is missing', async () => {
    const params = {
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when shop-url is missing', async () => {
    const params = {
      'shop-id': 'shop-123',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 when timestamp is missing', async () => {
    const params = {
      'shop-id': 'shop-123',
      'shop-url': 'https://myshop.example.com',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);
    const request = buildRegisterRequest(params, signature);

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('handles re-registration (reinstall) — upserts, returns new secret', async () => {
    const params = {
      'shop-id': 'existing-shop',
      'shop-url': 'https://myshop.example.com',
      timestamp: '1700000000',
    };
    const qs = new URLSearchParams(params).toString();
    const signature = hmac(qs, APP_SECRET);

    const req1 = buildRegisterRequest(params, signature);
    const res1 = await GET(req1);
    const body1 = await res1.json();

    const req2 = buildRegisterRequest(params, signature);
    const res2 = await GET(req2);
    const body2 = await res2.json();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Each registration generates a new random secret
    expect(body1.secret).not.toBe(body2.secret);
    expect(prisma.merchant.upsert).toHaveBeenCalledTimes(2);
  });
});
