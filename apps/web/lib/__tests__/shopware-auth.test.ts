import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyRegistrationSignature,
  verifyWebhookSignature,
  verifyIframeHandshake,
  generateProof,
} from '../shopware-auth';

const APP_SECRET = 'test-app-secret';
const SHOP_SECRET = 'test-shop-secret';

function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

describe('verifyRegistrationSignature', () => {
  beforeEach(() => {
    process.env.APP_SECRET = APP_SECRET;
  });

  afterEach(() => {
    delete process.env.APP_SECRET;
  });

  it('returns true for valid signature', () => {
    const query = 'shop-id=abc&shop-url=https://shop.example.com&timestamp=1234';
    const sig = hmac(query, APP_SECRET);
    expect(verifyRegistrationSignature(query, sig)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const query = 'shop-id=abc';
    expect(verifyRegistrationSignature(query, 'invalid-hex')).toBe(false);
  });

  it('returns false for non-hex signature without throwing', () => {
    const query = 'shop-id=abc';
    // 64-char string with non-hex characters — same length as a valid SHA-256 hex digest
    const badSig = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    expect(verifyRegistrationSignature(query, badSig)).toBe(false);
  });

  it('returns false for tampered query string', () => {
    const query = 'shop-id=abc';
    const sig = hmac(query, APP_SECRET);
    expect(verifyRegistrationSignature('shop-id=xyz', sig)).toBe(false);
  });

  it('throws when APP_SECRET is missing', () => {
    delete process.env.APP_SECRET;
    expect(() => verifyRegistrationSignature('query', 'sig')).toThrow(
      'APP_SECRET environment variable is not set',
    );
  });
});

describe('verifyWebhookSignature', () => {
  it('returns true for valid HMAC', () => {
    const body = '{"source":{"shopId":"abc"},"data":{}}';
    const sig = hmac(body, SHOP_SECRET);
    expect(verifyWebhookSignature(body, sig, SHOP_SECRET)).toBe(true);
  });

  it('returns false for tampered body', () => {
    const body = '{"original": true}';
    const sig = hmac(body, SHOP_SECRET);
    expect(verifyWebhookSignature('{"tampered": true}', sig, SHOP_SECRET)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const body = '{"data": 1}';
    const sig = hmac(body, SHOP_SECRET);
    expect(verifyWebhookSignature(body, sig, 'wrong-secret')).toBe(false);
  });
});

describe('verifyIframeHandshake', () => {
  function makeParams(overrides?: Record<string, string>) {
    const now = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      'shop-id': 'shop-123',
      'shop-url': 'https://shop.example.com',
      'sw-version': '6.7.0',
      timestamp: String(now),
      ...overrides,
    };

    // Build the verification string (sorted keys, excluding signature)
    const sorted = new URLSearchParams();
    for (const key of Object.keys(params).sort()) {
      sorted.set(key, params[key]);
    }
    const sig = hmac(sorted.toString(), SHOP_SECRET);
    params['shopware-shop-signature'] = sig;

    return new URLSearchParams(params);
  }

  it('returns true for valid params', () => {
    const params = makeParams();
    expect(verifyIframeHandshake(params, SHOP_SECRET)).toBe(true);
  });

  it('returns false for expired timestamp', () => {
    const expired = Math.floor(Date.now() / 1000) - 6 * 60; // 6 minutes ago
    const params = makeParams({ timestamp: String(expired) });
    expect(verifyIframeHandshake(params, SHOP_SECRET)).toBe(false);
  });

  it('returns false when signature is missing', () => {
    const params = new URLSearchParams({
      'shop-id': 'shop-123',
      'shop-url': 'https://shop.example.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    expect(verifyIframeHandshake(params, SHOP_SECRET)).toBe(false);
  });

  it('returns false when timestamp is missing', () => {
    const params = new URLSearchParams({
      'shop-id': 'shop-123',
      'shopware-shop-signature': 'abc',
    });
    expect(verifyIframeHandshake(params, SHOP_SECRET)).toBe(false);
  });

  it('returns false for wrong shop secret', () => {
    const params = makeParams();
    expect(verifyIframeHandshake(params, 'wrong-secret')).toBe(false);
  });
});

describe('generateProof', () => {
  it('produces expected HMAC', () => {
    const shopId = 'shop-123';
    const shopUrl = 'https://shop.example.com';
    const appName = 'LoyaltyApp';
    const proof = generateProof(shopId, shopUrl, appName, APP_SECRET);
    const expected = hmac(`${shopId}${shopUrl}${appName}`, APP_SECRET);
    expect(proof).toBe(expected);
  });

  it('different inputs produce different proofs', () => {
    const a = generateProof('shop-1', 'https://a.com', 'App', APP_SECRET);
    const b = generateProof('shop-2', 'https://b.com', 'App', APP_SECRET);
    expect(a).not.toBe(b);
  });
});
