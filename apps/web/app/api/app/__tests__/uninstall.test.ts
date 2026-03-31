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
    reviewRequest: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
}));

import { POST } from '../uninstall/route';
import { prisma } from '@loyalty/db';
import { decrypt } from '@/lib/crypto';

const findUniqueMock = vi.mocked(prisma.merchant.findUnique);
const transactionMock = vi.mocked(prisma.$transaction);

// ── Helpers ────────────────────────────────────────────────────────

const SHOP_SECRET = 'test-shop-secret';

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function buildUninstallRequest(
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
  return new NextRequest('https://app.example.com/api/app/uninstall', {
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
    apiKey: 'encrypted:api-key',
    secretKey: 'encrypted:secret-key',
    settingsJson: {},
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/app/uninstall', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    vi.resetAllMocks();
    // Re-apply default decrypt implementation after reset
    vi.mocked(decrypt).mockImplementation((v: string) => v.replace('encrypted:', ''));
    transactionMock.mockResolvedValue([] as never);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('returns 200 and calls $transaction to deactivate merchant and cancel scheduled requests', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = { source: { shopId: 'shop-123' } };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildUninstallRequest(body, signature);

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);

    // The transaction receives an array of two Prisma promises
    const transactionArg = transactionMock.mock.calls[0][0];
    expect(transactionArg).toHaveLength(2);
  });

  it('returns 401 for an invalid signature', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = { source: { shopId: 'shop-123' } };
    const request = buildUninstallRequest(body, 'wrong-signature');

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the signature header is missing', async () => {
    findUniqueMock.mockResolvedValueOnce(fakeMerchant() as never);

    const body = { source: { shopId: 'shop-123' } };
    const request = buildUninstallRequest(body); // no signature

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when shopId is unknown', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const body = { source: { shopId: 'unknown-shop' } };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildUninstallRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when source.shopId is missing from body', async () => {
    const body = { source: {} };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildUninstallRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 401 when source is missing from body', async () => {
    const body = { data: { something: true } };
    const rawBody = JSON.stringify(body);
    const signature = hmac(rawBody, SHOP_SECRET);
    const request = buildUninstallRequest(body, signature);

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
