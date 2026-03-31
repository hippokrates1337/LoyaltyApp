import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/dashboard
 *
 * Returns dashboard summary stats for the authenticated merchant.
 * Authenticated via Shopware iframe handshake.
 *
 * Returns: { totalReviews, pendingCount, averageRating }
 */
export async function GET(request: NextRequest) {
  // TODO: Implement dashboard stats
  // 1. Verify Shopware iframe handshake (shop-id, timestamp, sw-version, HMAC)
  // 2. Query aggregate stats for the merchant

  return NextResponse.json(
    { totalReviews: 0, pendingCount: 0, averageRating: 0 },
  );
}
