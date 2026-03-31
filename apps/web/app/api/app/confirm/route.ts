import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@loyalty/db';
import { encrypt, decrypt } from '@/lib/crypto';
import { serverError, unauthorized } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { readRawBodyAndJson } from '@/lib/request-helpers';
import { verifyWebhookSignature } from '@/lib/shopware-auth';

const log = createLogger('app/confirm');

/**
 * POST /api/app/confirm
 *
 * Shopware app registration confirmation.
 *
 * After registration, Shopware sends the API credentials:
 * `{ apiKey, secretKey, timestamp, shopUrl, shopId }`
 * signed with the merchant's `shopSecret` via the
 * `shopware-shop-signature` header.
 *
 * The app verifies the signature, encrypts and stores the
 * credentials, and activates the merchant.
 */
export async function POST(request: NextRequest) {
  try {
    const { rawBody, json } = await readRawBodyAndJson(request);

    const shopId = json.shopId as string | undefined;
    const apiKey = json.apiKey as string | undefined;
    const secretKey = json.secretKey as string | undefined;

    if (!shopId || !apiKey || !secretKey) {
      return unauthorized();
    }

    const signature = request.headers.get('shopware-shop-signature');
    if (!signature) {
      return unauthorized();
    }

    // Look up the merchant (registration must have happened first)
    const merchant = await prisma.merchant.findUnique({
      where: { shopId },
    });
    if (!merchant) {
      log.warn({ shopId }, 'Confirm received for unknown shopId');
      return unauthorized();
    }

    // Decrypt the stored shop secret and verify the signature
    const shopSecret = decrypt(merchant.shopSecret);
    if (!verifyWebhookSignature(rawBody, signature, shopSecret)) {
      log.warn({ shopId }, 'Invalid confirmation signature');
      return unauthorized();
    }

    // Encrypt and store the API credentials, activate the merchant
    await prisma.merchant.update({
      where: { shopId },
      data: {
        apiKey: encrypt(apiKey),
        secretKey: encrypt(secretKey),
        active: true,
      },
    });

    log.info({ shopId }, 'App registration confirmed — merchant active');

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Confirmation failed');
    return serverError('Confirmation failed');
  }
}
