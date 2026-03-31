import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@loyalty/db', () => ({
  prisma: {
    merchant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
}));

import { POST } from '../confirm/route';
import { prisma } from '@loyalty/db';
import { encrypt } from '@/lib/crypto';

const findUniqueMock = vi.mocked(prisma.merchant.findUnique);
const updateMock = vi.mocked(prisma.merchant.update);

// ── Helpers ────────────────────────────────────────────────────────

const SHOP_SECRET = 'test-shop-secret';

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function buildConfirmRequest(
  body: Record<string, unknown>,
  signature?: string,
): NextRequest {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (signature) {
    headers['shopware-shop-signature'] = signature;
  }
  return new NextRequest('https://app.example.com/api/app/confirm', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

function fakeMerchant(overrides?: Record<string, unknown>) {
  return {
    id: 'uuid-merchant-1',
    shopId: 'shop-123',
    shopUrl: 'https://myshop.example.com',
    shopSecret: `encrypted:${SHOP_SECRET}`,
    apiKey: '',
    secretKey: '',
    settingsJson: {},
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/app/confirm', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    vi.resetAllMocks();
    // Re-apply default implementations after reset
    vi.mocked(encrypt).mockImplementation((v: string) => `encrypted:${v}`);
    vi.mocked(prisma.merchant.update).mockResolvedValue(fakeMerchant() as never);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('returns 200 and activates the merchant with encrypted credentials', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = {
      apiKey: 'sw-api-key-abc',
      secretKey: 'sw-secret-key-xyz',
      timestamp: 1700000000,
      shopUrl: 'https://myshop.example.com',
      shopId: 'shop-123',
    };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildConfirmRequest(body, signature);

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateCall = updateMock.mock.calls[0][0];
    expect(updateCall.where).toEqual({ shopId: 'shop-123' });
    expect(updateCall.data.apiKey).toBe('encrypted:sw-api-key-abc');
    expect(updateCall.data.secretKey).toBe('encrypted:sw-secret-key-xyz');
    expect(updateCall.data.active).toBe(true);
  });

  it('actually encrypts credentials (not stored as plaintext)', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = {
      apiKey: 'raw-api-key',
      secretKey: 'raw-secret-key',
      timestamp: 1700000000,
      shopUrl: 'https://myshop.example.com',
      shopId: 'shop-123',
    };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildConfirmRequest(body, signature);

    await POST(request);

    expect(encrypt).toHaveBeenCalledWith('raw-api-key');
    expect(encrypt).toHaveBeenCalledWith('raw-secret-key');
  });

  it('returns 401 for an invalid signature', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = {
      apiKey: 'key',
      secretKey: 'secret',
      timestamp: 1700000000,
      shopUrl: 'https://myshop.example.com',
      shopId: 'shop-123',
    };
    const request = buildConfirmRequest(body, 'wrong-signature');

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the signature header is missing', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = {
      apiKey: 'key',
      secretKey: 'secret',
      shopId: 'shop-123',
    };
    const request = buildConfirmRequest(body); // no signature

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when shopId is unknown', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const body = {
      apiKey: 'key',
      secretKey: 'secret',
      timestamp: 1700000000,
      shopUrl: 'https://myshop.example.com',
      shopId: 'unknown-shop',
    };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildConfirmRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when shopId is missing from body', async () => {
    const body = { apiKey: 'key', secretKey: 'secret' };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildConfirmRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when apiKey is missing from body', async () => {
    const body = { shopId: 'shop-123', secretKey: 'secret' };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildConfirmRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
