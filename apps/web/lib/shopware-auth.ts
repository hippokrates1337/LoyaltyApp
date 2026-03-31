import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe comparison of two hex-encoded strings.
 * Returns false (instead of throwing) for malformed input.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Compute HMAC-SHA256 and return the hex digest.
 */
function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify the signature Shopware sends during app registration.
 *
 * Shopware signs the query string (without leading `?`) with the app secret
 * and includes the result in the `shopware-app-signature` header.
 */
export function verifyRegistrationSignature(
  queryString: string,
  signature: string,
): boolean {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    throw new Error('APP_SECRET environment variable is not set');
  }
  const expected = hmacSha256(queryString, appSecret);
  return safeCompare(expected, signature);
}

/**
 * Verify the HMAC-SHA256 signature on incoming Shopware webhooks.
 *
 * Shopware signs the raw request body with the merchant's `shop_secret`
 * and includes the result in the `shopware-shop-signature` header.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  shopSecret: string,
): boolean {
  const expected = hmacSha256(body, shopSecret);
  return safeCompare(expected, signature);
}

/**
 * Verify the Shopware admin iframe handshake.
 *
 * Query params include `shop-id`, `shop-url`, `timestamp`, `sw-version`,
 * and `shopware-shop-signature`. The signature covers the other params
 * in alphabetical key order, joined as a query string.
 */
export function verifyIframeHandshake(
  queryParams: URLSearchParams,
  shopSecret: string,
): boolean {
  const signature = queryParams.get('shopware-shop-signature');
  if (!signature) return false;

  const timestampStr = queryParams.get('timestamp');
  if (!timestampStr) return false;

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  const MAX_AGE_SECONDS = 5 * 60;
  if (isNaN(timestamp) || now - timestamp > MAX_AGE_SECONDS) {
    return false;
  }

  const paramsToVerify = new URLSearchParams();
  const sortedKeys = Array.from(queryParams.keys())
    .filter((k) => k !== 'shopware-shop-signature')
    .sort();

  for (const key of sortedKeys) {
    paramsToVerify.set(key, queryParams.get(key)!);
  }

  const expected = hmacSha256(paramsToVerify.toString(), shopSecret);
  return safeCompare(expected, signature);
}

/**
 * Generate the proof hash for the app registration response.
 *
 * HMAC-SHA256 of `shopId + shopUrl + appName` using the app secret.
 */
export function generateProof(
  shopId: string,
  shopUrl: string,
  appName: string,
  appSecret: string,
): string {
  return hmacSha256(`${shopId}${shopUrl}${appName}`, appSecret);
}
