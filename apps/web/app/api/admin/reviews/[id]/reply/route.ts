import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/reviews/[id]/reply
 *
 * Adds or updates the merchant's public reply to a review.
 * Body: { reply: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // TODO: Implement merchant reply
  // 1. Verify Shopware iframe handshake
  // 2. Validate body: { reply }
  // 3. Update review: set merchant_reply and merchant_reply_at
  // 4. Ensure review belongs to the authenticated merchant

  return NextResponse.json({ success: true, reviewId: id });
}
