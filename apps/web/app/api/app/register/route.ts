import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@loyalty/db';
import { encrypt } from '@/lib/crypto';
import { badRequest, serverError, unauthorized } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  generateProof,
  verifyRegistrationSignature,
} from '@/lib/shopware-auth';
import { DEFAULT_MERCHANT_SETTINGS } from '@/lib/validation';

const log = createLogger('app/register');

/**
 * GET /api/app/register
 *
 * Shopware app registration handshake.
 *
 * Shopware sends query params: `shop-id`, `shop-url`, `timestamp`
 * with an HMAC signature in the `shopware-app-signature` header.
 *
 * The app verifies the signature, creates/updates the merchant record,
 * and returns `{ proof, secret, confirmation_url }`.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get('shop-id');
    const shopUrl = url.searchParams.get('shop-url');
    const timestamp = url.searchParams.get('timestamp');

    if (!shopId || !shopUrl || !timestamp) {
      return badRequest('Missing required query parameters: shop-id, shop-url, timestamp');
    }

    const signature = request.headers.get('shopware-app-signature');
    if (!signature) {
      return unauthorized();
    }

    // Shopware signs the query string (everything after '?') with APP_SECRET
    const queryString = url.search.slice(1); // remove leading '?'
    if (!verifyRegistrationSignature(queryString, signature)) {
      log.warn({ shopId }, 'Invalid registration signature');
      return unauthorized();
    }

    // Generate a cryptographically random shared secret
    const shopSecret = randomBytes(64).toString('hex');

    const appSecret = process.env.APP_SECRET;
    if (!appSecret) {
      log.error('APP_SECRET environment variable is not set');
      return serverError('Server configuration error');
    }

    const appName = process.env.APP_NAME || 'LoyaltyApp';
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      log.error('APP_URL environment variable is not set');
      return serverError('Server configuration error');
    }

    const proof = generateProof(shopId, shopUrl, appName, appSecret);

    // Upsert: a merchant may reinstall after uninstalling
    await prisma.merchant.upsert({
      where: { shopId },
      create: {
        shopId,
        shopUrl,
        shopSecret: encrypt(shopSecret),
        apiKey: '',
        secretKey: '',
        settingsJson: DEFAULT_MERCHANT_SETTINGS,
        active: false,
      },
      update: {
        shopUrl,
        shopSecret: encrypt(shopSecret),
        active: false,
      },
    });

    log.info({ shopId, shopUrl }, 'App registration started');

    return NextResponse.json({
      proof,
      secret: shopSecret,
      confirmation_url: `${appUrl}/api/app/confirm`,
    });
  } catch (error) {
    log.error({ error }, 'Registration failed');
    return serverError('Registration failed');
  }
}
