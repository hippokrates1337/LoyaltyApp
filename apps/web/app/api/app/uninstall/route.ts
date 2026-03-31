import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@loyalty/db';
import { decrypt } from '@/lib/crypto';
import { serverError, unauthorized } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { readRawBodyAndJson } from '@/lib/request-helpers';
import { verifyWebhookSignature } from '@/lib/shopware-auth';

const log = createLogger('app/uninstall');

/**
 * POST /api/app/uninstall
 *
 * Called when a merchant uninstalls the app from their Shopware store.
 *
 * Shopware sends a webhook-style payload with `source.shopId`.
 * The signature is verified against the merchant's stored `shopSecret`.
 *
 * On valid request the app:
 * 1. Soft-deletes the merchant (active = false)
 * 2. Cancels all `scheduled` review requests for this merchant
 */
export async function POST(request: NextRequest) {
  try {
    const { rawBody, json } = await readRawBodyAndJson(request);

    const source = json.source as Record<string, unknown> | undefined;
    const shopId = source?.shopId as string | undefined;

    if (!shopId) {
      return unauthorized();
    }

    const signature = request.headers.get('shopware-shop-signature');
    if (!signature) {
      return unauthorized();
    }

    const merchant = await prisma.merchant.findUnique({
      where: { shopId },
    });
    if (!merchant) {
      log.warn({ shopId }, 'Uninstall received for unknown shopId');
      return unauthorized();
    }

    const shopSecret = decrypt(merchant.shopSecret);
    if (!verifyWebhookSignature(rawBody, signature, shopSecret)) {
      log.warn({ shopId }, 'Invalid uninstall signature');
      return unauthorized();
    }

    // Soft-delete merchant and cancel all pending review requests in a transaction
    await prisma.$transaction([
      prisma.merchant.update({
        where: { shopId },
        data: { active: false },
      }),
      prisma.reviewRequest.updateMany({
        where: {
          merchantId: merchant.id,
          status: 'scheduled',
        },
        data: { status: 'cancelled' },
      }),
    ]);

    log.info({ shopId }, 'App uninstalled — merchant deactivated, pending requests cancelled');

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Uninstall failed');
    return serverError('Uninstall failed');
  }
}
